import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment, AgentStep, ArtifactInfo } from '../mockData'
import { MessageView } from './MessageView'
import { MessageErrorBoundary } from './MessageErrorBoundary'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { ReasoningBlock } from './ReasoningBlock'

import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import xiaojinGif from '../assets/xiaojin.gif'

import {
  connectSessionEvents,
  createSession,
  getMessages,
  sendPrompt,
  abortSession,
  resolvePermission,
  answerQuestion,
  rejectQuestion,
  type WebAgentEvent,
  type PermissionRequestInfo,
  type QuestionInfo,
  type ModelProviderInfo,
  type ConfigInfo,
  type ApiImagePayload,
} from '../lib/piApi'
import { detectLocalArtifacts } from '../lib/artifactDetector'
import { getDesktopBridge, isDesktop } from '../lib/desktopBridge'
import { createSkillStreamParser, extractSkillBlocks, type SkillStreamParser } from '../lib/skillContentParser'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSessionCreated?: (session: SessionInfo) => void
  modelProviders: ModelProviderInfo[]
  config: ConfigInfo | null
  onSwitchModel: (sessionId: string, provider: string, modelId: string) => void
  /** YOLO mode: 收到 permission_requested 时自动允许，不弹窗 */
  autoApproveAllTools?: boolean
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? `v${__APP_VERSION__}`

function mergeConsecutiveAssistantMessages(messages: Message[]): Message[] {
  const merged: Message[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && merged.length > 0) {
      const prev = merged[merged.length - 1]
      if (prev.role === 'assistant') {
        merged[merged.length - 1] = {
          ...prev,
          content: [prev.content, msg.content].filter(Boolean).join('\n'),
          steps: [...(prev.steps ?? []), ...(msg.steps ?? [])],
          artifacts: [...(prev.artifacts ?? []), ...(msg.artifacts ?? [])],
          pendingTask: msg.pendingTask ?? prev.pendingTask,
        }
        continue
      }
    }
    merged.push({ ...msg })
  }
  return merged
}

function convertWebMessagesToUi(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return loadedMessages.map((msg) => {
    const steps: AgentStep[] = []
    if (msg.thinkingContent) {
      steps.push({
        type: 'thinking',
        id: `think-${msg.id}`,
        content: msg.thinkingContent,
        durationMs: msg.thinkingDurationMs ?? 0,
        isThinking: false,
      })
    }
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        steps.push({
          type: 'tool',
          id: tc.id,
          name: tc.name,
          status: tc.status,
          args: tc.args,
          result: tc.result,
        })
      }
    }
    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      steps,
      artifacts: msg.artifacts,
    }
  })
}

function normalizeLoadedMessages(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return mergeConsecutiveAssistantMessages(convertWebMessagesToUi(loadedMessages))
}

