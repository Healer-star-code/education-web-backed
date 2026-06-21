// Bridge to Electron preload (window.piDesktop).

export interface DesktopLocalSkillInfo {
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

export interface PiDesktopBridge {
  app: { getVersion: () => string }
  dialog: {
    selectDirectory: (defaultPath?: string) => Promise<string | null>
    selectFile: (options?: {
      filters?: { name: string; extensions: string[] }[]
      defaultPath?: string
    }) => Promise<string | null>
  }
  shell: {
    openPath: (target: string) => Promise<{ ok: boolean; error?: string }>
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
  }
  local: {
    health: () => Promise<{ ok: true }>
    getSkillsRoot: () => Promise<{ path: string }>
    listSkills: (rootOverride?: string) => Promise<{ skills: DesktopLocalSkillInfo[]; root: string }>
    openFolder: (target?: string) => Promise<{ ok: boolean; error?: string }>
  }
  superking: {
    status: () => Promise<SuperKingStatus>
    start: () => Promise<SuperKingStatus>
    stop: () => Promise<SuperKingStatus>
    restart: () => Promise<SuperKingStatus>
    clearError: () => Promise<SuperKingStatus>
    pickExe: () => Promise<string | null>
    logs: () => Promise<{ stdout: string; stderr: string }>
    onStatusChange: (cb: (status: SuperKingStatus) => void) => () => void
  }
  settings: {
    get: () => Promise<DesktopSettingsShape>
    set: (patch: Partial<DesktopSettingsShape>) => Promise<DesktopSettingsShape>
  }
  events: {
    onOpenSettings: (cb: () => void) => () => void
  }
  updater: {
    state: () => Promise<UpdaterState>
    check: () => Promise<UpdaterState>
    download: () => Promise<UpdaterState>
    install: () => Promise<{ ok: boolean }>
    onChange: (cb: (state: UpdaterState) => void) => () => void
  }
}

declare global {
  interface Window {
    piDesktop?: PiDesktopBridge
  }
}

export function getDesktopBridge(): PiDesktopBridge | null {
  if (typeof window === 'undefined') return null
  return window.piDesktop ?? null
}

export const isDesktop = typeof window !== 'undefined' && !!window.piDesktop
