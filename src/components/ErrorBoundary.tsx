import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportRendererError } from '../lib/errorReporter'
import { FolderIcon } from './Icon'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
  countdown: number
  autoReload: boolean
}

/**
 * 全屏错误兜底。
 *
 * 触发场景（已知 / 推测）：
 *   - ReactMarkdown 遇到极端边界输入（未闭合代码围栏、超长无空白字符串）抛错
 *   - SyntaxHighlighter (Prism) 在某些语言包未加载时挂掉
 *   - 自定义组件运行时 throw（state shape 不对、第三方依赖失败等）
 *
 * 设计：
 *   - 不让侧边栏一起白屏：错误 UI 自带 layout，居中。
 *   - 倒计时 3s 自动 location.reload()，但允许用户点"取消自动重载"自己慢慢看错误。
 *   - "复制错误详情"用 navigator.clipboard 把 stack + componentStack 整段塞剪贴板。
 *   - reload 后 ChatArea useEffect 会重新拉当前 sessionId 的历史消息，会话不会丢。
 */
export class ErrorBoundary extends Component<Props, State> {
  private timer: number | null = null
  private copyTimer: number | null = null

  state: State = {
    error: null,
    errorInfo: null,
    countdown: 3,
    autoReload: true,
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 同步写一份到 console，方便 DevTools 排查
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({ errorInfo })
    this.startCountdown()
    // 持久化到主进程日志文件，方便用户事后给开发者排查
    reportRendererError({
      source: 'ErrorBoundary',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack ?? undefined,
    })
  }

  componentWillUnmount() {
    if (this.timer != null) window.clearInterval(this.timer)
    if (this.copyTimer != null) window.clearTimeout(this.copyTimer)
  }

  private startCountdown = () => {
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = window.setInterval(() => {
      this.setState((s): Pick<State, 'countdown'> => {
        if (!s.autoReload) {
          if (this.timer != null) window.clearInterval(this.timer)
          this.timer = null
          return { countdown: s.countdown }
        }
        const next = s.countdown - 1
        if (next <= 0) {
          if (this.timer != null) window.clearInterval(this.timer)
          this.timer = null
          // 用 setTimeout 0 给一帧让 UI 显示"0"
          window.setTimeout(() => window.location.reload(), 0)
          return { countdown: 0 }
        }
        return { countdown: next }
      })
    }, 1000)
  }

  private cancelAutoReload = () => {
    if (this.timer != null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.setState({ autoReload: false })
  }

  private reloadNow = () => {
    window.location.reload()
  }

  private copyError = async () => {
    const { error, errorInfo } = this.state
    const text = [
      `Message: ${error?.message ?? '(no message)'}`,
      '',
      'Stack:',
      error?.stack ?? '(no stack)',
      '',
      'Component Stack:',
      errorInfo?.componentStack ?? '(no component stack)',
      '',
      `UserAgent: ${navigator.userAgent}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      // 临时改按钮文案
      const btn = document.getElementById('error-copy-btn')
      if (btn) {
        const old = btn.textContent
        btn.textContent = '已复制'
        if (this.copyTimer != null) window.clearTimeout(this.copyTimer)
        this.copyTimer = window.setTimeout(() => {
          if (btn) btn.textContent = old ?? '复制错误详情'
        }, 1500)
      }
    } catch (e) {
      console.warn('clipboard write failed', e)
    }
  }

  private openLogFolder = async () => {
    try {
      const bridge = (window as { piDesktop?: { log?: { revealRendererErrors?: () => Promise<unknown> } } }).piDesktop
      if (bridge?.log?.revealRendererErrors) {
        await bridge.log.revealRendererErrors()
      }
    } catch (err) {
      console.warn('[ErrorBoundary] open log folder failed', err)
    }
  }

  render() {
    const { error, errorInfo, countdown, autoReload } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg, #14171f)',
          color: 'var(--text, #e6e8ef)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 99999,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 680,
            width: '100%',
            background: 'var(--bg-panel, #1c1f29)',
            border: '1px solid var(--border, #2a2f3d)',
            borderRadius: 'var(--radius-xl)',
            padding: '28px 32px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--danger-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>页面渲染出错</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim, #9ca3af)', marginTop: 2 }}>
                别担心，会话内容已保存。重新加载后可继续。
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: 13,
              color: 'var(--danger-hover)',
              fontFamily: 'var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace)',
              wordBreak: 'break-word',
              maxHeight: 120,
              overflow: 'auto',
              marginBottom: 16,
            }}
          >
            {error.message || '(no message)'}
          </div>

          {errorInfo?.componentStack && (
            <details style={{ marginBottom: 16 }}>
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  color: 'var(--text-dim, #9ca3af)',
                  userSelect: 'none',
                }}
              >
                展开组件堆栈
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border, #2a2f3d)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  lineHeight: 1.5,
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-dim, #9ca3af)',
                }}
              >
                {errorInfo.componentStack}
              </pre>
            </details>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-dim, #9ca3af)' }}>
              {autoReload
                ? <>将在 <strong style={{ color: 'var(--accent, #6366f1)', fontVariantNumeric: 'tabular-nums' }}>{countdown}</strong> 秒后自动重新加载…</>
                : <>已取消自动重载，请手动操作。</>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                id="error-copy-btn"
                onClick={this.copyError}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border, #2a2f3d)',
                  background: 'transparent',
                  color: 'var(--text, #e6e8ef)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                复制错误详情
              </button>
              <button
                onClick={this.openLogFolder}
                title="打开 %APPDATA%/super-king-agent/logs/ 文件夹，把 renderer-errors.log 发给开发者"
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border, #2a2f3d)',
                  background: 'transparent',
                  color: 'var(--text, #e6e8ef)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <FolderIcon width={14} height={14} /> 打开日志文件夹
              </button>
              {autoReload && (
                <button
                  onClick={this.cancelAutoReload}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border, #2a2f3d)',
                    background: 'transparent',
                    color: 'var(--text, #e6e8ef)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  取消自动重载
                </button>
              )}
              <button
                onClick={this.reloadNow}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--accent, #6366f1)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                立即重新加载
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
