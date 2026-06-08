import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillInfo } from './types.ts'

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

export async function createProjectSkill(cwd: string, payload: CreateSkillPayload): Promise<SkillInfo> {
  validateSkillPayload(payload)

  const name = payload.name.trim()
  const description = payload.description.trim()
  const skillDir = join(cwd, '.pi', 'skills', name)
  const skillFile = join(skillDir, 'SKILL.md')
  const content = normalizeContent(payload.content)
  const body = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${content}`

  await mkdir(skillDir, { recursive: true })
  await writeFile(skillFile, body, { encoding: 'utf8', flag: 'wx' })

  return {
    name,
    description,
    source: 'project',
    enabled: true,
  }
}