function formatPendingElapsed(ms: number) {
  if (ms <= 0) return ''
  if (ms < 1000) return `${ms}毫秒`
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`
}

function PendingTaskCard({ task }: { task?: 'word' | 'default' }) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [task])

  const label = task === 'word' ? '正在生成 Word 文档' : '正在处理'
  const timeText = formatPendingElapsed(elapsedMs)

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 10,
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      color: 'var(--text-muted)', fontSize: 'var(--font-sm)',
      marginBottom: 8,
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '1.5px solid var(--accent)',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block', flexShrink: 0,
      }} />
      <span>{timeText ? `${label} · 已耗时 ${timeText}` : label}</span>
    </div>
  )
}

const TYPEWRITER_PHRASES = [
  '准备好了吗？',
  '有什么想问的？',
  '一起来做点酷的事。',
  '探索你的代码库。',
  '起草一份教案。',
  '总结这篇论文。',
  '规划你的课程。',
  '用简单的话解释一下。',
  '和我结对编程。',
  '修复那个烦人的 bug。',
  '翻译成中文。',
  '写一首俳句。',
  '头脑风暴一下。',
  '帮我审查代码。',
  '发布上线！',
  '让它更好看。',
  '和我一起理清思路。',
]

function toMessageAttachments(attachments: LocalAttachment[] | undefined): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  return attachments.map((att) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    type: att.file.type.startsWith('image/') ? 'image'
      : att.name.toLowerCase().endsWith('.pdf') ? 'pdf'
        : /\.(doc|docx)$/i.test(att.name) ? 'document'
          : /\.(ppt|pptx)$/i.test(att.name) ? 'presentation'
            : /\.(xls|xlsx|csv)$/i.test(att.name) ? 'spreadsheet'
              : /\.(txt|md)$/i.test(att.name) ? 'text'
                : 'file',
    mimeType: att.file.type,
    size: att.file.size,
  }))
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated, modelProviders, config, onSwitchModel, autoApproveAllTools = false }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMessages, setHasMessages] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequestInfo[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<QuestionInfo[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const sdkSessionInfoRef = useRef<SessionInfo | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const eventReadySessionIdRef = useRef<string | null>(null)
  const eventReadyResolveRef = useRef<(() => void) | null>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)
  const currentThinkingStepIdRef = useRef<string | null>(null)
  const pendingToolUpdateRef = useRef<{ toolCallId: string; partialResult: unknown } | null>(null)
  const toolUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 流式 delta 缓冲（修复白屏：之前每个 SSE delta 都触发一次 setState + Markdown 重渲染）
  const pendingTextDeltaRef = useRef<string>('')
  const textDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingThinkingDeltaRef = useRef<string>('')
  const thinkingDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // skill_content 流式解析器：从 assistant_delta 中识别并抽出 <skill_content>...</skill_content>
  // 块，避免它们被当作普通文本拼进 message.content。
  const skillParserRef = useRef<SkillStreamParser | null>(null)
  // 流式中临时缓存当前一段普通文本（解析器 onText 回调收集），下次 flush 时拼进
  // pendingTextDeltaRef，由原有 60ms 节流接管渲染。
  const pendingSkillFreeTextRef = useRef<string>('')
  const isUserNearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  const normalizeSessionIdRef = useRef<string | null>(null)
  const toolPermissionMapRef = useRef<Map<string, PermissionRequestInfo>>(new Map())

  // 本会话自动允许的权限规则：{ sessionId -> { kindKey -> true } }
  const allowedSessionPermissionsRef = useRef<Map<string, Set<string>>>(new Map())

  // YOLO mode：autoApproveAllTools 的 ref 镜像（handleAgentEvent 是稳定闭包，state 拿不到最新值）
  const autoApproveAllToolsRef = useRef(autoApproveAllTools)
  useEffect(() => {
    autoApproveAllToolsRef.current = autoApproveAllTools
  }, [autoApproveAllTools])

  // YOLO 开启时立刻 flush 所有 pending permissions：直接 resolve(true) 并清空队列
  // 防止开启前已有 pending dialog 在屏幕上继续渲染（可能因 diff 对象等历史 bug 崩溃）
  useEffect(() => {
    if (!autoApproveAllTools) return
    setPendingPermissions((prev) => {
      if (prev.length === 0) return prev
      for (const req of prev) {
        const sid = req.sessionId || sdkSessionIdRef.current
        if (!sid) continue
        void resolvePermission(sid, req.permissionId, true).catch((err) => {
          console.error('[YOLO] flush pending permission failed:', err)
        })
      }
      return []
    })
  }, [autoApproveAllTools])

  function getPermissionKey(kind: string, options: unknown): string {
    return `${kind}:${JSON.stringify(options ?? {})}`
  }

  function isSessionAllowed(sessionId: string, kind: string, options: unknown): boolean {
    const set = allowedSessionPermissionsRef.current.get(sessionId)
    if (!set) return false
    return set.has(getPermissionKey(kind, options))
  }

  function addSessionAllowed(sessionId: string, kind: string, options: unknown) {
    let set = allowedSessionPermissionsRef.current.get(sessionId)
    if (!set) {
      set = new Set()
      allowedSessionPermissionsRef.current.set(sessionId, set)
    }
    set.add(getPermissionKey(kind, options))
  }

  const normalizeMessagesForSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return
    normalizeSessionIdRef.current = sessionId
    try {
      const loadedMessages = await getMessages(sessionId)
      if (normalizeSessionIdRef.current !== sessionId) return
      setMessages((currentMessages) => {
        // 保留当前 UI 中正在等待授权的 tool step 状态，避免 normalize 把它覆盖回 running
        const waitingMap = new Map<string, string>()
        for (const msg of currentMessages) {
          for (const step of msg.steps ?? []) {
            if (step.type === 'tool' && step.status === 'waiting_permission' && step.permissionId) {
              waitingMap.set(step.id, step.permissionId)
            }
          }
        }

        // 保留前端 detector 算出来的 local-scan artifacts（后端不知道这些卡片，
        // 如果不保留，agent_end 内刚写入的文件卡片会被 normalize 覆盖丢失）。
        // 按 (role + content 前 200 字 + content 长度) 作为消息指纹匹配。
        const localArtifactsByFingerprint = new Map<string, ArtifactInfo[]>()
        for (const msg of currentMessages) {
          if (msg.role !== 'assistant' || !msg.artifacts || msg.artifacts.length === 0) continue
          const localOnes = msg.artifacts.filter((a) => a.source === 'local-scan')
          if (localOnes.length === 0) continue
          const fp = `${msg.role}|${(msg.content ?? '').length}|${(msg.content ?? '').slice(0, 200)}`
          localArtifactsByFingerprint.set(fp, localOnes)
        }

        let normalized = normalizeLoadedMessages(loadedMessages)
        if (waitingMap.size > 0) {
          normalized = normalized.map((msg) => {
            if (msg.role !== 'assistant' || !msg.steps) return msg
            return {
              ...msg,
              steps: msg.steps.map((s) => {
                if (s.type === 'tool' && waitingMap.has(s.id)) {
                  return { ...s, status: 'waiting_permission' as const, permissionId: waitingMap.get(s.id) }
                }
                return s
              }),
            }
          })
        }
        if (localArtifactsByFingerprint.size > 0) {
          normalized = normalized.map((msg) => {
            if (msg.role !== 'assistant') return msg
            const fp = `${msg.role}|${(msg.content ?? '').length}|${(msg.content ?? '').slice(0, 200)}`
            const carry = localArtifactsByFingerprint.get(fp)
            if (!carry) return msg
            // 已有的 backend artifact 优先；按 path 去重避免双卡片
            const existingPaths = new Set((msg.artifacts ?? []).map((a) => (a.localPath ?? a.path ?? '').toLowerCase()))
            const keep = carry.filter((a) => !existingPaths.has((a.localPath ?? a.path ?? '').toLowerCase()))
            if (keep.length === 0) return msg
            console.info(`[artifactDetector] normalize: carrying ${keep.length} local artifact(s) to msg=${msg.id}`)
            return { ...msg, artifacts: [...(msg.artifacts ?? []), ...keep] }
          })
        }
        return normalized
      })
      forceScrollRef.current = true
      // 历史消息加载完后，对每条 assistant 消息跑本地路径扫描，让"重新打开会话"也能看到文件卡片
      if (isDesktop) {
        const bridge = getDesktopBridge()
        if (bridge?.file?.stat) {
          void (async () => {
            try {
              let snapshot: Message[] = []
              setMessages((prev) => { snapshot = prev; return prev })
              const updates = new Map<string, ArtifactInfo[]>()
              for (const msg of snapshot) {
                if (msg.role !== 'assistant' || !msg.content) continue
                const detected = await detectLocalArtifacts(
                  msg.content,
                  sessionId,
                  msg.artifacts ?? [],
                  (p) => bridge.file.stat(p),
                )
                if (detected.length > 0) updates.set(msg.id, detected)
              }
              if (updates.size === 0) return
              if (normalizeSessionIdRef.current !== sessionId) return
              setMessages((prev) => prev.map((m) => {
                const add = updates.get(m.id)
                return add ? { ...m, artifacts: [...(m.artifacts ?? []), ...add] } : m
              }))
            } catch (err) {
              console.warn('[artifactDetector] history scan failed', err)
            }
          })()
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Normalize messages failed:', err)
      setError(`整理会话消息失败：${message}`)
    }
  }, [])

  const handleAgentEvent = useCallback((event: WebAgentEvent) => {
    if (event.type === 'connected') {
      if (eventReadyResolveRef.current) {
        eventReadyResolveRef.current()
        eventReadyResolveRef.current = null
      }
      eventReadySessionIdRef.current = event.sessionId
      return
    }

    switch (event.type) {
      case 'agent_start':
        setStreaming(true)
        setError(null)
        break
      case 'thinking_start': {
        currentThinkingRef.current = ''
        currentThinkingStartRef.current = Date.now()
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const stepId = 'think-' + Date.now()
        currentThinkingStepIdRef.current = stepId
        const step: AgentStep = { type: 'thinking', id: stepId, content: '', durationMs: 0, isThinking: true }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'thinking_delta': {
        currentThinkingRef.current += event.delta
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        if (!assistantId || !stepId) return
        // 节流 60ms：避免每个 SSE delta 都触发一次 React 重渲染（白屏修复的核心）
        pendingThinkingDeltaRef.current = currentThinkingRef.current
        if (thinkingDeltaTimerRef.current) break
        thinkingDeltaTimerRef.current = setTimeout(() => {
          thinkingDeltaTimerRef.current = null
          const latestContent = pendingThinkingDeltaRef.current
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content: latestContent } : s
            )) }
          }))
        }, 60)
        break
      }
      case 'thinking_end': {
        const content = event.content || currentThinkingRef.current
        currentThinkingRef.current = content
        const durationMs = Date.now() - currentThinkingStartRef.current
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        // 立刻 flush pending thinking delta（保证 thinking_end 不被节流的 setTimeout 覆盖）
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (assistantId && stepId) {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content, durationMs, isThinking: false } : s
            )) }
          }))
        }
        currentThinkingStepIdRef.current = null
        break
      }
      case 'assistant_delta': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) return

        // 懒初始化 skill 解析器
        if (!skillParserRef.current) {
          skillParserRef.current = createSkillStreamParser({
            onText: (text) => {
              pendingSkillFreeTextRef.current += text
            },
            onSkillStart: (id, name, baseDir) => {
              const step: AgentStep = {
                type: 'skill_load',
                id,
                name,
                baseDir,
                content: '',
                isLoading: true,
              }
              setMessages((prev) => prev.map((msg) => (
                msg.id === assistantId
                  ? { ...msg, steps: [...(msg.steps ?? []), step] }
                  : msg
              )))
            },
            onSkillDelta: (id, content) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, content: s.content + content }
                      : s,
                  ),
                }
              }))
            },
            onSkillEnd: (id) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, isLoading: false }
                      : s,
                  ),
                }
              }))
            },
          })
        }
        // 把原始 delta 喂给解析器；纯文本部分会累积到 pendingSkillFreeTextRef
        skillParserRef.current.push(event.delta)

        // 60ms 节流：把累积的"非 skill 文本"刷新到 message.content（保留白屏修复）
        const buffered = pendingSkillFreeTextRef.current
        pendingSkillFreeTextRef.current = ''
        if (buffered) pendingTextDeltaRef.current += buffered
        if (textDeltaTimerRef.current) break
        textDeltaTimerRef.current = setTimeout(() => {
          textDeltaTimerRef.current = null
          // 节流到期前可能又有新的 onText 回调进来，再合并一次
          const moreBuf = pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
          if (moreBuf) pendingTextDeltaRef.current += moreBuf
          const toFlush = pendingTextDeltaRef.current
          pendingTextDeltaRef.current = ''
          if (!toFlush) return
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
          )))
        }, 60)
        break
      }
      case 'tool_start': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const step: AgentStep = {
          type: 'tool',
          id: event.toolCallId,
          name: event.toolName,
          status: 'running',
          args: event.args,
        }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'tool_update': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        pendingToolUpdateRef.current = { toolCallId: event.toolCallId, partialResult: event.partialResult }
        if (toolUpdateTimerRef.current) return
        toolUpdateTimerRef.current = setTimeout(() => {
          toolUpdateTimerRef.current = null
          const pending = pendingToolUpdateRef.current
          if (!pending) return
          pendingToolUpdateRef.current = null
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
            )) }
          }))
        }, 200)
        break
      }
      case 'tool_end': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, status: event.isError ? 'error' : 'done', result: event.result } : s
          )) }
        }))
        break
      }
      case 'artifact_created': {
        const assistantId = currentAssistantIdRef.current
        setMessages((prev) => {
          const targetId = assistantId ?? [...prev].reverse().find((msg) => msg.role === 'assistant')?.id
          if (!targetId) return prev
          return prev.map((msg) => (
            msg.id === targetId ? { ...msg, artifacts: [...(msg.artifacts ?? []), event.artifact] } : msg
          ))
        })
        break
      }
      case 'session_renamed':
        sdkSessionInfoRef.current = sdkSessionInfoRef.current
          ? { ...sdkSessionInfoRef.current, name: event.name, titleSource: event.titleSource, aiTitleGenerated: event.aiTitleGenerated }
          : sdkSessionInfoRef.current
        onSessionCreated?.({
          id: event.sessionId,
          cwd: sdkSessionInfoRef.current?.cwd ?? selectedCwd ?? '',
          sessionFile: sdkSessionInfoRef.current?.sessionFile,
          created: sdkSessionInfoRef.current?.created ?? new Date().toISOString(),
          modified: new Date().toISOString(),
          firstMessage: sdkSessionInfoRef.current?.firstMessage ?? '',
          messageCount: sdkSessionInfoRef.current?.messageCount ?? 0,
          name: event.name,
          titleSource: event.titleSource,
          aiTitleGenerated: event.aiTitleGenerated,
        })
        break
      case 'agent_end': {
        setStreaming(false)
        const sessionId = sdkSessionIdRef.current
        const finishedAssistantId = currentAssistantIdRef.current
        currentAssistantIdRef.current = null

        // 流结束：把 skill 解析器剩余缓冲全部 flush。把任何剩余的「非 skill 纯文本」
        // 也并入 pendingTextDeltaRef，下面的 tailText 会一起写到 message.content。
        if (skillParserRef.current) {
          skillParserRef.current.flush()
          skillParserRef.current = null
        }
        if (pendingSkillFreeTextRef.current) {
          pendingTextDeltaRef.current += pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
        }

        // 立刻 flush 所有 pending delta，防止节流的 setTimeout 在 setStreaming(false) 之后才落地，
        // 造成"看上去结束了但末尾字符没写进消息"或与 normalize 抢覆盖。
        if (textDeltaTimerRef.current) {
          clearTimeout(textDeltaTimerRef.current)
          textDeltaTimerRef.current = null
        }
        const tailText = pendingTextDeltaRef.current
        pendingTextDeltaRef.current = ''
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (tailText && finishedAssistantId) {
          setMessages((prev) => prev.map((msg) => (
            msg.id === finishedAssistantId ? { ...msg, content: msg.content + tailText } : msg
          )))
        }
        if (sessionId) {
          void normalizeMessagesForSession(sessionId)
        }
        // 启发式扫描：从 assistant 消息文本里抓本地路径，验证存在后追加 artifact 卡片
        // 仅桌面端（需要 file:stat IPC）；后端已发 backend artifact 的会自动去重
        console.info(`[artifactDetector] agent_end entry: isDesktop=${isDesktop} sessionId=${sessionId ? 'ok' : 'null'} assistantId=${finishedAssistantId ?? 'null'}`)
        if (isDesktop && sessionId && finishedAssistantId) {
          const bridge = getDesktopBridge()
          console.info(`[artifactDetector] bridge.file.stat available=${!!bridge?.file?.stat}`)
          if (bridge?.file?.stat) {
            void (async () => {
              try {
                // 用 setMessages(prev => prev) 拿到最新 messages 快照（避免 stale closure）
                let snapshot: Message[] = []
                setMessages((prev) => { snapshot = prev; return prev })
                const target = snapshot.find((m) => m.id === finishedAssistantId)
                if (!target) {
                  console.warn(`[artifactDetector] msg=${finishedAssistantId} not found in snapshot (len=${snapshot.length})`)
                  return
                }
                // ⚠️ React setState 是异步的：上面的 flush(setMessages prev.map content+tailText)
                // 还没真正落地到 state，这里读 target.content 可能是不含 tailText 的旧内容。
                // 路径文本（"位置: E:\xxx\file.docx"）通常出现在消息末尾，正好在 tailText 里。
                // 因此必须手动拼接 tailText 再丢给 detector，否则正则匹配不到 → 卡片不出现。
                const fullText = (target.content ?? '') + (tailText ?? '')
                console.info(`[artifactDetector] msg=${finishedAssistantId} content.len=${(target.content ?? '').length} tailText.len=${(tailText ?? '').length} fullText.len=${fullText.length}`)
                console.info(`[artifactDetector] fullText preview: ${fullText.slice(0, 200).replace(/\n/g, '\\n')}${fullText.length > 200 ? '…' : ''}`)
                const detected = await detectLocalArtifacts(
                  fullText,
                  sessionId,
                  target.artifacts ?? [],
                  (p) => bridge.file.stat(p),
                )
                console.info(`[artifactDetector] msg=${finishedAssistantId} found ${detected.length} local artifact(s)`)
                if (detected.length === 0) return
                setMessages((prev) => prev.map((msg) => (
                  msg.id === finishedAssistantId
                    ? { ...msg, artifacts: [...(msg.artifacts ?? []), ...detected] }
                    : msg
                )))
              } catch (err) {
                console.warn('[artifactDetector] scan failed', err)
              }
            })()
          }
        }
        break
      }
      case 'permission_requested': {
        const sessionId = sdkSessionIdRef.current
        const request = event.request
        if (!sessionId) break

        // YOLO mode：全局自动允许（优先级最高，跳过一切兜底逻辑）
        if (autoApproveAllToolsRef.current) {
          void resolvePermission(sessionId, request.permissionId, true).catch((err) => {
            console.error('[YOLO] auto-approve permission failed:', err)
          })
          break
        }

        if (isSessionAllowed(sessionId, request.kind, request.options)) {
          void resolvePermission(sessionId, request.permissionId, true)
          break
        }

        setPendingPermissions((prev) => {
          if (prev.some((p) => p.permissionId === request.permissionId)) return prev
          return [...prev, request]
        })

        // 将当前正在运行的对应工具标记为等待授权，并记录 toolStepId -> permission 映射
        setMessages((prev) => prev.map((msg) => {
          if (msg.role !== 'assistant' || !msg.steps) return msg
          return {
            ...msg,
            steps: msg.steps.map((s) => {
              if (s.type === 'tool' && s.name === request.kind && s.status === 'running') {
                toolPermissionMapRef.current.set(s.id, request)
                return { ...s, status: 'waiting_permission' as const, permissionId: request.permissionId }
              }
              return s
            }),
          }
        }))
        break
      }
      case 'permission_resolved': {
        setPendingPermissions((prev) => prev.filter((p) => p.permissionId !== event.permissionId))
        break
      }
      case 'question': {
        const q = event.question
        setPendingQuestions((prev) => {
          if (prev.some((x) => x.questionId === q.questionId)) return prev
          return [...prev, q]
        })
        break
      }
      case 'question_resolved': {
        setPendingQuestions((prev) => prev.filter((q) => q.questionId !== event.questionId))
        break
      }
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [onSessionCreated, selectedCwd])

  const connectEvents = useCallback(async (sessionId: string): Promise<void> => {
    if (eventSourceRef.current && eventReadySessionIdRef.current === sessionId) {
      return
    }

    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

    return new Promise((resolve) => {
      // SSE 连接应尽快就绪，但不应阻塞用户发送消息。
      // 2 秒内收到 open/connected 即认为就绪；否则也放行，由后续 prompt 调用自己报错。
      const timeout = setTimeout(() => {
        eventReadyResolveRef.current = null
        resolve()
      }, 2000)

      eventReadyResolveRef.current = () => {
        clearTimeout(timeout)
        eventReadyResolveRef.current = null
        resolve()
      }

      try {
        eventSourceRef.current = connectSessionEvents(sessionId, handleAgentEvent)
      } catch (err) {
        clearTimeout(timeout)
        eventReadyResolveRef.current = null
        console.error('Failed to connect session events:', err)
        resolve()
      }
    })
  }, [handleAgentEvent])

  const ensureSdkSession = useCallback(async () => {
    if (sdkSessionIdRef.current && sdkSessionInfoRef.current) return sdkSessionInfoRef.current
    const cwd = newSessionCwd ?? session?.cwd ?? selectedCwd ?? undefined
    const created = await createSession(cwd)
    sdkSessionIdRef.current = created.id
    sdkSessionInfoRef.current = created
    await connectEvents(created.id)
    return created
  }, [connectEvents, newSessionCwd, selectedCwd, session?.cwd])

  const handleSend = useCallback(async (text: string, attachments?: LocalAttachment[]) => {
    const userAttachments = toMessageAttachments(attachments)
    const userMsg: Message = {
      id: 'u' + Date.now(),
      role: 'user',
      content: text,
      attachments: userAttachments,
      timestamp: new Date().toISOString(),
    }
    const assistantId = 'a' + Date.now()
    const lower = text.toLowerCase()
    const isWordTask = lower.includes('word') || lower.includes('docx') || lower.includes('文档') || lower.includes('word文档') || lower.includes('word文件')
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      steps: [],
      pendingTask: isWordTask ? 'word' : 'default',
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasMessages(true)
    forceScrollRef.current = true
    setStreaming(true)
    setError(null)
    currentAssistantIdRef.current = assistantId
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null

    try {
      const sdkSession = await ensureSdkSession()
      // 必须等 SSE 连接就绪再发 prompt，否则权限事件可能丢失
      await connectEvents(sdkSession.id)
      const updatedSession = {
        ...sdkSession,
        firstMessage: sdkSession.firstMessage || text,
        messageCount: Math.max(sdkSession.messageCount, 1),
        modified: new Date().toISOString(),
      }
      sdkSessionInfoRef.current = updatedSession
      onSessionCreated?.(updatedSession)

      // ---- 附件处理：图片 base64 / 文档复制到 <cwd>/.uploads/ ----
      const ready = (attachments ?? []).filter((a) => a.status === 'ready' && a.tempPath)
      const images: ApiImagePayload[] = []
      const docFiles: { name: string; relPath: string; absPath: string }[] = []
      let uploadFailedNotice: string[] = []

      if (ready.length > 0 && isDesktop) {
        const bridge = getDesktopBridge()
        if (bridge?.file) {
          for (const att of ready) {
            const isImg = att.file.type.startsWith('image/')
            if (isImg) {
              const r = await bridge.file.readAsBase64(att.tempPath!)
              if (r.ok && r.data && r.mimeType) {
                images.push({ name: att.name, mimeType: r.mimeType, data: r.data })
              } else {
                uploadFailedNotice.push(`${att.name}（读取失败：${r.error ?? '未知'}）`)
              }
            } else {
              const r = await bridge.file.copyToSession({
                tempPath: att.tempPath!,
                cwd: sdkSession.cwd,
                fileName: att.name,
              })
              if (r.ok && r.absPath && r.relPath) {
                docFiles.push({ name: att.name, relPath: r.relPath, absPath: r.absPath })
              } else {
                uploadFailedNotice.push(`${att.name}（复制失败：${r.error ?? '未知'}）`)
              }
            }
          }
        }
      }

      // ---- 拼接 message：透明插入附件指引，让 agent 知道去 .uploads/ 读 ----
      let finalMessage = text
      const promptLines: string[] = []
      if (docFiles.length > 0) {
        promptLines.push('')
        promptLines.push('[系统：已为你上传以下附件到本会话工作目录]')
        for (const f of docFiles) promptLines.push(`- ${f.name} → ${f.relPath}`)
        promptLines.push('请使用 read 等工具读取文件内容后回答用户问题。')
      }
      if (images.length > 0) {
        promptLines.push('')
        promptLines.push(`[系统：用户附了 ${images.length} 张图片，请使用视觉能力分析。]`)
      }
      if (uploadFailedNotice.length > 0) {
        promptLines.push('')
        promptLines.push('[系统：以下附件上传失败，请告知用户：' + uploadFailedNotice.join('；') + ']')
      }
      if (promptLines.length > 0) {
        finalMessage = text + '\n' + promptLines.join('\n')
      }

      // ---- 把 absPath 回填进 userMsg.attachments[i].localPath，让历史卡片走 ArtifactCard ----
      if (docFiles.length > 0 || images.length > 0) {
        const docMap = new Map(docFiles.map((d) => [d.name, d.absPath]))
        setMessages((prev) => prev.map((m) => {
          if (m.id !== userMsg.id) return m
          if (!m.attachments) return m
          return {
            ...m,
            attachments: m.attachments.map((a) => ({
              ...a,
              localPath: docMap.get(a.name) ?? a.localPath,
              isImage: a.type === 'image' ? true : a.isImage,
            })),
          }
        }))
      }

      await sendPrompt(sdkSession.id, {
        message: finalMessage,
        images: images.length > 0 ? images : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      if (skillParserRef.current) {
        skillParserRef.current = null
      }
      pendingSkillFreeTextRef.current = ''
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession, connectEvents, onSessionCreated])

  const handleAbort = useCallback(async () => {
    const sdkSessionId = sdkSessionIdRef.current
    const assistantId = currentAssistantIdRef.current
    if (!sdkSessionId) return

    // Close SSE connection first
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

    // Call backend abort
    try {
      await abortSession(sdkSessionId)
    } catch (err) {
      console.error('Abort failed:', err)
    }

    // Clear any pending tool update timer
    if (toolUpdateTimerRef.current) {
      clearTimeout(toolUpdateTimerRef.current)
      toolUpdateTimerRef.current = null
    }
    pendingToolUpdateRef.current = null

    // Remove incomplete assistant message
    if (assistantId) {
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId))
    }

    // Reset state
    setStreaming(false)
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    if (skillParserRef.current) {
      skillParserRef.current = null
    }
    pendingSkillFreeTextRef.current = ''
  }, [])

  const handleResolvePermission = useCallback(async (request: PermissionRequestInfo, decision: 'allow_once' | 'allow_session' | 'deny') => {
    const sessionId = request.sessionId || sdkSessionIdRef.current
    if (!sessionId) return

    setPendingPermissions((prev) => prev.filter((p) => p.permissionId !== request.permissionId))

    if (decision === 'deny') {
      try {
        await resolvePermission(sessionId, request.permissionId, false)
      } catch (err) {
        console.error('Resolve permission failed:', err)
      }
      return
    }

    if (decision === 'allow_session') {
      addSessionAllowed(sessionId, request.kind, request.options)
    }

    try {
      await resolvePermission(sessionId, request.permissionId, true)
    } catch (err) {
      console.error('Resolve permission failed:', err)
    }
  }, [])

  const handleResolveToolPermission = useCallback((toolStepId: string, decision: 'allow_once' | 'allow_session' | 'deny') => {
    const request = toolPermissionMapRef.current.get(toolStepId)
    if (!request) return
    void handleResolvePermission(request, decision)
  }, [handleResolvePermission])

  const handleAnswerQuestion = useCallback(async (question: QuestionInfo, answers: string[][]) => {
    try {
      await answerQuestion(question.questionId, answers)
      setPendingQuestions((prev) => prev.filter((q) => q.questionId !== question.questionId))
    } catch (err) {
      console.error('Answer question failed:', err)
    }
  }, [])

  const handleRejectQuestion = useCallback(async (question: QuestionInfo) => {
    try {
      await rejectQuestion(question.questionId)
      setPendingQuestions((prev) => prev.filter((q) => q.questionId !== question.questionId))
    } catch (err) {
      console.error('Reject question failed:', err)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    sdkSessionIdRef.current = null
    sdkSessionInfoRef.current = null
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    if (skillParserRef.current) {
      skillParserRef.current = null
    }
    pendingSkillFreeTextRef.current = ''
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

        // 使用 queueMicrotask 延迟同步状态重置，避免 react-hooks/set-state-in-effect
    queueMicrotask(() => {
      if (session?.id) {
        // 已有会话：直接使用 session.id（super-king 没有 open_existing/sessionFile）
        setMessages([])
        setHasMessages(true)
        sdkSessionIdRef.current = session.id
        sdkSessionInfoRef.current = session
        normalizeSessionIdRef.current = session.id
        void connectEvents(session.id)
        getMessages(session.id)
          .then((loadedMessages) => {
            if (cancelled) return
            setMessages(normalizeLoadedMessages(loadedMessages))
            forceScrollRef.current = true
          })
          .catch((err) => {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : String(err)
              setError(`加载会话失败：${message}`)
              setMessages([])
            }
          })
      } else if (session) {
        setMessages([])
        setHasMessages(true)
      } else {
        setMessages([])
        setHasMessages(false)
      }
    })

    return () => { cancelled = true }
  }, [connectEvents, session, newSessionCwd])

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      // 清理所有节流定时器，避免组件卸载后 setTimeout 回调还在跑触发 setState
      if (textDeltaTimerRef.current) {
        clearTimeout(textDeltaTimerRef.current)
        textDeltaTimerRef.current = null
      }
      if (thinkingDeltaTimerRef.current) {
        clearTimeout(thinkingDeltaTimerRef.current)
        thinkingDeltaTimerRef.current = null
      }
      if (toolUpdateTimerRef.current) {
        clearTimeout(toolUpdateTimerRef.current)
        toolUpdateTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Auto-scroll to bottom only when user is near bottom
    const container = scrollContainerRef.current
    if (!container) return

    // Force scroll: user just sent a message, or history just loaded
    if (forceScrollRef.current) {
      forceScrollRef.current = false
      isUserNearBottomRef.current = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight
        })
      })
      return
    }

    const threshold = 100
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    isUserNearBottomRef.current = nearBottom
    if (nearBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }, [messages])

  const effectiveCwd = newSessionCwd ?? session?.cwd ?? selectedCwd
  const showChat = session !== null || newSessionCwd !== null
  const isEmptyNew = !!(session === null && newSessionCwd && !hasMessages)
  const isNewSession = !!(session && !hasMessages)

  if (!showChat && !selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            选择一个项目目录
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
            从左侧边栏选择或添加一个项目，开始与智能体对话
          </div>
        </div>
      </div>
    )
  }

  if (!showChat && selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            开始新对话
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center' }}>
            点击左侧「新建对话」开始
          </div>
        </div>
      </div>
    )
  }

  if (isEmptyNew || isNewSession) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
          <div style={{ width: '100%', maxWidth: 820 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginLeft: 16,
              marginRight: 52,
              marginBottom: 16,
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                {/* 超级小金动态吉祥物（vite import，打包后是带 hash 的相对路径，file:// 下能加载） */}
                <img
                  src={xiaojinGif}
                  alt="超级小金"
                  width={56}
                  height={56}
                  style={{ flexShrink: 0, objectFit: 'contain', display: 'block' }}
                />
                <span style={{ fontSize: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>超级小金</span>
                <span style={{ fontSize: 'var(--font-base)', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  超级小金
                </span>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  {APP_INSTITUTION}
                </span>
              </div>
            </div>
            <ChatInput ref={chatInputRef} onSend={handleSend} onAbort={handleAbort} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-panel)', flexShrink: 0,
        fontSize: 'calc(var(--font-base) * 0.929)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {session?.name || session?.firstMessage?.slice(0, 50) || '会话'}
        </span>
        {effectiveCwd && (
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {effectiveCwd}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {session?.id && modelProviders.length > 0 && (
          <select
            value={`${session.model?.provider ?? config?.defaultModel?.provider ?? ''}/${session.model?.modelId ?? config?.defaultModel?.id ?? ''}`}
            onChange={(e) => {
              const [provider, modelId] = e.target.value.split('/')
              if (provider && modelId && session.id) {
                onSwitchModel(session.id, provider, modelId)
              }
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-dim)',
              fontSize: 'var(--font-xs)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: 180,
            }}
          >
            {modelProviders.flatMap((provider) =>
              provider.models.map((model) => (
                <option key={`${provider.id}/${model.id}`} value={`${provider.id}/${model.id}`}>
                  {provider.name}/{model.name}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m, index) => {
            const isLast = index === messages.length - 1
            const isActiveAssistant = isLast && m.role === 'assistant' && streaming
            // 历史消息可能在 content 中嵌有 <skill_content>...</skill_content>（流式拦截器是 0.1.22 之后才加的），
            // 这里再做一次防御性 sanitize：把 XML 块抽出作为虚拟 skill_load steps，
            // content 显示 sanitize 后的干净版本。流式期间不做（避免和实时解析器双重 emit）。
            let displayContent = m.content
            let displaySteps = m.steps
            if (m.role === 'assistant' && !isActiveAssistant && m.content && m.content.includes('<skill_content')) {
              const { cleanContent, skills } = extractSkillBlocks(m.content)
              if (skills.length > 0) {
                displayContent = cleanContent
                const histSkillSteps: AgentStep[] = skills.map((s) => ({
                  type: 'skill_load' as const,
                  id: `hist-${m.id}-${s.id}`,
                  name: s.name,
                  baseDir: s.baseDir,
                  content: s.content,
                  isLoading: false,
                }))
                displaySteps = [...(m.steps ?? []), ...histSkillSteps]
              }
            }
            const hasText = !!displayContent
            const hasSteps = !!(displaySteps && displaySteps.length > 0)
            // 用派生后的对象给 MessageView 渲染（保持原 m 不变以维持 memo 引用）
            const messageForView = displayContent === m.content && displaySteps === m.steps
              ? m
              : { ...m, content: displayContent, steps: displaySteps }
            return (
              <div key={m.id} style={{ marginBottom: m.role === 'user' ? 16 : 0 }}>
                {hasSteps && (
                  <ReasoningBlock steps={displaySteps!} onResolveToolPermission={handleResolveToolPermission} />
                )}
                {!hasSteps && isActiveAssistant && !m.content && (
                  <PendingTaskCard task={m.pendingTask} />
                )}
                {hasText && (
                  <MessageErrorBoundary
                    content={displayContent}
                    sessionId={sdkSessionIdRef.current ?? session?.id ?? null}
                    messageId={m.id}
                  >
                    <MessageView message={messageForView} isStreaming={isLast && streaming} />
                  </MessageErrorBoundary>
                )}
              </div>
            )
          })}
          {error && <div style={{ color: '#ef4444', fontSize: 'calc(var(--font-base) * 0.929)', marginBottom: 10 }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput ref={chatInputRef} onSend={handleSend} onAbort={handleAbort} isStreaming={streaming} />

      {pendingPermissions.length > 0 && (
        <PermissionDialog
          request={pendingPermissions[0]}
          onResolve={(decision) => handleResolvePermission(pendingPermissions[0], decision)}
        />
      )}

      {pendingQuestions.length > 0 && (
        <QuestionDialog
          question={pendingQuestions[0]}
          onSubmit={(answers) => handleAnswerQuestion(pendingQuestions[0], answers)}
          onReject={() => handleRejectQuestion(pendingQuestions[0])}
        />
      )}
    </div>
  )
}
