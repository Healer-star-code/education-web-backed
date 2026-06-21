// Bridge to Electron preload (window.piDesktop).
// 在浏览器中运行时，window.piDesktop 不存在，所有函数会 fallback。

export interface DesktopLocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path?: string
}

export interface PiDesktopBridge {
  app: {
    getVersion: () => string
  }
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
