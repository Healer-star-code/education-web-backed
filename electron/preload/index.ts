import { contextBridge, ipcRenderer } from 'electron'

export interface LocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path?: string
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
}

try {
  contextBridge.exposeInMainWorld('piDesktop', api)
} catch (err) {
  console.error('[preload] expose failed', err)
}

export type PiDesktopApi = typeof api
