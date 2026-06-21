import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FolderIcon } from './Icon'

interface Props {
  name: string
  baseDir: string
  content: string
  isLoading: boolean
}

/**
 * 单条 skill 加载步骤。与 ThinkingBlock / ToolCallRow 同级，渲染在 ReasoningBlock 内。
 *
 * 视觉风格：
 *   - 默认折叠，表头格式：「📖 已加载 skill: docx」/ 加载中时格式：「📖 正在加载 skill: docx」
 *   - 图标：打开的书本 + 加载中时书本上叠加一个旋转的小齿轮（有特色，区别于灯泡思考、扳手工具）
 *   - 完成后图标静止，颜色变 muted
 *   - 展开后用 ReactMarkdown 渲染 SKILL.md 内容
 */
export function SkillLoadRow({ name, baseDir, content, isLoading }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: 'none', border: 'none',
          color: 'var(--text-dim)', fontSize: 'var(--font-sm)',
          cursor: 'pointer', fontWeight: 500,
          textAlign: 'left',
          borderRadius: 'var(--radius-sm)',
          width: '100%',
          transition: 'background 0.12s, opacity 0.3s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        {/* 图标：打开的书本 + 加载中时书脊上有一个旋转齿轮（叠加 SVG）
            书本本身始终可见；加载中时齿轮旋转 + 书本边缘脉冲透明度 */}
        <span
          aria-hidden
          style={{
            width: 16, height: 16, flexShrink: 0,
            position: 'relative',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={isLoading ? 'var(--accent)' : 'var(--text-dim)'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              animation: isLoading ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
            }}
          >
            {/* 打开的书本 */}
            <path d="M2 4.5C2 4 2.4 3.5 3 3.5h6.5c1.4 0 2.5 1.1 2.5 2.5v14c0-1.4-1.1-2.5-2.5-2.5H2v-13z" />
            <path d="M22 4.5c0-.5-.4-1-1-1h-6.5c-1.4 0-2.5 1.1-2.5 2.5v14c0-1.4 1.1-2.5 2.5-2.5H22v-13z" />
          </svg>
          {isLoading && (
            <svg
              width="9" height="9" viewBox="0 0 24 24" fill="none"
              stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                position: 'absolute',
                right: -1, bottom: -1,
                animation: 'spin 1.6s linear infinite',
                transformOrigin: '50% 50%',
                background: 'var(--bg-panel)', borderRadius: '50%',
              }}
            >
              {/* 小齿轮 */}
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
          )}
        </span>
        <span style={{ flex: 1 }}>
          {isLoading ? `正在加载 skill: ${name}` : `已加载 skill: ${name}`}
        </span>
        <svg
          width="11" height="11" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      {expanded && (
        <div
          style={{
            padding: '8px 12px 10px',
            fontSize: 'calc(var(--font-base) * 0.929)',
            lineHeight: 'var(--msg-line-height, 1.7)',
            color: 'var(--text-muted)',
            wordBreak: 'break-word',
            maxHeight: 360, overflowY: 'auto',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            marginTop: 2,
          }}
        >
          {baseDir && (
            <div
              style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--text-dim)',
                marginBottom: 6,
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
              }}
            >
              <FolderIcon width={11} height={11} /> {baseDir}
            </div>
          )}
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>（内容为空）</span>
          )}
        </div>
      )}
    </div>
  )
}
