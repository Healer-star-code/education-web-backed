import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

let _appDir: string | null = null

export function appDir(): string {
  if (_appDir) return _appDir
  _appDir = process.env.V3_WEB_APP_DIR || join(homedir(), '.local', 'share', 'v3-web')
  if (!existsSync(_appDir)) {
    mkdirSync(_appDir, { recursive: true })
  }
  return _appDir
}

export function loadLocalEnv(fileName = '.env.local'): void {
  const envPath = isAbsolute(fileName) ? fileName : resolve(process.cwd(), fileName)
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const equalIndex = line.indexOf('=')
    if (equalIndex <= 0) continue

    const key = line.slice(0, equalIndex).trim()
    let value = line.slice(equalIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
