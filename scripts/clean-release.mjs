#!/usr/bin/env node
// 清理 release/ 目录里所有「不属于当前 package.json version」的产物。
// 保留：
//   - 当前版本的 setup / portable / blockmap / AppImage / latest.yml 等
//   - 非版本相关文件（builder-debug.yml）
//   - win-unpacked 目录（每次都会被 electron-builder 覆盖）
//
// 这样每次 build 之前先清一遍，避免 release/ 越积越大。

import { readdirSync, statSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const releaseDir = join(projectRoot, 'release')
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
const currentVersion = pkg.version

if (!existsSync(releaseDir)) {
  console.log('[clean-release] release/ does not exist, nothing to clean.')
  process.exit(0)
}

const entries = readdirSync(releaseDir)
let deletedCount = 0
let deletedBytes = 0

for (const name of entries) {
  const full = join(releaseDir, name)
  let st
  try { st = statSync(full) } catch { continue }

  // 跳过目录（win-unpacked / linux-unpacked 等 electron-builder 会覆盖）
  if (st.isDirectory()) continue

  // 当前版本的文件保留
  if (name.includes(currentVersion)) continue

  // 不带版本号的元数据保留（latest.yml / builder-debug.yml）
  const looksVersioned = /\d+\.\d+\.\d+/.test(name)
  if (!looksVersioned) continue

  // 其他带版本号且不是当前版本的，删除
  try {
    rmSync(full, { force: true })
    deletedCount++
    deletedBytes += st.size
    console.log(`[clean-release] deleted: ${name} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)
  } catch (err) {
    console.warn(`[clean-release] failed to delete ${name}:`, err)
  }
}

if (deletedCount === 0) {
  console.log(`[clean-release] no stale artifacts found (kept version ${currentVersion}).`)
} else {
  console.log(`[clean-release] removed ${deletedCount} stale file(s), freed ${(deletedBytes / 1024 / 1024).toFixed(1)} MB. Kept version ${currentVersion}.`)
}
