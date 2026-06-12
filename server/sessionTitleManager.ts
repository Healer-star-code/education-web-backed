import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { appDir } from './env.ts'

export type SessionTitleSource = 'ai' | 'user'

export interface SessionTitleMeta {
  sessionFile: string
  titleSource?: SessionTitleSource
  aiTitleGenerated: boolean
  timeUpdated: number
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  const dbPath = resolve(appDir(), 'session-title-metadata.db')
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_title_metadata (
      session_file TEXT PRIMARY KEY,
      title_source TEXT,
      ai_title_generated INTEGER NOT NULL DEFAULT 0,
      time_updated INTEGER NOT NULL
    )
  `)
  return db
}

export function getSessionTitleMeta(sessionFile?: string): SessionTitleMeta | undefined {
  if (!sessionFile) return undefined
  const row = getDb().prepare('SELECT session_file, title_source, ai_title_generated, time_updated FROM session_title_metadata WHERE session_file = ?')
    .get(resolve(sessionFile)) as { session_file: string; title_source?: SessionTitleSource; ai_title_generated: number; time_updated: number } | undefined
  if (!row) return undefined
  return {
    sessionFile: row.session_file,
    titleSource: row.title_source,
    aiTitleGenerated: !!row.ai_title_generated,
    timeUpdated: row.time_updated,
  }
}

export function setSessionTitleMeta(sessionFile: string, source: SessionTitleSource, aiTitleGenerated: boolean): SessionTitleMeta {
  const normalized = resolve(sessionFile)
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO session_title_metadata (session_file, title_source, ai_title_generated, time_updated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_file) DO UPDATE SET
      title_source = excluded.title_source,
      ai_title_generated = excluded.ai_title_generated,
      time_updated = excluded.time_updated
  `).run(normalized, source, aiTitleGenerated ? 1 : 0, now)
  return { sessionFile: normalized, titleSource: source, aiTitleGenerated, timeUpdated: now }
}

export function markAiTitleGenerated(sessionFile: string): SessionTitleMeta {
  return setSessionTitleMeta(sessionFile, 'ai', true)
}

export function markUserTitle(sessionFile: string): SessionTitleMeta {
  return setSessionTitleMeta(sessionFile, 'user', true)
}

export function closeSessionTitleDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
