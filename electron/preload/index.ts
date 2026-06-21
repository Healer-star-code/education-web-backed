import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface LocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path?: string
}

export type SuperKingState = 'stopped' | 'starting' | 'running' | 'external' | 'error'
export interface SuperKingStatus {
  state: SuperKingState
  pid: number | null
  port: number
  error: string | null
  exePath: string | null
  startedAt: number | null
}

export interface DesktopSettingsShape {
  superKingExePath: string
  superKingPort: number
  superKingPassword: string
  skillsRoot: string
  superKingEnv: Record<string, string>
  autoStartSuperKing: boolean
  remoteUrl: string
  useRemote: boolean
  autoApproveAllTools: boolean
}

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

const api = {
  app: {
    getVersion: (): string => process.versions.electron ?? 'unknown',
  },
  dialog: {
    selectDirectory: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectDirectory', defaultPath ?? null),
    selectFile: (options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string }): Promise<string | null> =>
      ipcRenderer.invoke('dialog:selectFile', options ?? null),
  },
  shell: {
    openPath: (target: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openPath', target),
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openExternal', url),
  },
  file: {
    stat: (target: string): Promise<{
      exists: boolean
      size?: number
      mtime?: number
      isDirectory?: boolean
      isFile?: boolean
    }> => ipcRenderer.invoke('file:stat', target),
    saveAs: (src: string): Promise<{ ok: boolean; canceled?: boolean; savedTo?: string; error?: string }> =>
      ipcRenderer.invoke('file:saveAs', src),
    saveText: (options: { content: string; defaultFileName?: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ ok: boolean; canceled?: boolean; savedTo?: string; error?: string }> =>
      ipcRenderer.invoke('file:saveText', options),
    reveal: (target: string): Promise<{ ok: boolean; fallback?: string; error?: string }> =>
      ipcRenderer.invoke('file:reveal', target),
    openLocal: (target: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('file:openLocal', target),
    writeBlobToTemp: (payload: { buffer: ArrayBuffer | Uint8Array; fileName: string }): Promise<{
      ok: boolean; tempPath?: string; size?: number; error?: string
    }> => ipcRenderer.invoke('file:writeBlobToTemp', payload),
    copyToSession: (payload: { tempPath: string; cwd: string; fileName: string }): Promise<{
      ok: boolean; absPath?: string; relPath?: string; size?: number; error?: string
    }> => ipcRenderer.invoke('file:copyToSession', payload),
    readAsBase64: (target: string): Promise<{
      ok: boolean; data?: string; mimeType?: string; size?: number; error?: string
    }> => ipcRenderer.invoke('file:readAsBase64', target),
  },
  local: {
    health: (): Promise<{ ok: true }> => ipcRenderer.invoke('local:health'),
    getSkillsRoot: (): Promise<{ path: string }> => ipcRenderer.invoke('local:getSkillsRoot'),
    listSkills: (rootOverride?: string): Promise<{ skills: LocalSkillInfo[]; root: string }> =>
      ipcRenderer.invoke('local:listSkills', rootOverride ?? null),
    openFolder: (target?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('local:openFolder', target ?? null),
  },
  superking: {
    status: (): Promise<SuperKingStatus> => ipcRenderer.invoke('superking:status'),
    start: (): Promise<SuperKingStatus> => ipcRenderer.invoke('superking:start'),
    stop: (): Promise<SuperKingStatus> => ipcRenderer.invoke('superking:stop'),
    restart: (): Promise<SuperKingStatus> => ipcRenderer.invoke('superking:restart'),
    clearError: (): Promise<SuperKingStatus> => ipcRenderer.invoke('superking:clearError'),
    pickExe: (): Promise<string | null> => ipcRenderer.invoke('superking:pickExe'),
    pickSkillsDir: (): Promise<string | null> => ipcRenderer.invoke('superking:pickSkillsDir'),
    logs: (): Promise<{ stdout: string; stderr: string }> => ipcRenderer.invoke('superking:logs'),
    onStatusChange: (cb: (status: SuperKingStatus) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, status: SuperKingStatus) => cb(status)
      ipcRenderer.on('superking:status', handler)
      return () => ipcRenderer.removeListener('superking:status', handler)
    },
  },
  settings: {
    get: (): Promise<DesktopSettingsShape> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<DesktopSettingsShape>): Promise<DesktopSettingsShape> =>
      ipcRenderer.invoke('settings:set', patch),
  },
  events: {
    onOpenSettings: (cb: () => void): (() => void) => {
      const handler = () => cb()
      ipcRenderer.on('app:openSettings', handler)
      return () => ipcRenderer.removeListener('app:openSettings', handler)
    },
  },
  updater: {
    state: (): Promise<UpdaterState> => ipcRenderer.invoke('updater:state'),
    check: (): Promise<UpdaterState> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<UpdaterState> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('updater:install'),
    onChange: (cb: (state: UpdaterState) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, s: UpdaterState) => cb(s)
      ipcRenderer.on('updater:state', handler)
      return () => ipcRenderer.removeListener('updater:state', handler)
    },
  },
  log: {
    rendererError: (payload: {
      source?: string
      message?: string
      stack?: string
      componentStack?: string
      url?: string
      userAgent?: string
      sessionId?: string | null
      contentLength?: number
      extra?: Record<string, unknown>
    }): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('log:rendererError', payload),
    readRendererErrors: (maxBytes?: number): Promise<{ ok: boolean; path?: string; content?: string; error?: string }> =>
      ipcRenderer.invoke('log:readRendererErrors', maxBytes),
    getRendererErrorPath: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('log:getRendererErrorPath'),
    revealRendererErrors: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('log:revealRendererErrors'),
  },
}

try {
  contextBridge.exposeInMainWorld('piDesktop', api)
} catch (err) {
  console.error('[preload] expose failed', err)
}

export type PiDesktopApi = typeof api
