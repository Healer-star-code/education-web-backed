import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join, basename, dirname, extname } from 'node:path'
import { existsSync, statSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

// 解析 app 图标路径：
// - 开发模式：项目根 build/icon.ico
// - 打包模式：app.asar 内部不能放 ico（Windows 不会从 asar 加载图标），
//   electron-builder 会自动把 .exe 的资源嵌入图标；这里给 BrowserWindow 用
//   __dirname 下的相对位置（out/main/ 同级），fallback 是 process.resourcesPath
function resolveAppIcon(): string {
  // 优先 build/icon.ico（dev 模式 + 打包时 out/main 编译产物相对路径）
  const candidates = [
    join(import.meta.dirname, '../../build/icon.ico'),
    join(import.meta.dirname, '../build/icon.ico'),
    join(process.resourcesPath ?? '', 'build/icon.ico'),
  ]
  return candidates[0]
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '超级小金',
    icon: resolveAppIcon(),
    // 暗色兜底背景：renderer 短暂卡顿/重载时窗口不会闪白
    backgroundColor: '#14171f',
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

  // ---- renderer 健康监听：长任务卡死时给用户选择，崩溃时自动恢复 ----
  // 之前长时间任务（生成 Word 等）会让 renderer 主线程被打满，窗口变白屏；
  // 用户没有任何反馈，只能强制结束进程。
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[main] renderer unresponsive')
    if (!mainWindow) return
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '页面无响应',
      message: '页面似乎卡住了',
      detail: '可能在处理大量内容（生成长文档、代码高亮等）。是否等待，还是重新加载页面？\n\n重新加载会刷新界面但保留会话历史。',
      buttons: ['继续等待', '重新加载页面'],
      defaultId: 0,
      cancelId: 0,
    }).then(({ response }) => {
      if (response === 1) {
        mainWindow?.webContents.reload()
      }
    }).catch((err) => {
      console.warn('[main] unresponsive dialog failed', err)
    })
  })

  mainWindow.webContents.on('responsive', () => {
    console.info('[main] renderer responsive again')
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] renderer process gone:', details.reason, details)
    // clean-exit 是正常退出，跳过；其他原因（crashed/killed/oom）自动重载
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.reload()
      } catch (err) {
        console.warn('[main] reload after crash failed', err)
      }
    }
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
    skillsRoot: settings.skillsRoot,
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
  ipcMain.handle('superking:pickSkillsDir', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Skills 资源目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ---- 本地文件操作（artifact 卡片用） ----
  // 探测本地文件状态：用于消息里出现的本地路径 artifact 卡片
  ipcMain.handle('file:stat', async (_e, target: string) => {
    if (!target || typeof target !== 'string') return { exists: false }
    try {
      if (!existsSync(target)) return { exists: false }
      const st = statSync(target)
      return {
        exists: true,
        size: st.size,
        mtime: st.mtimeMs,
        isDirectory: st.isDirectory(),
        isFile: st.isFile(),
      }
    } catch {
      return { exists: false }
    }
  })

  // 弹保存对话框 + 复制文件到用户选定位置（「保存到电脑」按钮的核心）
  ipcMain.handle('file:saveAs', async (_e, src: string) => {
    if (!mainWindow) return { ok: false, error: 'no main window' }
    if (!src || !existsSync(src)) return { ok: false, error: '源文件不存在' }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存到电脑',
      defaultPath: basename(src),
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    try {
      copyFileSync(src, result.filePath)
      return { ok: true, savedTo: result.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 在资源管理器中显示并选中该文件（不是打开文件夹）
  ipcMain.handle('file:reveal', async (_e, target: string) => {
    if (!target) return { ok: false, error: 'no path' }
    try {
      if (existsSync(target)) {
        shell.showItemInFolder(target)
        return { ok: true }
      }
      // 文件已不在，至少打开父目录
      const parent = dirname(target)
      if (existsSync(parent)) {
        await shell.openPath(parent)
        return { ok: true, fallback: 'parent' }
      }
      return { ok: false, error: '文件和所在目录都已不存在' }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 用系统默认程序打开文件（docx -> Word 等）
  ipcMain.handle('file:openLocal', async (_e, target: string) => {
    if (!target) return { ok: false, error: 'no path' }
    if (!existsSync(target)) return { ok: false, error: '文件不存在' }
    try {
      const err = await shell.openPath(target)
      if (err) return { ok: false, error: err }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- 上传相关：把渲染层 ArrayBuffer 落到 OS 临时目录 ----
  // 用于附件上传第一步：File 对象 -> ArrayBuffer -> Buffer 写入 %TEMP%/super-king-uploads/
  // 之后 handleSend 时再从这里 copyToSession 到 <cwd>/.uploads/，或 readAsBase64（图片）
  ipcMain.handle('file:writeBlobToTemp', async (_e, payload: { buffer: ArrayBuffer | Uint8Array; fileName: string }) => {
    try {
      if (!payload || !payload.fileName) return { ok: false, error: '缺少文件名' }
      const dir = join(tmpdir(), 'super-king-uploads')
      mkdirSync(dir, { recursive: true })
      const safeName = String(payload.fileName).replace(/[\\/:*?"<>|]/g, '_')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const tempPath = join(dir, `${stamp}-${safeName}`)
      const buf = Buffer.isBuffer(payload.buffer)
        ? payload.buffer
        : Buffer.from(payload.buffer as ArrayBuffer)
      writeFileSync(tempPath, buf)
      const st = statSync(tempPath)
      return { ok: true, tempPath, size: st.size }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 把 temp 文件复制到 <cwd>/.uploads/<timestamp>-<原名>，agent 用 read 工具能直接读
  // 返回 relPath（用于 prompt 注入）和 absPath（用于 UI 卡片复用 ArtifactCard）
  ipcMain.handle('file:copyToSession', async (_e, payload: { tempPath: string; cwd: string; fileName: string }) => {
    try {
      if (!payload?.tempPath || !payload?.cwd || !payload?.fileName) {
        return { ok: false, error: '参数缺失' }
      }
      if (!existsSync(payload.tempPath)) return { ok: false, error: '源临时文件不存在' }
      const uploadsDir = join(payload.cwd, '.uploads')
      mkdirSync(uploadsDir, { recursive: true })
      const safeName = String(payload.fileName).replace(/[\\/:*?"<>|]/g, '_')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `${stamp}-${safeName}`
      const absPath = join(uploadsDir, fileName)
      copyFileSync(payload.tempPath, absPath)
      const st = statSync(absPath)
      // 相对路径用 / 分隔（agent prompt 里更通用，跨工具友好）
      const relPath = `.uploads/${fileName}`
      return { ok: true, absPath, relPath, size: st.size }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 读文件为 base64（用于图片附件直接塞进 super-king /prompt 的 images 字段）
  ipcMain.handle('file:readAsBase64', async (_e, target: string) => {
    try {
      if (!target) return { ok: false, error: 'no path' }
      if (!existsSync(target)) return { ok: false, error: '文件不存在' }
      const buf = readFileSync(target)
      const ext = extname(target).toLowerCase().slice(1)
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
      }
      const mimeType = mimeMap[ext] ?? 'application/octet-stream'
      return { ok: true, data: buf.toString('base64'), mimeType, size: buf.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
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
