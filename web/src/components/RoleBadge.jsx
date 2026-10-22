import { roleLabel } from '../lib/roles'

export default function RoleBadge({ role }) {
  return <span className={`badge ${role}`}>{roleLabel(role)}</span>
}
