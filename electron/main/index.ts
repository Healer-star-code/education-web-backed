import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '教育智能体',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
