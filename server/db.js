import fs from 'node:fs'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL

// A missing URL used to look exactly like an unreachable database: 40 seconds of
// retries against localhost, then "database never became reachable". Fail loudly instead.
const target = (() => {
  try {
    return new URL(connectionString).host
  } catch {
    return null
  }
})()

export const pool = new pg.Pool({
  connectionString,
  max: 10,
  // Each retry has to give up by itself for the wait loop below to make progress.
  connectionTimeoutMillis: 5000,
})

export const q = (text, params) => pool.query(text, params)

export async function waitForDb(attempts = 60) {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — link this service to a Postgres database and redeploy',
    )
  }

  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  throw new Error(
    `database ${target ?? '(unparseable DATABASE_URL)'} never became reachable ` +
      `(${lastError?.code ?? lastError?.message ?? 'no response'})`,
  )
}

export async function migrate() {
  const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}
