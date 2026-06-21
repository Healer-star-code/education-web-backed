import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { getDefaultSkillsRoot, scanLocalSkills } from './helper.js'
import {
  clearError,
  clearExternalStatus,
  getStatus as getSuperKingStatus,
  getLogTail as getSuperKingLogs,
  killOnExit as killSuperKingOnExit,
  probeExternalSuperKing,
  restartSuperKing,
  setExternalStatus,
  startSuperKing,
  stopSuperKing,
} from './superking.js'
import { destroyTray, setupTray, showWindow, updateTrayStatus } from './tray.js'
import { getSettings, setSettings } from './store.js'
import {
  checkForUpdates,
  downloadUpdate,
  getState as getUpdaterState,
  initUpdater,
  quitAndInstall,
} from './updater.js'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '超级小金',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

function buildStartOptions() {
  const settings = getSettings()
  // 仅保留非空环境变量
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(settings.superKingEnv ?? {})) {
    if (v && v.trim()) env[k] = v
  }
  return {
    exePath: settings.superKingExePath,
    port: settings.superKingPort,
    password: settings.superKingPassword,
    env,
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:selectDirectory', async (_e, defaultPath: string | null) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择项目目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath ?? undefined,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    'dialog:selectFile',
    async (_e, options: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string } | null) => {
      if (!mainWindow) return null
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择文件',
        properties: ['openFile'],
        filters: options?.filters,
        defaultPath: options?.defaultPath,
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
  )

  ipcMain.handle('shell:openPath', async (_e, target: string) => {
    try {
      const err = await shell.openPath(target)
      if (err) return { ok: false, error: err }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- local helper ----
  ipcMain.handle('local:health', async () => ({ ok: true }))
  ipcMain.handle('local:getSkillsRoot', async () => ({ path: getDefaultSkillsRoot() }))
  ipcMain.handle('local:listSkills', async (_e, rootOverride: string | null) => {
    const root = rootOverride && rootOverride.trim() ? rootOverride : getDefaultSkillsRoot()
    const skills = await scanLocalSkills(root)
    return { skills, root }
  })
  ipcMain.handle('local:openFolder', async (_e, target: string | null) => {
    const path = target && target.trim() ? target : getDefaultSkillsRoot()
    try {
      const err = await shell.openPath(path)
      if (err) return { ok: false, error: err }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- super-king lifecycle ----
  ipcMain.handle('superking:status', async () => getSuperKingStatus())
  ipcMain.handle('superking:logs', async () => getSuperKingLogs())
  ipcMain.handle('superking:start', async () => {
    return startSuperKing(buildStartOptions())
  })
  ipcMain.handle('superking:stop', async () => stopSuperKing())
  ipcMain.handle('superking:restart', async () => restartSuperKing(buildStartOptions()))
  ipcMain.handle('superking:clearError', async () => {
    clearError()
    return getSuperKingStatus()
  })
  ipcMain.handle('superking:pickExe', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 super-king 可执行文件',
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---- settings ----
  ipcMain.handle('settings:get', async () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch: Record<string, unknown>) => setSettings(patch))

  // ---- updater ----
  ipcMain.handle('updater:state', async () => getUpdaterState())
  ipcMain.handle('updater:check', async () => checkForUpdates())
  ipcMain.handle('updater:download', async () => downloadUpdate())
  ipcMain.handle('updater:install', async () => {
    quitAndInstall()
    return { ok: true }
  })
}

function setupTrayCallbacks() {
  const cbs = {
    showWindow: () => showWindow(mainWindow),
    startSuperKing: async () => { await startSuperKing(buildStartOptions()) },
    stopSuperKing: async () => { await stopSuperKing() },
    openSettings: () => {
      showWindow(mainWindow)
      mainWindow?.webContents.send('app:openSettings')
    },
    quit: () => {
      isQuitting = true
      app.quit()
    },
  }
  setupTray(cbs)

  // 状态同步循环：每 2 秒探测外部 super-king，并把托盘和 renderer 状态对齐
  const tick = async () => {
    const settings = getSettings()
    const current = getSuperKingStatus()

    // 只在没有自启子进程时做外部探测
    if (current.state !== 'running' && current.state !== 'starting') {
      const ok = await probeExternalSuperKing(settings.superKingPort, settings.superKingPassword).catch(() => false)
      if (ok) {
        setExternalStatus(settings.superKingPort)
      } else if (current.state === 'external') {
        clearExternalStatus()
      } else if (current.state === 'error') {
        // 探测失败 + 之前的 error：保留 error 信息（用户可以读到原因）
      }
    }

    updateTrayStatus(getSuperKingStatus(), cbs)
  }
  void tick()
  setInterval(() => { void tick() }, 2000)
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  setupTrayCallbacks()
  initUpdater()
  // 启动 5 秒后自动检查一次（仅打包后）
  setTimeout(() => {
    if (app.isPackaged) {
      void checkForUpdates()
    }
  }, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  killSuperKingOnExit()
  destroyTray()
})

app.on('window-all-closed', () => {
  // 桌面客户端常驻托盘，不退出；Mac 同理
  // 用户从托盘菜单 -> 退出 才真正退
})
