import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import type { SuperKingStatus } from './superking.js'

let tray: Tray | null = null
let currentStatus: SuperKingStatus | null = null

interface TrayCallbacks {
  showWindow: () => void
  startSuperKing: () => Promise<void>
  stopSuperKing: () => Promise<void>
  openSettings: () => void
  quit: () => void
}

function makeIcon(running: boolean): Electron.NativeImage {
  // 16x16 PNG (simple colored dot). Base64 encoded.
  const greenDot =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVQ4y2NgGAWjYBSMglEwCgYZ+I8Vfwz9D/8/' +
    'Z2RkYGD4z8AwAvD/v///DAwMDP////8zMjIyMDD8B/MZGUbBKBgFo2DwAQB6MAr6FaQpzwAAAABJRU5ErkJggg=='
  const grayDot =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAR0lEQVQ4y2NgGAWjYBSMglEwCgYV+I8VfwzM/v//' +
    'DwwMDAz/GRgYGBgY/jMyMjIwMPxn+M/I8B/MZ2QYBaNgFIyCwQcAYTAGAQpzqwgAAAAASUVORK5CYII='
  const buf = Buffer.from(running ? greenDot : grayDot, 'base64')
  return nativeImage.createFromBuffer(buf)
}

export function setupTray(cbs: TrayCallbacks): Tray {
  tray = new Tray(makeIcon(false))
  tray.setToolTip('教育智能体 - 未启动')
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
    tray.setImage(makeIcon(running))
    tray.setToolTip(
      status.state === 'running'
        ? `教育智能体 - super-king 运行中 :${status.port}`
        : status.state === 'external'
          ? `教育智能体 - 外部 super-king :${status.port}`
          : status.state === 'starting'
            ? '教育智能体 - 启动中...'
            : status.state === 'error'
              ? `教育智能体 - 错误: ${status.error ?? ''}`
              : '教育智能体 - 未启动',
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
