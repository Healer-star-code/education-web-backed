import { useCallback, useEffect, useState } from 'react'
import { createSkill, listSkills, openFolder, type SkillInfo } from '../lib/piApi'

interface Props {
  cwd: string | null
  onClose: () => void
}

const DEFAULT_CONTENT = `Describe when this skill should be used and how the agent should behave.

## Workflow

1. Understand the user's goal.
2. Gather the necessary context.
3. Produce the requested result.
`

export function SkillsPanel({ cwd, onClose }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [saving, setSaving] = useState(false)

  const loadSkills = useCallback(() => {
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

  useEffect(() => loadSkills(), [loadSkills])

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setContent(DEFAULT_CONTENT)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!cwd || saving) return
    setSaving(true)
    setError(null)
    try {
      await createSkill({
        cwd,
        name: name.trim(),
        description: description.trim(),
        content,
      })
      resetForm()
      setShowAddForm(false)
      const loaded = await listSkills(cwd)
      setSkills(loaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [content, cwd, description, name, resetForm, saving])

  const canCreate = !!cwd && !!name.trim() && !!description.trim() && !saving

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 298,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 620, maxHeight: '82vh', overflow: 'hidden',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Skills</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cwd ?? 'global/default'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={async () => { if (cwd) { try { await openFolder(`${cwd}/.pi/skills`) } catch (e) { console.error('Failed to open folder', e) } } }}
              disabled={!cwd}
              style={{
                height: 30, padding: '0 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-hover)',
                color: cwd ? 'var(--text)' : 'var(--text-dim)', cursor: cwd ? 'pointer' : 'not-allowed',
                fontSize: 12, fontWeight: 600,
              }}
            >
              打开文件夹
            </button>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              disabled={!cwd}
              style={{
                height: 30, padding: '0 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: showAddForm ? 'var(--bg-selected)' : 'var(--bg-hover)',
                color: cwd ? 'var(--text)' : 'var(--text-dim)', cursor: cwd ? 'pointer' : 'not-allowed',
                fontSize: 12, fontWeight: 600,
              }}
            >
              {showAddForm ? 'Cancel' : '+ Add Skill'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {showAddForm && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Add project skill</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>writes to .pi/skills</div>
              </div>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="lesson-planner"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 13 }}
              />
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When should the agent use this skill?"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 13 }}
              />
              <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 12, lineHeight: 1.5, resize: 'vertical', fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => { resetForm(); setShowAddForm(false) }}
                  disabled={saving}
                  style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: canCreate ? 'var(--accent)' : 'var(--bg-hover)', color: canCreate ? '#fff' : 'var(--text-dim)', cursor: canCreate ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}
                >
                  {saving ? 'Creating...' : 'Create Skill'}
                </button>
              </div>
            </div>
          )}

          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading skills...</div>}
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
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
