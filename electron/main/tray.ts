import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SuperKingStatus } from './superking.js'

let tray: Tray | null = null
let currentStatus: SuperKingStatus | null = null
let lastIconPath: string | null = null

// 安全的 console.log：Windows 下父进程退出后 stdout 管道可能断开，
// 写入 EPIPE 会触发 uncaughtException 弹窗；这里吞掉这类错误。
function safeLog(...args: unknown[]): void {
  try {
    console.log(...args)
  } catch {
    // ignore EPIPE etc.
  }
}

function safeWarn(...args: unknown[]): void {
  try {
    console.warn(...args)
  } catch {
    // ignore EPIPE etc.
  }
}

interface TrayCallbacks {
  showWindow: () => void
  startSuperKing: () => Promise<void>
  stopSuperKing: () => Promise<void>
  openSettings: () => void
  quit: () => void
}

/**
 * 加载托盘图标。
 *
 * Windows 任务栏托盘对图标要求：
 *   - 必须是真正的 PNG/ICO，base64 micro-PNG 经常显示空白
 *   - Windows 推荐用多分辨率 ICO（16/32/48），让系统按 DPI 自动选择
 *
 * 路径解析：
 *   - dev:  process.cwd() = 项目根目录，图标在 resources/tray-icon.ico
 *   - prod: 通过 electron-builder extraResources 复制到 process.resourcesPath，
 *           即 <安装目录>/resources/tray-icon.ico
 *
 * @param running 是否运行中（绿色 vs 灰色，目前两个状态用同一个图标，靠 tooltip 区分）
 */
function loadTrayIcon(_running: boolean): Electron.NativeImage {
  const candidates: string[] = []
  const resPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  // 打包后路径
  if (resPath) {
    candidates.push(join(resPath, 'tray-icon.ico'))
    candidates.push(join(resPath, 'tray-icon.png'))
  }
  // dev 路径（pnpm dev / electron-vite dev 启动时）
  candidates.push(join(app.getAppPath(), 'resources', 'tray-icon.ico'))
  candidates.push(join(app.getAppPath(), 'resources', 'tray-icon.png'))
  candidates.push(join(process.cwd(), 'resources', 'tray-icon.ico'))
  candidates.push(join(process.cwd(), 'resources', 'tray-icon.png'))
  // build/ 目录兜底（开发环境下 resources/ 可能还没复制时）
  candidates.push(join(app.getAppPath(), 'build', 'icon.ico'))
  candidates.push(join(app.getAppPath(), 'build', 'icon.png'))
  candidates.push(join(process.cwd(), 'build', 'icon.ico'))
  candidates.push(join(process.cwd(), 'build', 'icon.png'))

  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          if (lastIconPath !== p) {
            lastIconPath = p
            safeLog('[tray] icon loaded from:', p)
          }
          return img
        }
      }
    } catch {
      // ignore
    }
  }

  if (lastIconPath !== 'fallback') {
    lastIconPath = 'fallback'
    safeWarn('[tray] no icon file found, falling back to base64 placeholder. Tried:', candidates)
  }
  // 兜底：1x1 透明像素（至少不空白文本）
  const fallback =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAEElEQVR42mNk+M9QzwAEjAwACdoBVS6mvtcAAAAASUVORK5CYII='
  return nativeImage.createFromBuffer(Buffer.from(fallback, 'base64'))
}

export function setupTray(cbs: TrayCallbacks): Tray {
  tray = new Tray(loadTrayIcon(false))
  tray.setToolTip('超级小金 - 未启动')
  tray.on('click', () => cbs.showWindow())
  rebuildMenu(cbs)
  return tray
}

function rebuildMenu(cbs: TrayCallbacks): void {
  if (!tray) return
  const running = currentStatus?.state === 'running'
  const external = currentStatus?.state === 'external'
  const starting = currentStatus?.state === 'starting'
  const errored = currentStatus?.state === 'error'

  const stateLabel = running
    ? `🟢 super-king 运行中 (PID ${currentStatus?.pid ?? '?'})`
    : external
      ? `🔵 super-king 外部连接 :${currentStatus?.port ?? 30142}`
      : starting
        ? '🟡 super-king 启动中...'
        : errored
          ? `🔴 super-king 错误`
          : '⚪ super-king 未启动'

  const menu = Menu.buildFromTemplate([
    { label: stateLabel, enabled: false },
    { type: 'separator' },
    { label: '显示窗口', click: () => cbs.showWindow() },
    { type: 'separator' },
    {
      label: '启动 super-king',
      enabled: !running && !starting && !external,
      click: () => { cbs.startSuperKing().catch(() => { /* ignore */ }) },
    },
    {
      label: '停止 super-king',
      enabled: running || starting,
      click: () => { cbs.stopSuperKing().catch(() => { /* ignore */ }) },
    },
    { type: 'separator' },
    { label: '设置...', click: () => cbs.openSettings() },
    { type: 'separator' },
    { label: '退出', click: () => cbs.quit() },
  ])
  tray.setContextMenu(menu)
}

export function updateTrayStatus(status: SuperKingStatus, cbs: TrayCallbacks): void {
  currentStatus = status
  if (tray) {
    const running = status.state === 'running' || status.state === 'external'
    tray.setImage(loadTrayIcon(running))
    tray.setToolTip(
      status.state === 'running'
        ? `超级小金 - super-king 运行中 :${status.port}`
        : status.state === 'external'
          ? `超级小金 - 外部 super-king :${status.port}`
          : status.state === 'starting'
            ? '超级小金 - 启动中...'
            : status.state === 'error'
              ? `超级小金 - 错误: ${status.error ?? ''}`
              : '超级小金 - 未启动',
    )
  }
  rebuildMenu(cbs)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

// helper: make sure a BrowserWindow is shown
export function showWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (app.dock) app.dock.show()
}
