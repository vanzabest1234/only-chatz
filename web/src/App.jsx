import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken, setToken } from './api'
import { socket } from './socket'
import Background from './components/Background'
import AuthScreen from './components/AuthScreen'
import Sidebar from './components/Sidebar'
import ChatPane from './components/ChatPane'
import MembersPanel from './components/MembersPanel'
import SettingsModal from './components/SettingsModal'
import OnlineBoard from './components/OnlineBoard'
import RulesGate from './components/RulesGate'
import ProfileCard from './components/ProfileCard'
import FlairWheel from './components/FlairWheel'
import PassPanel from './components/PassPanel'
import CasinoPanel from './components/CasinoPanel'
import { playPing } from './lib/mentions'

export default function App() {
  const [me, setMe] = useState(null)
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState(null)
  const [messages, setMessages] = useState([])
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [flairOpen, setFlairOpen] = useState(false)
  const [passOpen, setPassOpen] = useState(false)
  const [casinoOpen, setCasinoOpen] = useState(false)
  const [ping, setPing] = useState(null)
  const pingTimer = useRef(null)
  const [where, setWhere] = useState({})
  const [replyTo, setReplyTo] = useState(null)
  const [profileId, setProfileId] = useState(null)
  const [typing, setTyping] = useState([])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesDeclined, setRulesDeclined] = useState(false)
  const [rulesBusy, setRulesBusy] = useState(false)
  const [rulesError, setRulesError] = useState('')

  const viewRef = useRef(view)
  viewRef.current = view

  const load = useCallback(async () => {
    const data = await api('/api/me')
    setMe(data)
    setWhere(data.where ?? {})
    return data
  }, [])

  const loadMessages = useCallback(async () => {
    const target = viewRef.current
    if (!target) return
    const path =
      target.type === 'channel'
        ? `/api/channels/${target.id}/messages`
        : `/api/dm/${target.id}/messages`
    const data = await api(path)
    setMessages(data.messages)
  }, [])

  const signOut = useCallback(() => {
    socket.disconnect()
    setToken(null)
    setMe(null)
    setMessages([])
    setView(null)
    setWhere({})
    setRulesOpen(false)
    setRulesDeclined(false)
    setProfileId(null)
  }, [])

  // A ping names the room it came from, so answering it is one tap.
  const answerPing = useCallback(payload => {
    window.clearTimeout(pingTimer.current)
    setPing(null)
    const room = payload?.room
    if (!room?.id) return
    setView({ type: room.kind === 'dm' ? 'dm' : 'channel', id: room.id })
    setSidebarOpen(false)
  }, [])

  // Tell the server which room we are looking at, so the online board can show it.
  const shareRoom = useCallback(() => {
    const target = viewRef.current
    if (!target || !socket.connected) return
    socket.emit('presence:where', { kind: target.type, id: target.id })
  }, [])

  // Tell the room someone is writing; the server expires the note after a few seconds.
  const shareTyping = useCallback(() => {
    const target = viewRef.current
    if (!target || !socket.connected) return
    socket.emit('typing', { kind: target.type, id: target.id })
  }, [])

  const finishAuth = useCallback(async () => {
    const data = await load()
    // Land in #general by name, so a fresh tab opens straight into the main room.
    const first = data.channels.find(channel => channel.name === 'general') ?? data.channels[0]
    setView(first ? { type: 'channel', id: first.id } : null)
  }, [load])

  useEffect(() => {
    if (!getToken()) {
      setBooting(false)
      return
    }
    finishAuth()
      .catch(() => {
        setToken(null)
        setMe(null)
      })
      .finally(() => setBooting(false))
  }, [finishAuth])

  useEffect(() => {
    if (!me) return

    socket.auth = { token: getToken() }
    if (!socket.connected) socket.connect()

    const refresh = () => {
      load().catch(() => {})
    }

    const handlers = {
      'message:new': message => {
        const target = viewRef.current
        const matches =
          target &&
          (target.type === 'channel'
            ? message.channelId === target.id
            : message.threadId === target.id)
        if (matches) {
          setMessages(previous =>
            previous.some(item => item.id === message.id) ? previous : [...previous, message],
          )
        }
        if (message.threadId) {
          setMe(previous =>
            previous
              ? {
                  ...previous,
                  threads: previous.threads.map(thread =>
                    thread.id === message.threadId ? { ...thread, lastMessage: message } : thread,
                  ),
                }
              : previous,
          )
        }
      },
      'message:update': message => {
        const target = viewRef.current
        const matches =
          target &&
          (target.type === 'channel'
            ? message.channelId === target.id
            : message.threadId === target.id)
        if (matches) {
          setMessages(previous =>
            previous.map(item => (item.id === message.id ? message : item)),
          )
        }
        setReplyTo(previous => (previous?.id === message.id ? { ...previous, ...message } : previous))
      },
      'message:delete': payload => {
        const id = payload?.id
        if (!id) return
        setMessages(previous => previous.filter(item => item.id !== id))
        setReplyTo(previous => (previous?.id === id ? null : previous))
      },
      'messages:refresh': () => {
        loadMessages().catch(() => {})
      },
      'members:refresh': refresh,
      'channels:refresh': refresh,
      'threads:refresh': refresh,
      'profile:update': refresh,
      'friends:update': ids =>
        setMe(previous => (previous ? { ...previous, friends: ids } : previous)),
      'presence:update': ids =>
        setMe(previous => (previous ? { ...previous, online: ids } : previous)),
      'presence:where': payload => setWhere(payload ?? {}),
      'typing:update': payload => {
        const target = viewRef.current
        if (!target || payload?.kind !== target.type || payload?.id !== target.id) return
        setTyping(Array.isArray(payload.names) ? payload.names : [])
      },
      // Someone said "@you": chime, and keep the toast up long enough to answer it.
      'ping:new': payload => {
        if (!payload?.message) return
        playPing()
        setPing(payload)
        window.clearTimeout(pingTimer.current)
        pingTimer.current = window.setTimeout(() => setPing(null), 12_000)
      },
      'pass:update': state =>
        setMe(previous =>
          previous ? { ...previous, user: { ...previous.user, pass: state } } : previous,
        ),
      // The ten-minute drip pays over the socket; the vault answers with the same shape.
      'coins:update': state =>
        setMe(previous =>
          previous ? { ...previous, user: { ...previous.user, coins: state } } : previous,
        ),
      connect: shareRoom,
      'session:revoke': payload => {
        setNotice(payload?.message || 'You were removed from this server.')
        signOut()
      },
    }

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler))
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler))
    }
  }, [me?.user?.id, load, loadMessages, signOut, shareRoom])

  useEffect(() => {
    shareRoom()
  }, [view?.type, view?.id, shareRoom])

  useEffect(() => {
    setReplyTo(null)
    setTyping([])
    if (!view) {
      setMessages([])
      return
    }
    loadMessages().catch(() => setMessages([]))
  }, [view, loadMessages])

  useEffect(() => {
    if (!notice || !me) return
    const timer = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [notice, me])

  // No agreement yet, no composer: the gate opens on its own until the account accepts.
  useEffect(() => {
    if (me && !me.user.rulesAccepted) setRulesOpen(true)
  }, [me?.user?.id, me?.user?.rulesAccepted])

  const openRules = () => {
    setRulesError('')
    setRulesOpen(true)
  }

  const acceptRules = async () => {
    setRulesBusy(true)
    setRulesError('')
    try {
      const data = await api('/api/rules/accept', { method: 'POST' })
      setMe(previous => (previous ? { ...previous, user: data.user } : previous))
      setRulesOpen(false)
      setRulesDeclined(false)
    } catch (problem) {
      setRulesError(problem.message)
    } finally {
      setRulesBusy(false)
    }
  }

  const declineRules = () => {
    setRulesOpen(false)
    setRulesDeclined(true)
  }

  const openChannel = channel => {
    setView({ type: 'channel', id: channel.id })
    setSidebarOpen(false)
  }

  const openDm = async userId => {
    try {
      const data = await api(`/api/dm/${userId}/open`, { method: 'POST' })
      await load()
      setView({ type: 'dm', id: data.threadId })
      setSidebarOpen(false)
      setMembersOpen(false)
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  const toggleFriend = async userId => {
    try {
      const data = await api(`/api/friends/${userId}`, { method: 'POST' })
      setMe(previous => (previous ? { ...previous, friends: data.friends } : previous))
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  const send = async content => {
    const target = viewRef.current
    if (!target) return
    const path =
      target.type === 'channel'
        ? `/api/channels/${target.id}/messages`
        : `/api/dm/${target.id}/messages`
    const body = replyTo ? { content, replyToId: replyTo.id } : { content }
    const data = await api(path, { method: 'POST', body: JSON.stringify(body) })
    setReplyTo(null)
    if (data.message) {
      setMessages(previous =>
        previous.some(item => item.id === data.message.id) ? previous : [...previous, data.message],
      )
    } else {
      await load()
    }
  }

  const replaceMessage = message => {
    setMessages(previous => previous.map(item => (item.id === message.id ? message : item)))
  }

  const react = async (messageId, emoji) => {
    try {
      const data = await api(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      })
      replaceMessage(data.message)
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  const editMessage = async (messageId, content) => {
    try {
      const data = await api(`/api/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      replaceMessage(data.message)
    } catch (problem) {
      setNotice(problem.message)
      throw problem
    }
  }

  const deleteMessage = async messageId => {
    try {
      await api(`/api/messages/${messageId}`, { method: 'DELETE' })
      setMessages(previous => previous.filter(item => item.id !== messageId))
      setReplyTo(previous => (previous?.id === messageId ? null : previous))
    } catch (problem) {
      setNotice(problem.message)
    }
  }

  const startReply = message => setReplyTo(message)

  if (booting) {
    return (
      <>
        <Background />
        <div className="boot">
          <div className="brand-glyph">◍</div>
          <p>Opening Only Chatz…</p>
        </div>
      </>
    )
  }

  if (!me) {
    return (
      <>
        <Background />
        <AuthScreen notice={notice} onAuthed={finishAuth} />
      </>
    )
  }

  const channel = view?.type === 'channel' ? me.channels.find(item => item.id === view.id) : null
  const thread = view?.type === 'dm' ? me.threads.find(item => item.id === view.id) : null
  const profileMember = profileId ? me.members.find(member => member.id === profileId) : null

  return (
    <>
      <Background />
      <div className="shell">
        {notice && <p className="toast">{notice}</p>}

        {ping && (
          <button type="button" className="ping-toast" onClick={() => answerPing(ping)}>
            <span className="ping-glint" aria-hidden="true">
              @
            </span>
            <span className="ping-text">
              <strong>{ping.from?.displayName ?? 'someone'}</strong> pinged you in{' '}
              {ping.room?.label ?? 'a room'}
            </span>
            <span className="ping-answer">answer</span>
          </button>
        )}

        <Sidebar
          me={me}
          channelId={channel?.id}
          threadId={thread?.id}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onPickChannel={openChannel}
          onOpenDm={openDm}
          onOpenMembers={() => {
            setMembersOpen(true)
            setSidebarOpen(false)
          }}
          onOpenSettings={() => {
            setSettingsOpen(true)
            setSidebarOpen(false)
          }}
          onOpenBoard={() => {
            setBoardOpen(true)
            setSidebarOpen(false)
          }}
          onOpenFlairs={() => {
            setFlairOpen(true)
            setSidebarOpen(false)
          }}
          onOpenPass={() => {
            setPassOpen(true)
            setSidebarOpen(false)
          }}
          onOpenCasino={() => {
            setCasinoOpen(true)
            setSidebarOpen(false)
          }}
          onSignOut={() => {
            api('/api/auth/logout', { method: 'POST' }).catch(() => {})
            signOut()
          }}
        />

        {channel || thread ? (
          <ChatPane
            me={me}
            channel={channel}
            thread={thread}
            messages={messages}
            onSend={send}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenMembers={() => setMembersOpen(value => !value)}
            replyTo={replyTo}
            onReply={startReply}
            onCancelReply={() => setReplyTo(null)}
            typing={typing}
            onTyping={shareTyping}
            onReact={react}
            onEditMessage={editMessage}
            onDeleteMessage={deleteMessage}
            onOpenRules={openRules}
            onOpenProfile={setProfileId}
          />
        ) : (
          <section className="chat glass">
            <p className="empty">Pick a channel to start floating.</p>
          </section>
        )}

        <MembersPanel
          me={me}
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          onOpenDm={openDm}
          onToggleFriend={toggleFriend}
          onOpenProfile={setProfileId}
        />

        {boardOpen && (
          <OnlineBoard
            me={me}
            where={where}
            onClose={() => setBoardOpen(false)}
            onOpenDm={openDm}
          />
        )}

        {flairOpen && (
          <FlairWheel
            coins={me.user.coins}
            onClose={() => setFlairOpen(false)}
            onChanged={() => load().catch(() => {})}
          />
        )}

        {casinoOpen && <CasinoPanel me={me} onClose={() => setCasinoOpen(false)} />}

        {passOpen && <PassPanel pass={me.user.pass} onClose={() => setPassOpen(false)} />}

        {settingsOpen && (
          <SettingsModal
            user={me.user}
            onClose={() => setSettingsOpen(false)}
            onSaved={user =>
              setMe(previous =>
                previous
                  ? {
                      ...previous,
                      user,
                      members: previous.members.map(member =>
                        member.id === user.id ? user : member,
                      ),
                    }
                  : previous,
              )
            }
          />
        )}

        {rulesOpen && (
          <RulesGate
            declined={rulesDeclined}
            busy={rulesBusy}
            error={rulesError}
            onAccept={acceptRules}
            onDecline={declineRules}
          />
        )}

        {profileMember && (
          <ProfileCard
            member={profileMember}
            online={me.online.includes(profileMember.id)}
            isSelf={profileMember.id === me.user.id}
            onClose={() => setProfileId(null)}
            onOpenDm={openDm}
          />
        )}
      </div>
    </>
  )
}
