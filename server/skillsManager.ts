import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SkillInfo } from './types.ts'
import { appDir } from './env.ts'

export interface CreateSkillPayload {
  name: string
  description: string
  content: string
}

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/

function normalizeContent(content: string): string {
  const trimmed = content.trim()
  return trimmed ? `${trimmed}\n` : ''
}

function validateSkillPayload(payload: CreateSkillPayload): void {
  const name = payload.name.trim()
  const description = payload.description.trim()

  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error('Skill name must use only lowercase letters, numbers, hyphens, or underscores, and be 2-64 characters long.')
  }
  if (!description) {
    throw new Error('Skill description is required.')
  }
  if (description.includes('\n') || description.includes('\r')) {
    throw new Error('Skill description must be a single line.')
  }
}

export function globalSkillsDir(): string {
  return join(appDir(), 'skills')
}

export async function ensureGlobalSkillsDir(): Promise<string> {
  const dir = globalSkillsDir()
  await mkdir(dir, { recursive: true })
  return dir
}

export async function createGlobalSkill(payload: CreateSkillPayload): Promise<SkillInfo> {
  validateSkillPayload(payload)

  const name = payload.name.trim()
  const description = payload.description.trim()
  const root = await ensureGlobalSkillsDir()
  const skillDir = join(root, name)
  const skillFile = join(skillDir, 'SKILL.md')
  const content = normalizeContent(payload.content)
  const body = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${content}`

  await mkdir(skillDir, { recursive: true })
  await writeFile(skillFile, body, { encoding: 'utf8', flag: 'wx' })

  return {
    name,
    description,
    source: 'global',
    enabled: true,
  }
}

export async function deleteGlobalSkill(name: string): Promise<void> {
  if (!SKILL_NAME_PATTERN.test(name)) throw new Error('Invalid skill name')
  const skillDir = join(await ensureGlobalSkillsDir(), name)
  if (existsSync(skillDir)) await rm(skillDir, { recursive: true, force: true })
}

export const createProjectSkill = async (_cwd: string, payload: CreateSkillPayload): Promise<SkillInfo> => createGlobalSkill(payload)

