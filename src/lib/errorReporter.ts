import { getDesktopBridge } from './desktopBridge'

/**
 * 渲染进程统一错误上报：把 React / 全局 JS 错误送到主进程持久化到
 * %APPDATA%/super-king-agent/logs/renderer-errors.log。
 *
 * 用户碰到「页面渲染错误」时不需要看清错误页就能给我们日志，
 * 直接打开日志文件粘给开发者即可定位 bug。
 *
 * - 浏览器/dev 模式（无 bridge）：只 console.error
 * - Electron：调用 bridge.log.rendererError IPC
 *
 * 永远不会 throw，因为这是兜底的最后一道防线。
 */

export interface ReportPayload {
  source: string
  message?: string
  stack?: string
  componentStack?: string
  sessionId?: string | null
  contentLength?: number
  extra?: Record<string, unknown>
}

let lastReportKey = ''
let lastReportTime = 0

export function reportRendererError(payload: ReportPayload): void {
  try {
    // 去重：同一个 (source, message) 1 秒内只报一次，防止 onerror 风暴
    const key = `${payload.source}::${payload.message ?? ''}`
    const now = Date.now()
    if (key === lastReportKey && now - lastReportTime < 1000) return
    lastReportKey = key
    lastReportTime = now

    // 同时 console.error 一份，方便 DevTools 排查
    console.error(`[errorReporter:${payload.source}]`, payload.message ?? '(no message)', payload)

    const bridge = getDesktopBridge()
    if (!bridge?.log?.rendererError) return
    void bridge.log.rendererError({
      source: payload.source,
      message: payload.message,
      stack: payload.stack,
      componentStack: payload.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      sessionId: payload.sessionId ?? null,
      contentLength: payload.contentLength,
      extra: payload.extra,
    }).catch((err) => {
      console.warn('[errorReporter] IPC failed', err)
    })
  } catch (err) {
    // 必须吞掉，否则报错处理本身会抛
    try { console.warn('[errorReporter] internal failure', err) } catch {}
  }
}

/**
 * 注册全局兜底：window.onerror + window.onunhandledrejection
 * 在 main.tsx 启动时调用一次即可。
 */
export function installGlobalErrorReporters(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    reportRendererError({
      source: 'window.onerror',
      message: event.message,
      stack: event.error?.stack,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    reportRendererError({
      source: 'unhandledrejection',
      message,
      stack,
    })
  })
}
