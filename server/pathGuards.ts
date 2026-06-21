import { homedir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'

function canonical(path: string): string {
  return resolve(path).replace(/[/\\]+/g, '\\').toLowerCase()
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

export function userHomePath(): string {
  return homedir()
}

export function isSystemProjectPath(path: string): boolean {
  const appRoot = canonical(process.cwd())
  const target = canonical(path)
  return isInside(appRoot, target) || isInside(target, appRoot)
}

export function assertUserProjectPath(path?: string): string {
  if (!path?.trim()) throw new Error('请先选择项目目录')
  if (isSystemProjectPath(path)) throw new Error('不能选择系统安装目录作为项目目录')
  return resolve(path)
}

export function filterUserProjectPaths<T extends { path: string }>(items: T[]): T[] {
  return items.filter((item) => !isSystemProjectPath(item.path))
}
