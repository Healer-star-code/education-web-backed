import Store from 'electron-store'

export interface DesktopSettings {
  superKingExePath: string
  superKingPort: number
  superKingPassword: string
  /** Skill 资源目录（每台机器路径不一样，所以默认空串，强制用户在设置里挑） */
  skillsRoot: string
  autoStartSuperKing: boolean
  remoteUrl: string
  useRemote: boolean
  /** 自动允许所有工具调用（YOLO mode）：开启后所有 permission_requested 自动放行 */
  autoApproveAllTools: boolean
}

// 默认值原则：和机器路径相关的全部留空，强制用户首次进设置面板配置；
// 端口/密码这种「跟你机器无关」的保留兜底值。
const defaults: DesktopSettings = {
  superKingExePath: '',
  superKingPort: 30142,
  superKingPassword: '123456',
  skillsRoot: '',
  autoStartSuperKing: false,
  remoteUrl: '',
  useRemote: false,
  autoApproveAllTools: false,
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
    autoStartSuperKing: (store as any).get('autoStartSuperKing') as boolean,
    remoteUrl: (store as any).get('remoteUrl') as string,
    useRemote: (store as any).get('useRemote') as boolean,
    autoApproveAllTools: Boolean((store as any).get('autoApproveAllTools') ?? false),
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
