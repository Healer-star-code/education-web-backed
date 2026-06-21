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
}

try {
  contextBridge.exposeInMainWorld('piDesktop', api)
} catch (err) {
  console.error('[preload] expose failed', err)
}

export type PiDesktopApi = typeof api
