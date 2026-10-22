import fs from 'node:fs'
import pg from 'pg'

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

export const q = (text, params) => pool.query(text, params)

export async function waitForDb() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  throw new Error('database never became reachable')
}

export async function migrate() {
  const sql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}
