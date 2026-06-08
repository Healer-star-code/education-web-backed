import { useEffect, useState } from 'react'
import { listSkills, type SkillInfo } from '../lib/piApi'

interface Props {
  cwd: string | null
  onClose: () => void
}

export function SkillsPanel({ cwd, onClose }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listSkills(cwd ?? undefined)
      .then((loaded) => {
        if (!cancelled) setSkills(loaded)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [cwd])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 298,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxHeight: '70vh', overflow: 'hidden',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Skills</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{cwd ?? 'global/default'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 14, overflowY: 'auto' }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading skills...</div>}
          {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}
          {!loading && !error && skills.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No skills found.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {skills.map((skill) => (
              <div key={`${skill.source}:${skill.name}`} style={{
                border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 12px', background: 'var(--bg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{skill.name}</span>
                  <span style={{ fontSize: 10, color: skill.enabled ? 'var(--accent)' : 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 6px' }}>
                    {skill.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>{skill.source}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                  {skill.description || 'No description'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
