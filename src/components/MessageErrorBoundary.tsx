import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportRendererError } from '../lib/errorReporter'
import { RefreshCwIcon, CopyIcon } from './Icon'

interface Props {
  children: ReactNode
  /** 出错时显示的原文（用于诊断 + 复制） */
  content?: string
  /** 关联的会话 id，方便日志定位 */
  sessionId?: string | null
  /** 关联的消息 id */
  messageId?: string
}

interface State {
  error: Error | null
}

/**
 * 单条消息级别的错误兜底。
 *
 * 设计目的：
 *   - ReactMarkdown / remark-gfm 在遇到「半截 markdown」（流式输出中砍在 token 中间、
 *     代码围栏没闭合、链接括号没闭合等）时可能 throw。
 *   - 之前一旦 throw，整个 ErrorBoundary（全屏）就会兜住，整个应用变错误页 + 倒计时 reload。
 *   - 用户的反馈：「页面渲染错误了」就是这种全屏页。
 *   - 现在用 MessageErrorBoundary 包住单条 MessageView，挂掉只影响这条消息，
 *     不影响：会话视图、其他消息、正在流式的对话、侧边栏。
 *
 *   - 显示一个红色小卡片，提示「这条消息渲染失败」+ 重试按钮 + 复制原文按钮。
 *   - 同时把错误送到主进程日志，下次出错用户直接给我们日志文件即可。
 */
export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportRendererError({
      source: 'MessageErrorBoundary',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
      sessionId: this.props.sessionId ?? null,
      contentLength: this.props.content?.length,
      extra: {
        messageId: this.props.messageId,
        contentHead: this.props.content?.slice(0, 200),
        contentTail: this.props.content && this.props.content.length > 200
          ? this.props.content.slice(-200)
          : undefined,
      },
    })
  }

  componentDidUpdate(prevProps: Props) {
    // content 变了（流式新 delta 来了或用户切到了别的消息）→ 自动重试，给一次机会
    if (this.state.error && prevProps.content !== this.props.content) {
      this.setState({ error: null })
    }
  }

  private retry = () => {
    this.setState({ error: null })
  }

  private copyOriginal = async () => {
    const text = this.props.content ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.warn('[MessageErrorBoundary] clipboard write failed', err)
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const head = (this.props.content ?? '').slice(0, 500)
    const truncated = (this.props.content ?? '').length > 500

    return (
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--danger)',
          background: 'var(--danger-bg)',
          color: 'var(--text)',
          fontSize: 'var(--font-sm)',
          lineHeight: 1.55,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--danger)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          这条消息渲染失败
        </div>
        <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 'var(--font-xs)', wordBreak: 'break-word' }}>
          {error.message || '(unknown error)'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            onClick={this.retry}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 'var(--font-xs)',
              cursor: 'pointer',
            }}
          >
            <RefreshCwIcon width={12} height={12} /> 重试渲染
          </button>
          <button
            onClick={this.copyOriginal}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 'var(--font-xs)',
              cursor: 'pointer',
            }}
          >
            <CopyIcon width={12} height={12} /> 复制原文
          </button>
        </div>
        {head && (
          <details style={{ marginTop: 10 }}>
            <summary style={{
              cursor: 'pointer',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-dim)',
              userSelect: 'none',
            }}>
              查看原文片段（前 500 字{truncated ? '，已截断' : ''}）
            </summary>
            <pre style={{
              marginTop: 6,
              padding: 8,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 200,
              overflow: 'auto',
              color: 'var(--text-dim)',
            }}>
              {head}
              {truncated ? '\n…' : ''}
            </pre>
          </details>
        )}
      </div>
    )
  }
}
