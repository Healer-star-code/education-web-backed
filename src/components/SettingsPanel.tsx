import { useState, useEffect } from 'react'

interface Props {
  isDark: boolean
  onThemeChange: (dark: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  mode: 'young' | 'senior'
  onModeChange: (mode: 'young' | 'senior') => void
  onClose: () => void
}

export function SettingsPanel({ isDark, onThemeChange, fontSize, onFontSizeChange, mode, onModeChange, onClose }: Props) {
  const [draftTheme, setDraftTheme] = useState(isDark)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)
  const [draftMode, setDraftMode] = useState(mode)

  useEffect(() => {
    queueMicrotask(() => {
      setDraftTheme(isDark)
      setDraftFontSize(fontSize)
      setDraftMode(mode)
    })
  }, [isDark, fontSize, mode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = () => {
    onThemeChange(draftTheme)
    onFontSizeChange(draftFontSize)
    onModeChange(draftMode)
    onClose()
  }

  const fontSizes = [14, 16, 18]

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 299,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 340, background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        padding: '20px 24px 16px',
        animation: 'fadeIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>设置</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDraftTheme(true)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 0', borderRadius: 8, fontSize: 13,
              background: draftTheme ? 'var(--accent)' : 'var(--bg-hover)',
              color: draftTheme ? '#fff' : 'var(--text-muted)',
              border: draftTheme ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: draftTheme ? 600 : 400,
              transition: 'all 0.15s',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button onClick={() => setDraftTheme(false)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 0', borderRadius: 8, fontSize: 13,
              background: !draftTheme ? 'var(--accent)' : 'var(--bg-hover)',
              color: !draftTheme ? '#fff' : 'var(--text-muted)',
              border: !draftTheme ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: !draftTheme ? 600 : 400,
              transition: 'all 0.15s',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              浅色
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>字体大小</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {fontSizes.map((size) => (
              <button key={size} onClick={() => setDraftFontSize(size)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
                background: draftFontSize === size ? 'var(--accent)' : 'var(--bg-hover)',
                color: draftFontSize === size ? '#fff' : 'var(--text-muted)',
                border: draftFontSize === size ? 'none' : '1px solid var(--border)',
                cursor: 'pointer', fontWeight: draftFontSize === size ? 600 : 400,
                transition: 'all 0.15s',
              }}>
                {size}px
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>模式</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={() => setDraftMode('young')} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              textAlign: 'left', width: '100%',
              background: draftMode === 'young' ? 'var(--bg-selected)' : 'var(--bg-hover)',
              border: draftMode === 'young' ? '1px solid var(--accent)' : '1px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20 }}>📚</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>青年教师版</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>现代化教学交互界面</div>
              </div>
              {draftMode === 'young' && <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>✓</span>}
            </button>
            <button onClick={() => setDraftMode('senior')} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              textAlign: 'left', width: '100%',
              background: draftMode === 'senior' ? 'var(--bg-selected)' : 'var(--bg-hover)',
              border: draftMode === 'senior' ? '1px solid var(--accent)' : '1px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20 }}>🎓</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>老教师版本</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>简洁经典布局，大字体</div>
              </div>
              {draftMode === 'senior' && <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 700 }}>✓</span>}
            </button>
          </div>
        </div>

        {/* Save button */}
        <button onClick={handleSave} style={{
          width: '100%', padding: '10px 0', borderRadius: 8,
          background: 'var(--accent)', border: 'none',
          color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', transition: 'background 0.15s',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
        >
          保存设置
        </button>
      </div>
    </div>
  )
}
