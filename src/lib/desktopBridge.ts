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
  skillsRoot: string
  autoStartSuperKing: boolean
  remoteUrl: string
  useRemote: boolean
  /** YOLO mode: 自动允许所有工具调用（默认 false） */
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
  file: {
    stat: (target: string) => Promise<{
      exists: boolean
      size?: number
      mtime?: number
      isDirectory?: boolean
      isFile?: boolean
    }>
    saveAs: (src: string) => Promise<{ ok: boolean; canceled?: boolean; savedTo?: string; error?: string }>
    saveText: (options: { content: string; defaultFileName?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ ok: boolean; canceled?: boolean; savedTo?: string; error?: string }>
    reveal: (target: string) => Promise<{ ok: boolean; fallback?: string; error?: string }>
    openLocal: (target: string) => Promise<{ ok: boolean; error?: string }>
    writeBlobToTemp: (payload: { buffer: ArrayBuffer | Uint8Array; fileName: string }) => Promise<{
      ok: boolean; tempPath?: string; size?: number; error?: string
    }>
    copyToSession: (payload: { tempPath: string; cwd: string; fileName: string }) => Promise<{
      ok: boolean; absPath?: string; relPath?: string; size?: number; error?: string
    }>
    readAsBase64: (target: string) => Promise<{
      ok: boolean; data?: string; mimeType?: string; size?: number; error?: string
    }>
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
    pickSkillsDir: () => Promise<string | null>
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
    }) => Promise<{ ok: boolean; path?: string; error?: string }>
    readRendererErrors: (maxBytes?: number) => Promise<{ ok: boolean; path?: string; content?: string; error?: string }>
    getRendererErrorPath: () => Promise<{ ok: boolean; path?: string; error?: string }>
    revealRendererErrors: () => Promise<{ ok: boolean; path?: string; error?: string }>
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
