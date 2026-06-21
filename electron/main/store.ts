import Store from 'electron-store'

export interface DesktopSettings {
  superKingExePath: string
  superKingPort: number
  superKingPassword: string
  /** Skill 资源目录（每台机器路径不一样，所以默认空串，强制用户在设置里挑） */
  skillsRoot: string
  superKingEnv: Record<string, string>
  autoStartSuperKing: boolean
  remoteUrl: string
  useRemote: boolean
}

// 默认值原则：和机器路径相关的全部留空，强制用户首次进设置面板配置；
// 端口/密码这种「跟你机器无关」的保留兜底值。
const defaults: DesktopSettings = {
  superKingExePath: '',
  superKingPort: 30142,
  superKingPassword: '123456',
  skillsRoot: '',
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
    skillsRoot: ((store as any).get('skillsRoot') as string) ?? '',
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
