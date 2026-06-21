import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface LocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path: string
}

export const DEFAULT_SKILLS_ROOT =
  process.env.LOCAL_SKILLS_ROOT ?? 'E:\\super-king\\skills'

function parseSkill(name: string, content: string, path: string): LocalSkillInfo {
  const lines = content.split(/\r?\n/)
  let description = ''
  let enabled = true

  if (lines[0]?.trim() === '---') {
    const endIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
    if (endIdx >= 0) {
      const frontmatter = lines.slice(1, endIdx + 1).join('\n')
      const descMatch = frontmatter.match(/description:\s*(.+)/)
      if (descMatch) description = descMatch[1].trim()
      const enabledMatch = frontmatter.match(/enabled:\s*(.+)/)
      if (enabledMatch) enabled = enabledMatch[1].trim().toLowerCase() !== 'false'
    }
  }

  if (!description) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        description = trimmed.slice(0, 200)
        break
      }
    }
  }

  return { name, description, source: 'super-king', enabled, path }
}

export async function scanLocalSkills(root: string): Promise<LocalSkillInfo[]> {
  const skills: LocalSkillInfo[] = []
  const resolvedRoot = resolve(root)
  try {
    const entries = await readdir(resolvedRoot, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(resolvedRoot, entry.name)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(fullPath, 'utf8')
        skills.push(parseSkill(entry.name.replace(/\.md$/, ''), content, fullPath))
      } else if (entry.isDirectory()) {
        const skillMdPath = join(fullPath, 'SKILL.md')
        try {
          const content = await readFile(skillMdPath, 'utf8')
          skills.push(parseSkill(entry.name, content, skillMdPath))
        } catch {
          // no SKILL.md, skip
        }
      }
    }
  } catch {
    // root may not exist
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export function getDefaultSkillsRoot(): string {
  return resolve(DEFAULT_SKILLS_ROOT)
}
