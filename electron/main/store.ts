import Store from 'electron-store'

export interface DesktopSettings {
  superKingExePath: string
  superKingPort: number
  superKingPassword: string
  superKingEnv: Record<string, string>
  autoStartSuperKing: boolean
  remoteUrl: string
  useRemote: boolean
}

const defaults: DesktopSettings = {
  superKingExePath: 'E:\\super-king\\super-king.exe',
  superKingPort: 30142,
  superKingPassword: '123456',
  superKingEnv: {
    SUPER_KING_API_KEY: '',
    SUPER_KING_API_URL: '',
    SUPER_KING_MODEL_ID: '',
    SUPER_KING_PROVIDER_NAME: '',
  },
  autoStartSuperKing: false,
  remoteUrl: '',
  useRemote: false,
}

const store = new Store<DesktopSettings>({
  name: 'desktop-settings',
  defaults,
})

export function getSettings(): DesktopSettings {
  return {
    superKingExePath: (store as any).get('superKingExePath') as string,
    superKingPort: (store as any).get('superKingPort') as number,
    superKingPassword: (store as any).get('superKingPassword') as string,
    superKingEnv: (store as any).get('superKingEnv') as Record<string, string>,
    autoStartSuperKing: (store as any).get('autoStartSuperKing') as boolean,
    remoteUrl: (store as any).get('remoteUrl') as string,
    useRemote: (store as any).get('useRemote') as boolean,
  }
}

export function setSettings(patch: Partial<DesktopSettings>): DesktopSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      ;(store as any).set(key, value)
    }
  }
  return getSettings()
}

export default store
