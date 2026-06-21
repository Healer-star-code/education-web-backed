import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upsertSession } from '../src/lib/sessionState.ts'
import type { SessionInfo } from '../src/mockData.ts'

function session(id: string, modified: string): SessionInfo {
  return {
    id,
    cwd: 'E:/project',
    created: modified,
    modified,
    firstMessage: id,
    messageCount: 1,
  }
}

test('upsertSession adds a new session at the top by modified time', () => {
  const result = upsertSession([
    session('old', '2026-01-01T00:00:00.000Z'),
  ], session('new', '2026-01-02T00:00:00.000Z'))

  assert.deepEqual(result.map((item) => item.id), ['new', 'old'])
})

test('upsertSession replaces an existing session instead of duplicating it', () => {
  const result = upsertSession([
    session('same', '2026-01-01T00:00:00.000Z'),
  ], { ...session('same', '2026-01-03T00:00:00.000Z'), messageCount: 3 })

  assert.equal(result.length, 1)
  assert.equal(result[0].messageCount, 3)
})
