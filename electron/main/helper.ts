import { readdir, readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { getSettings } from './store.js'

export interface LocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path: string
}

/**
 * 解析 Skills 根目录：
 * 1. 优先用 electron-store 里用户配的 `skillsRoot`
 * 2. 否则用环境变量 `LOCAL_SKILLS_ROOT`（开发期 / CI 调试用）
 * 3. 否则用 super-king.exe 同目录下的 `skills` 子目录（约定大于配置）
 * 4. 都没有就返回空串 —— 调用方应当显示「请先配置」
 */
export function getDefaultSkillsRoot(): string {
  const settings = getSettings()
  if (settings.skillsRoot && settings.skillsRoot.trim()) {
    return resolve(settings.skillsRoot.trim())
  }
  if (process.env.LOCAL_SKILLS_ROOT) {
    return resolve(process.env.LOCAL_SKILLS_ROOT)
  }
  if (settings.superKingExePath && settings.superKingExePath.trim()) {
    return resolve(dirname(settings.superKingExePath.trim()), 'skills')
  }
  return ''
}

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
  if (!root || !root.trim()) return skills
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
