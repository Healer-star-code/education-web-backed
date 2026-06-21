import { useCallback, useEffect, useState } from 'react'
import { getCachedLocalSkills, listLocalSkills, openLocalFolder, type SkillInfo } from '../lib/piApi'

interface Props {
  cwd: string | null
  onClose: () => void
}

function SkillCard({ skill }: { skill: SkillInfo }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '10px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 700, color: 'var(--text)' }}>{skill.name}</span>
        <span style={{ fontSize: 'var(--font-xs)', color: skill.enabled ? 'var(--accent)' : 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 6px' }}>
          {skill.enabled ? 'enabled' : 'disabled'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-xs)', color: 'var(--text-dim)' }}>{skill.source}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 'var(--font-sm)', lineHeight: 1.5, color: 'var(--text-muted)' }}>
        {skill.description || 'No description'}
      </div>
    </div>
  )
}

export function SkillsPanel({ cwd: _cwd, onClose }: Props) {
  const [installedSkills, setInstalledSkills] = useState<SkillInfo[]>([])
  const [effectiveSkills, setEffectiveSkills] = useState<SkillInfo[]>([])
  const [skillsRoot, setSkillsRoot] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)

  const loadSkills = useCallback(async (options?: { silent?: boolean }) => {
    const cached = getCachedLocalSkills()

    // 有缓存时先立即显示，不闪 loading
    if (cached) {
      setInstalledSkills(cached.skills)
      setEffectiveSkills(cached.skills)
      setSkillsRoot(cached.root)
    }

    if (!options?.silent) {
      setLoading(!cached)
    }
    setError(null)
    setUnsupported(false)

    try {
      const { skills, root } = await listLocalSkills()
      setInstalledSkills(skills)
      setEffectiveSkills(skills)
      setSkillsRoot(root)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 本地增强服务未启动或没有 skills 接口
      if (message.includes('404') || message.includes('Not Found') || message.toLowerCase().includes('not found')) {
        setUnsupported(true)
      } else if (!cached) {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 298, background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxHeight: '86vh', overflow: 'hidden', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text)' }}>全局 Skills</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {unsupported ? '本地增强服务未启动或未找到 Skills' : `安装目录：${skillsRoot || '加载中...'}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!unsupported && (
              <>
                <button onClick={() => { void loadSkills() }} style={{ height: 30, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>刷新</button>
                <button onClick={async () => { try { await openLocalFolder(skillsRoot) } catch (e) { console.error('Failed to open folder', e) } }} style={{ height: 30, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>打开文件夹</button>
              </>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-lg)' }}>×</button>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--font-base) * 0.929)' }}>Loading skills...</div>}
          {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>{error}</div>}

          {unsupported && (
            <div style={{
              padding: '24px 20px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 'calc(var(--font-base) * 0.929)',
              lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>当前后端不支持 Skills 管理</div>
              <div>super-king 文档未提供 Skills 列表/安装接口。</div>
              <div style={{ marginTop: 4 }}>如需使用技能，直接在对话中让 AI 调用即可。</div>
            </div>
          )}

          {!unsupported && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <section>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>已安装到本系统的 Skills（{installedSkills.length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!loading && installedSkills.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--font-base) * 0.929)' }}>No installed skills found.</div>}
                {installedSkills.map((skill) => (
                  <SkillCard key={`installed:${skill.name}`} skill={skill} />
                ))}
              </div>
            </section>
            <section>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>当前会话实际可用 Skills（{effectiveSkills.length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!loading && effectiveSkills.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--font-base) * 0.929)' }}>No effective skills found.</div>}
                {effectiveSkills.map((skill) => <SkillCard key={`effective:${skill.source}:${skill.name}`} skill={skill} />)}
              </div>
            </section>
          </div>}
        </div>
      </div>
    </div>
  )
}
