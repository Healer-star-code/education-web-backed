import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
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

async function installBundledOfficeSkills(overwrite = false): Promise<void> {
  const root = await ensureGlobalSkillsDir()
  const sourceRoot = join(process.env.USERPROFILE ?? '', '.config', 'opencode', 'skills')
  for (const name of ['docx', 'pptx', 'xlsx']) {
    const source = join(sourceRoot, name)
    const target = join(root, basename(name))
    if (!existsSync(source)) continue
    if (existsSync(target)) {
      if (!overwrite) continue
      await rm(target, { recursive: true, force: true })
    }
    await cp(source, target, { recursive: true })
  }
}

export async function ensureOfficeSkillsInstalled(): Promise<void> {
  await installBundledOfficeSkills(false)
}

export async function reinstallOfficeSkills(): Promise<void> {
  await installBundledOfficeSkills(true)
}

export function officeSkillPaths(): string[] {
  const base = join(process.env.USERPROFILE ?? '', '.config', 'opencode', 'skills')
  return ['docx', 'pptx', 'xlsx']
    .map((name) => join(base, name))
    .filter((path) => existsSync(path))
}

export function allGlobalSkillPaths(): string[] {
  return [globalSkillsDir()]
}

function parseSkillMarkdown(markdown: string, fallbackName: string): SkillInfo {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const raw = frontmatter?.[1] ?? ''
  const name = raw.match(/^name:\s*['"]?([^'"\r\n]+)['"]?/m)?.[1]?.trim() || fallbackName
  const description = raw.match(/^description:\s*['"]?([\s\S]*?)['"]?\r?$/m)?.[1]?.trim() || ''
  const disabled = /disable-model-invocation:\s*true/i.test(raw)
  return { name, description, source: 'global', enabled: !disabled }
}

export async function listInstalledGlobalSkills(): Promise<SkillInfo[]> {
  await ensureOfficeSkillsInstalled()
  const root = await ensureGlobalSkillsDir()
  const entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' }) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
  const skills: SkillInfo[] = []
  for (const entry of entries) {
    const path = join(root, entry.name)
    let skillFile: string | null = null
    if (entry.isDirectory()) {
      const candidate = join(path, 'SKILL.md')
      if (existsSync(candidate)) skillFile = candidate
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      skillFile = path
    }
    if (!skillFile) continue
    try {
      await stat(skillFile)
      skills.push(parseSkillMarkdown(await readFile(skillFile, 'utf8'), basename(entry.name, '.md')))
    } catch {
      // ignore invalid skill
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
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

