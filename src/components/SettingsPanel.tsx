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

  const youngFontSizes = [14, 16, 18]
  const seniorFontSizes = [18, 20, 22]
  const fontSizes = draftMode === 'senior' ? seniorFontSizes : youngFontSizes

  const handleModeChange = (newMode: 'young' | 'senior') => {
    setDraftMode(newMode)
    if (newMode === 'senior' && draftFontSize < 18) {
      setDraftFontSize(18)
    } else if (newMode === 'young' && draftFontSize > 16) {
      setDraftFontSize(14)
    }
  }

  const accentColor = draftMode === 'senior' ? '#ea580c' : 'var(--accent)'
  const accentHover = draftMode === 'senior' ? '#c2410c' : 'var(--accent-hover)'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 299,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 420, maxWidth: '90vw',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        padding: '24px 28px 20px',
        animation: 'fadeIn 0.2s ease',
        maxHeight: '90vh', overflowY: 'auto',
      }}
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>设置</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 22, padding: 0, lineHeight: 1,
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, transition: 'background 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >×</button>
        </div>

        {/* Mode Selection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>使用模式</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => handleModeChange('young')} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px', borderRadius: 12,
              textAlign: 'left', width: '100%',
              background: draftMode === 'young' ? 'rgba(37,99,235,0.08)' : 'var(--bg-hover)',
              border: draftMode === 'young' ? '2px solid var(--accent)' : '2px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: draftMode === 'young' ? 'var(--accent)' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'young' ? '#fff' : 'var(--accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c0 1.66 4 3 9 3s9-1.34 9-3v-5" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  青年教师版
                  {draftMode === 'young' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                      background: 'rgba(37,99,235,0.12)', padding: '2px 8px',
                      borderRadius: 10,
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  现代化界面，标准字体，功能完整
                </div>
              </div>
              {draftMode === 'young' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <button onClick={() => handleModeChange('senior')} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px', borderRadius: 12,
              textAlign: 'left', width: '100%',
              background: draftMode === 'senior' ? 'rgba(234,88,12,0.08)' : 'var(--bg-hover)',
              border: draftMode === 'senior' ? '2px solid #ea580c' : '2px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: draftMode === 'senior' ? '#ea580c' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'senior' ? '#fff' : '#ea580c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 18v-3" />
                  <path d="M12 8v1" />
                  <circle cx="12" cy="12" r="1" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  老教师版本
                  {draftMode === 'senior' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#ea580c',
                      background: 'rgba(234,88,12,0.12)', padding: '2px 8px',
                      borderRadius: 10,
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  大字体、高对比度、简洁布局，更适合年长教师
                </div>
              </div>
              {draftMode === 'senior' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>字体大小</div>
            {draftMode === 'senior' && (
              <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 500 }}>老教师版已自动调大</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {fontSizes.map((size) => (
              <button key={size} onClick={() => setDraftFontSize(size)} style={{
                flex: 1, padding: '12px 0', borderRadius: 10, fontSize: 14,
                background: draftFontSize === size ? accentColor : 'var(--bg-hover)',
                color: draftFontSize === size ? '#fff' : 'var(--text-muted)',
                border: draftFontSize === size ? 'none' : '1px solid var(--border)',
                cursor: 'pointer', fontWeight: draftFontSize === size ? 700 : 500,
                transition: 'all 0.15s',
              }}>
                <div style={{ fontSize: size, fontWeight: 700, marginBottom: 2 }}>Aa</div>
                <div style={{ fontSize: 11 }}>{size}px</div>
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题外观</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDraftTheme(true)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', borderRadius: 10, fontSize: 14,
              background: draftTheme ? '#1e293b' : 'var(--bg-hover)',
              color: draftTheme ? '#fff' : 'var(--text-muted)',
              border: draftTheme ? '2px solid #60a5fa' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: draftTheme ? 700 : 500,
              transition: 'all 0.15s',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button onClick={() => setDraftTheme(false)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', borderRadius: 10, fontSize: 14,
              background: !draftTheme ? '#f8fafc' : 'var(--bg-hover)',
              color: !draftTheme ? '#1e293b' : 'var(--text-muted)',
              border: !draftTheme ? '2px solid #cbd5e1' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: !draftTheme ? 700 : 500,
              transition: 'all 0.15s',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Save button */}
        <button onClick={handleSave} style={{
          width: '100%', padding: '14px 0', borderRadius: 10,
          background: accentColor,
          border: 'none', color: '#fff', fontSize: 15, fontWeight: 700,
          cursor: 'pointer', transition: 'background 0.15s',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = accentHover }}
          onMouseLeave={(e) => { e.currentTarget.style.background = accentColor }}
        >
          保存设置
        </button>
      </div>
    </div>
  )
}
