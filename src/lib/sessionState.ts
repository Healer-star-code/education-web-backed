import type { SessionInfo } from '../mockData'

export function upsertSession(sessions: SessionInfo[], incoming: SessionInfo): SessionInfo[] {
  const next = [incoming, ...sessions.filter((session) => session.id !== incoming.id)]
  return next.sort((a, b) => b.modified.localeCompare(a.modified))
}
