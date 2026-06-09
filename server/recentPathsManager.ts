import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { appDir } from './env.ts'

export interface RecentPath {
  path: string
  name: string
  timeCreated: number
  timeUpdated: number
}

let db: DatabaseSync | null = null

function getDbPath(): string {
  return join(appDir(), 'recent-paths.db')
}

function getDb(): DatabaseSync {
  if (db) return db
  const dbPath = getDbPath()
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS recent_path (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    )
  `)
  return db
}

export function listRecentPaths(): RecentPath[] {
  const database = getDb()
  const stmt = database.prepare('SELECT path, name, time_created, time_updated FROM recent_path ORDER BY time_updated DESC')
  const rows = stmt.all() as Array<{ path: string; name: string; time_created: number; time_updated: number }>
  return rows.map((row) => ({
    path: row.path,
    name: row.name,
    timeCreated: row.time_created,
    timeUpdated: row.time_updated,
  }))
}

export function upsertRecentPath(path: string, name?: string): RecentPath {
  const database = getDb()
  const now = Date.now()
  const dirName = name || path.split(/[/\\]/).filter(Boolean).pop() || path

  const existing = database.prepare('SELECT time_created FROM recent_path WHERE path = ?').get(path) as { time_created: number } | undefined

  if (existing) {
    database.prepare('UPDATE recent_path SET name = ?, time_updated = ? WHERE path = ?').run(dirName, now, path)
    return { path, name: dirName, timeCreated: existing.time_created, timeUpdated: now }
  }

  database.prepare('INSERT INTO recent_path (path, name, time_created, time_updated) VALUES (?, ?, ?, ?)').run(path, dirName, now, now)
  return { path, name: dirName, timeCreated: now, timeUpdated: now }
}

export function removeRecentPath(path: string): boolean {
  const database = getDb()
  const result = database.prepare('DELETE FROM recent_path WHERE path = ?').run(path)
  return result.changes > 0
}

export function closeRecentPathsDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
