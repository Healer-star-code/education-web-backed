import { useCallback, useEffect, useState } from 'react'
import { createSkill, deleteSkill, getSkillsRoot, listInstalledSkills, listSkills, openFolder, reinstallOfficeSkills, type SkillInfo } from '../lib/piApi'

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

function SkillCard({ skill, canDelete, onDelete }: { skill: SkillInfo; canDelete?: boolean; onDelete?: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 700, color: 'var(--text)' }}>{skill.name}</span>
        <span style={{ fontSize: 'var(--font-xs)', color: skill.enabled ? 'var(--accent)' : 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 6px' }}>
          {skill.enabled ? 'enabled' : 'disabled'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-xs)', color: 'var(--text-dim)' }}>{skill.source}</span>
        {canDelete && (
          <button onClick={onDelete} style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 'var(--font-xs)' }}>删除</button>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 'var(--font-sm)', lineHeight: 1.5, color: 'var(--text-muted)' }}>
        {skill.description || 'No description'}
      </div>
    </div>
  )
}

export function SkillsPanel({ cwd, onClose }: Props) {
  const [installedSkills, setInstalledSkills] = useState<SkillInfo[]>([])
  const [effectiveSkills, setEffectiveSkills] = useState<SkillInfo[]>([])
  const [skillsRoot, setSkillsRoot] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [saving, setSaving] = useState(false)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const installed = await listInstalledSkills()
      const effective = await listSkills(cwd ?? undefined)
      setInstalledSkills(installed.skills)
      setSkillsRoot(installed.root)
      setEffectiveSkills(effective)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => { void loadSkills() }, [loadSkills])

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setContent(DEFAULT_CONTENT)
  }, [])

  const handleCreate = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await createSkill({
        cwd: cwd ?? undefined,
        name: name.trim(),
        description: description.trim(),
        content,
      })
      resetForm()
      setShowAddForm(false)
      await loadSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [content, cwd, description, loadSkills, name, resetForm, saving])

  const handleReinstallOffice = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const installed = await reinstallOfficeSkills()
      const effective = await listSkills(cwd ?? undefined)
      setInstalledSkills(installed.skills)
      setSkillsRoot(installed.root)
      setEffectiveSkills(effective)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd])

  const canCreate = !!name.trim() && !!description.trim() && !saving

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 298, background: 'var(--overlay-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxHeight: '86vh', overflow: 'hidden', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text)' }}>全局 Skills</div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              安装目录：{skillsRoot || '加载中...'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button onClick={loadSkills} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>刷新</button>
            <button onClick={handleReinstallOffice} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>重装 Office Skills</button>
            <button onClick={async () => { try { await openFolder(await getSkillsRoot()) } catch (e) { console.error('Failed to open folder', e) } }} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>打开文件夹</button>
            <button onClick={() => setShowAddForm((v) => !v)} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: showAddForm ? 'var(--bg-selected)' : 'var(--bg-hover)', color: 'var(--text)', cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 600 }}>{showAddForm ? 'Cancel' : '+ Add Skill'}</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-lg)' }}>×</button>
          </div>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {showAddForm && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 700, color: 'var(--text)' }}>Add global skill</div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)' }}>支持文件夹 SKILL.md 和根目录 .md</div>
              </div>
              <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="lesson-planner" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 'calc(var(--font-base) * 0.929)' }} />
              <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When should the agent use this skill?" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 'calc(var(--font-base) * 0.929)' }} />
              <label style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginBottom: 4 }}>Content</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text)', fontSize: 'var(--font-sm)', lineHeight: 1.5, resize: 'vertical', fontFamily: 'var(--font-mono)' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { resetForm(); setShowAddForm(false) }} disabled={saving} style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 'var(--font-sm)' }}>Cancel</button>
                <button onClick={handleCreate} disabled={!canCreate} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: canCreate ? 'var(--accent)' : 'var(--bg-hover)', color: canCreate ? '#fff' : 'var(--text-dim)', cursor: canCreate ? 'pointer' : 'not-allowed', fontSize: 'var(--font-sm)', fontWeight: 700 }}>{saving ? 'Creating...' : 'Create Skill'}</button>
              </div>
            </div>
          )}

          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--font-base) * 0.929)' }}>Loading skills...</div>}
          {error && <div style={{ color: '#ef4444', fontSize: 'calc(var(--font-base) * 0.929)', marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <section>
              <div style={{ fontSize: 'var(--font-sm)', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>已安装到本系统的 Skills（{installedSkills.length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!loading && installedSkills.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 'calc(var(--font-base) * 0.929)' }}>No installed skills found.</div>}
                {installedSkills.map((skill) => (
                  <SkillCard
                    key={`installed:${skill.name}`}
                    skill={skill}
                    canDelete={skill.source === 'global'}
                    onDelete={async () => {
                      if (!confirm(`删除 skill：${skill.name}？`)) return
                      await deleteSkill(skill.name)
                      await loadSkills()
                    }}
                  />
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
          </div>
        </div>
      </div>
    </div>
  )
}
