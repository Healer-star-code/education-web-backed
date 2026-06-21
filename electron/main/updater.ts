// electron-updater 接入。MVP：手动检查 + 自动下载（用户允许） + 重启安装。
import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg

export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  phase: UpdaterPhase
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string | null
  percent: number
  bytesPerSecond: number | null
  transferred: number
  total: number
  error: string | null
}

const state: UpdaterState = {
  phase: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  percent: 0,
  bytesPerSecond: null,
  transferred: 0,
  total: 0,
  error: null,
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:state', state)
    }
  }
}

function set(patch: Partial<UpdaterState>): void {
  Object.assign(state, patch)
  broadcast()
}

let initialized = false
let pendingDownload = false

export function initUpdater(): void {
  if (initialized) return
  initialized = true

  autoUpdater.autoDownload = false // 手动控制下载，避免流量
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null as unknown as null

  autoUpdater.on('checking-for-update', () => {
    set({ phase: 'checking', error: null })
  })

  autoUpdater.on('update-available', (info) => {
    set({
      phase: 'available',
      latestVersion: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
    if (pendingDownload) {
      pendingDownload = false
      autoUpdater.downloadUpdate().catch((err) => {
        set({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    set({ phase: 'not-available', latestVersion: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    set({
      phase: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    set({
      phase: 'downloaded',
      latestVersion: info.version,
      percent: 100,
    })
  })

  autoUpdater.on('error', (err) => {
    set({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
  })
}

export function getState(): UpdaterState {
  return state
}

export async function checkForUpdates(): Promise<UpdaterState> {
  if (!app.isPackaged) {
    set({ phase: 'not-available', latestVersion: state.currentVersion, error: '开发模式下不检查更新' })
    return state
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdaterState> {
  if (!app.isPackaged) {
    set({ phase: 'error', error: '开发模式下不下载更新' })
    return state
  }
  if (state.phase === 'available') {
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      set({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  } else {
    // 还没 check 过：自动 check 并标记 pending
    pendingDownload = true
    await checkForUpdates()
  }
  return state
}

export function quitAndInstall(): void {
  if (state.phase === 'downloaded') {
    autoUpdater.quitAndInstall(false, true)
  }
}
