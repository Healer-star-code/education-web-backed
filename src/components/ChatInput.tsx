import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import type { LocalAttachment, MessageAttachment } from '../mockData'
import { AttachmentCard } from './FileCard'
import { getDesktopBridge, isDesktop } from '../lib/desktopBridge'

// 视频不允许上传：super-king 没有视频处理能力，agent 也看不了视频
const BLOCKED_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', '3gp']
const BLOCKED_MIME_PREFIX = ['video/']

function isBlocked(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (BLOCKED_EXT.includes(ext)) return `不支持上传视频文件（.${ext}）`
  if (BLOCKED_MIME_PREFIX.some((p) => file.type.startsWith(p))) return '不支持上传视频文件'
  return null
}

interface Props {
  onSend: (message: string, attachments?: LocalAttachment[]) => void
  onAbort?: () => void
  isStreaming?: boolean
  placeholder?: string
}

function attachmentType(file: File): MessageAttachment['type'] {
  if (file.type.startsWith('image/')) return 'image'
  const ext = file.name.toLowerCase().split('.').pop()
  if (ext === 'doc' || ext === 'docx') return 'document'
  if (ext === 'ppt' || ext === 'pptx') return 'presentation'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'spreadsheet'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'txt' || ext === 'md') return 'text'
  return 'file'
}

export interface ChatInputHandle {
  insertText: (text: string) => void
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, isStreaming, placeholder,
}, ref) {
  const [value, setValue] = useState('')
  const [recording, setRecording] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [micToast, setMicToast] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const waveAnimRef = useRef<number>(0)
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const shouldKeepRecordingRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingRef = useRef(false)
  const uploadTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // 持有当前麦克风 stream，stop 时释放，避免长时间占用系统麦克风指示器
  const mediaStreamRef = useRef<MediaStream | null>(null)
  // 录音开始后探测窗口：1.5 秒内没收到任何 onstart/onaudiostart/onresult 视为静默失败
  const aliveProbeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // micToast 自动消失的 timer：保留 ref 以兼容历史代码（当前 flashMicToast 已 no-op）
  const micToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 拖拽计数器：防止子元素 dragenter/dragleave 导致闪烁
  const dragCounterRef = useRef(0)
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // ⭐ 用户决定：麦克风按钮保留，但点击后不再弹任何错误提示（包括 Google 语音服务
  // 不可达、权限被拒、Electron 不支持等）。底层 SpeechRecognition / getUserMedia
  // 逻辑保留以备将来接入离线 STT，但用户视角完全静默。
  // 这里保留 flashMicToast 签名是为了避免大改所有调用方；改为 no-op 即可。
  function flashMicToast(_msg: string, _ms = 3500) {
    // intentionally no-op
    void _msg; void _ms
    // 顺便确保 micToast state 永远 null（即使曾经被设置过也清理）
    if (micToastTimerRef.current) {
      clearTimeout(micToastTimerRef.current)
      micToastTimerRef.current = null
    }
    if (micToast !== null) setMicToast(null)
  }

  // ⭐ 统一的语音识别清理函数：避免散在 4 处的清理逻辑发散
  // 不动 shouldKeepRecordingRef（由调用方决定是否要保留意图）
  function cleanupRecognitionAndStream() {
    if (aliveProbeRef.current) {
      clearTimeout(aliveProbeRef.current)
      aliveProbeRef.current = null
    }
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      rec.onstart = null
      rec.onaudiostart = null
      rec.onspeechstart = null
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try { rec.stop() } catch (_) { /* ignore */ }
      try { rec.abort() } catch (_) { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
  }

  function createRecognition() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    return rec
  }

  const hasSpeechAPI = !!(typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  // Electron 桌面端：Web Speech API 在 Electron 33 内的 Chromium 中已被禁用
  // （Google 不再公开 cloud speech API key）。能创建对象但 start() 后无 audio。
  // 用 isDesktop 提示用户。
  const isInsideElectron = typeof window !== 'undefined' && !!(window as any).piDesktop

  // 主动获取麦克风权限并保留 stream 句柄：
  // - 这是触发 Electron / Windows 系统级麦克风权限弹窗的标准方式
  // - 拿到 stream 之后再启动 SpeechRecognition，可避免 SpeechRecognition 静默失败
  // - stream 在 stopRecording 时手动 stop，释放麦克风
  async function requestMicrophone(): Promise<MediaStream | null> {
    if (!navigator?.mediaDevices?.getUserMedia) {
      flashMicToast('当前环境不支持麦克风访问')
      return null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.info('[speech] getUserMedia ok, tracks=', stream.getAudioTracks().length)
      return stream
    } catch (err) {
      const name = (err as { name?: string })?.name ?? ''
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[speech] getUserMedia failed:', name, msg)
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        flashMicToast('麦克风权限被拒绝，请在 Windows 设置 → 隐私 → 麦克风 中允许')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        flashMicToast('未检测到麦克风设备')
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        flashMicToast('麦克风被其他程序占用')
      } else {
        flashMicToast(`无法访问麦克风：${msg}`)
      }
      return null
    }
  }

  const startRecording = useCallback(async () => {
    if (recording) return

    shouldKeepRecordingRef.current = true

    if (hasSpeechAPI) {
      // ⭐ 关键修复：先主动 getUserMedia 触发系统级麦克风权限授权，
      // 否则 Electron 里 SpeechRecognition 会静默失败（用户以为按钮没反应）。
      const stream = await requestMicrophone()
      if (!stream) {
        // 权限失败或无设备，requestMicrophone 内部已 toast 提示
        shouldKeepRecordingRef.current = false
        return
      }
      if (!shouldKeepRecordingRef.current) {
        // 用户在等待权限时已经又点了一次按钮取消
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      mediaStreamRef.current = stream

      const rec = createRecognition()
      if (!rec) {
        stream.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
        flashMicToast('当前环境不支持语音识别（缺少 SpeechRecognition API）')
        shouldKeepRecordingRef.current = false
        return
      }
      recognitionRef.current = rec
      let finalTranscript = ''
      // 限制连续失败重启次数，避免麦克风不可用时无限重启耗电
      let restartFailCount = 0
      const MAX_RESTART_FAILS = 5
      // 是否收到过任何"语音引擎活着"的信号（onstart / onaudiostart / onresult）
      let aliveSignalSeen = false

      const clearAliveProbe = () => {
        if (aliveProbeRef.current) {
          clearTimeout(aliveProbeRef.current)
          aliveProbeRef.current = null
        }
      }

      const scheduleRestart = (delay: number) => {
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current)
          restartTimerRef.current = null
        }
        if (!shouldKeepRecordingRef.current) return
        if (restartFailCount >= MAX_RESTART_FAILS) {
          console.warn('[speech] giving up after', restartFailCount, 'restart failures')
          shouldKeepRecordingRef.current = false
          cleanupRecognitionAndStream()
          recordingRef.current = false
          setRecording(false)
          flashMicToast('语音识别多次启动失败，请检查麦克风或网络')
          return
        }
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null
          if (!shouldKeepRecordingRef.current) return
          if (recognitionRef.current !== rec) return
          try {
            rec.start()
            restartFailCount = 0 // 成功了就清零
          } catch (_) {
            restartFailCount++
            scheduleRestart(400 + restartFailCount * 200) // 退避
          }
        }, delay)
      }

      // ⭐ 诊断回调：让我们能确认 SpeechRecognition 真的在工作
      rec.onstart = () => {
        console.info('[speech] onstart')
        aliveSignalSeen = true
      }
      rec.onaudiostart = () => {
        console.info('[speech] onaudiostart (mic stream attached)')
        aliveSignalSeen = true
      }
      rec.onspeechstart = () => {
        console.info('[speech] onspeechstart (voice detected)')
        aliveSignalSeen = true
      }
      rec.onresult = (e: SpeechRecognitionEvent) => {
        aliveSignalSeen = true
        clearAliveProbe()
        if (!shouldKeepRecordingRef.current) return
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalTranscript += t
          else interim += t
        }
        setValue(finalTranscript + interim)
      }
      rec.onend = () => {
        console.info('[speech] onend, alive=', aliveSignalSeen)
        if (recognitionRef.current !== rec) return
        if (!shouldKeepRecordingRef.current) return
        scheduleRestart(250)
      }
      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        console.warn('[speech] onerror:', e.error)
        const recoverable = e.error === 'no-speech' || e.error === 'aborted' || e.error === 'audio-capture' || e.error === 'network'
        // network 在 Electron 里通常意味着 Google Speech API 不可达
        if (e.error === 'network' && isInsideElectron) {
          flashMicToast('桌面端可能无法访问 Google 语音服务，建议使用浏览器版本或检查网络')
        } else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          flashMicToast('麦克风权限被拒绝，请在系统设置中允许')
        }
        if (recoverable && shouldKeepRecordingRef.current) {
          return
        }
        shouldKeepRecordingRef.current = false
        cleanupRecognitionAndStream()
        recordingRef.current = false
        setRecording(false)
      }
      try {
        rec.start()
        recordingRef.current = true
        setRecording(true)
        // ⭐ 启动后 1.8 秒内如果没有任何 onstart/onaudiostart/onresult 回调，
        // 视为 Electron 里 SpeechRecognition 静默失败，提示用户
        clearAliveProbe()
        aliveProbeRef.current = setTimeout(() => {
          aliveProbeRef.current = null
          if (!aliveSignalSeen && shouldKeepRecordingRef.current) {
            console.warn('[speech] no alive signal in 1.8s, likely SpeechRecognition is disabled in this runtime')
            if (isInsideElectron) {
              flashMicToast('桌面端不支持语音识别（Electron 限制），请在浏览器中使用 / 在设置中查看')
            } else {
              flashMicToast('语音识别似乎没启动，请检查麦克风权限')
            }
          }
        }, 1800)
      } catch (err) {
        console.warn('[speech] rec.start() threw:', err)
        flashMicToast('语音识别启动失败')
        shouldKeepRecordingRef.current = false
        cleanupRecognitionAndStream()
      }
    } else {
      // 真·无 SpeechRecognition API：不再用假打字 mock 误导用户
      flashMicToast('当前环境不支持语音识别')
      shouldKeepRecordingRef.current = false
    }
  }, [recording, hasSpeechAPI, isInsideElectron])

  const stopRecording = useCallback(() => {
    shouldKeepRecordingRef.current = false
    cleanupRecognitionAndStream()
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current)
      mockTimerRef.current = null
    }
    recordingRef.current = false
    setRecording(false)
  }, [])

  const toggleMic = useCallback(() => {
    if (isStreaming) return
    if (recordingRef.current) {
      const currentAttachments = attachments
      const msg = value.trim()
      stopRecording()
      setValue('')
      setAttachments([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      if (msg || currentAttachments.length > 0) {
        const readyAttachments = currentAttachments.filter((a) => a.status === 'ready')
        onSend(msg, readyAttachments.length > 0 ? readyAttachments : undefined)
      }
      // Auto-focus textarea after voice send
      setTimeout(() => textareaRef.current?.focus(), 0)
    } else {
      void startRecording()
    }
  }, [isStreaming, value, attachments, onSend, startRecording, stopRecording])

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const ta = textareaRef.current
      if (!ta) {
        setValue((v) => v + (v ? ' ' : '') + text)
        return
      }
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? ta.value.length
      const before = ta.value.slice(0, start)
      const after = ta.value.slice(end)
      const sep = before.length > 0 && !before.endsWith(' ') ? ' ' : ''
      const newVal = before + sep + text + after
      setValue(newVal)
      requestAnimationFrame(() => {
        if (!ta) return
        const pos = start + sep.length + text.length
        ta.setSelectionRange(pos, pos)
        ta.focus()
        ta.style.height = 'auto'
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
      })
    },
  }))

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const processFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files || files.length === 0) return
    const bridge = isDesktop ? getDesktopBridge() : null

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const id = Date.now() + i
      const blockedReason = isBlocked(file)

      const baseEntry: LocalAttachment = {
        id,
        name: file.name,
        url: URL.createObjectURL(file),
        file,
        progress: blockedReason ? 100 : 0,
        status: blockedReason ? 'error' : 'uploading',
        error: blockedReason ?? undefined,
      }
      setAttachments((prev) => [...prev, baseEntry])

      if (blockedReason) continue  // 拒绝视频：直接挂错误，不上传

      // 浏览器模式（非桌面）：没有 IPC 能力，保留旧的 setTimeout 假进度兜底
      if (!bridge?.file?.writeBlobToTemp) {
        const steps = [10, 25, 40, 60, 75, 90, 100]
        steps.forEach((p, si) => {
          const timer = setTimeout(() => {
            setAttachments((prev) => prev.map((a) => (
              a.id === id
                ? { ...a, progress: p, status: p === 100 ? 'ready' : 'uploading' }
                : a
            )))
          }, 200 * (si + 1))
          uploadTimersRef.current.push(timer)
        })
        continue
      }

      // 桌面模式真上传：File -> ArrayBuffer -> IPC writeBlobToTemp
      ;(async () => {
        try {
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, progress: 15 } : a)))
          const buffer = await file.arrayBuffer()
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, progress: 50 } : a)))

          const res = await bridge.file.writeBlobToTemp({
            buffer: new Uint8Array(buffer),
            fileName: file.name,
          })
          if (!res.ok || !res.tempPath) {
            throw new Error(res.error ?? '写入临时文件失败')
          }
          setAttachments((prev) => prev.map((a) => (
            a.id === id
              ? { ...a, progress: 100, status: 'ready', tempPath: res.tempPath }
              : a
          )))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setAttachments((prev) => prev.map((a) => (
            a.id === id
              ? { ...a, progress: 100, status: 'error', error: `上传失败：${msg}` }
              : a
          )))
        }
      })()
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files)
    e.target.value = ''
  }, [processFiles])

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)
    processFiles(e.dataTransfer.files)
  }, [processFiles])

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return

    const pastedFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault()
      processFiles(pastedFiles)
    }
  }, [processFiles])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].url)
      next.splice(index, 1)
      return next
    })
  }, [])

  useEffect(() => {
    return () => {
      uploadTimersRef.current.forEach(clearTimeout)
      uploadTimersRef.current = []
    }
  }, [])

  // 阻止拖拽文件到窗口其他区域时浏览器直接打开文件
  useEffect(() => {
    const handleWindowDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault()
    }
    const handleWindowDrop = (e: globalThis.DragEvent) => {
      e.preventDefault()
      // 如果用户把文件拖到输入框附近又丢到窗口其他区域，
      // 这里需要兜底重置拖拽状态，避免高亮遮罩卡住。
      dragCounterRef.current = 0
      setIsDragging(false)
    }
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [])

  const handleSend = useCallback(() => {
    const msg = value.trim()
    if (!msg && attachments.length === 0) return

    const readyAttachments = attachments.filter((a) => a.status === 'ready')
    onSend(msg, readyAttachments.length > 0 ? readyAttachments : undefined)
    setValue('')
    setAttachments([])
    uploadTimersRef.current.forEach(clearTimeout)
    uploadTimersRef.current = []
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      // Auto-focus textarea after sending so user can type immediately
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [value, attachments, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [])

  const hasText = !!value.trim()
  const hasReady = attachments.some((a) => a.status === 'ready')
  const canSend = hasText || hasReady

  useEffect(() => {
    return () => {
      uploadTimersRef.current.forEach((t) => clearTimeout(t))
      uploadTimersRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!recording) {
      if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current)
      return
    }
    const canvas = waveRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const drawingCtx = ctx
    const w = canvas.width
    const h = canvas.height
    const bars = 5
    const barW = 3
    const gap = (w - bars * barW) / (bars - 1)
    let t = 0
    function draw() {
      drawingCtx.clearRect(0, 0, w, h)
      for (let i = 0; i < bars; i++) {
        const phase = t * 0.08 + i * 1.2
        const amp = (Math.sin(phase) + 1) / 2
        const barH = 4 + amp * (h - 8)
        const x = i * (barW + gap)
        const y = (h - barH) / 2
        drawingCtx.fillStyle = `rgba(220, 38, 38, ${0.5 + amp * 0.5})`
        drawingCtx.beginPath()
        drawingCtx.roundRect(x, y, barW, barH, 1.5)
        drawingCtx.fill()
      }
      t++
      waveAnimRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current) }
  }, [recording])

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'transparent',
        padding: '16px 24px',
      }}
    >
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div
          className={`chat-input-wrapper ${isFocused ? 'is-focused' : ''} ${isStreaming ? 'is-streaming' : ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-md)',
          }}
        >
        <div
          className="chat-input-inner"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 'var(--radius-xl)',
            padding: '14px 16px 14px 20px',
          }}
        >
          {isDragging && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-xl)',
              border: '2px dashed var(--accent)',
              background: 'rgba(59, 130, 246, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>释放以上传文件</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.pdf,.txt,.md,.json,.html,.htm,.zip,.rar,.7z,.svg,.log"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {attachments.map((att, i) => {
                const isUploading = att.status === 'uploading'
                const isError = att.status === 'error'
                return (
                  <div
                    key={att.id}
                    style={{
                      position: 'relative',
                      opacity: isUploading ? 0.65 : 1,
                      outline: isError ? '1.5px solid var(--danger)' : 'none',
                      borderRadius: 'var(--radius-lg)',
                    }}
                    title={isError ? att.error : undefined}
                  >
                    <AttachmentCard compact attachment={{ id: att.id, name: att.name, url: att.url, type: attachmentType(att.file), mimeType: att.file.type, size: att.file.size }} />
                    {isUploading && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.4)',
                      }}>
                        <span style={{ color: '#fff', fontSize: 'var(--font-xs)', fontWeight: 700 }}>{att.progress}%</span>
                      </div>
                    )}
                    {isError && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--danger)', opacity: 0.85, borderRadius: 'var(--radius-lg)',
                      }}>
                        <span style={{ color: '#fff', fontSize: 'var(--font-xs)', fontWeight: 700, padding: '0 6px', textAlign: 'center', lineHeight: 1.2 }}>
                          {att.error ?? '失败'}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAttachment(i) }}
                      style={{
                        position: 'absolute', top: -2, right: -2,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.7)', border: 'none',
                        color: '#fff', fontSize: 'calc(var(--font-base) * 0.714)', lineHeight: '16px',
                        textAlign: 'center', cursor: 'pointer', padding: 0,
                      }}
                  >×</button>
                </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handlePaste}
            placeholder={recording ? '正在听...' : (placeholder ?? (isStreaming ? '智能体运行中...' : '发消息...'))}
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text)',
              fontSize: 'calc(var(--font-base) * 1.071)',
              lineHeight: 1.8,
              fontFamily: 'inherit',
              minHeight: 40,
              maxHeight: 160,
              overflow: 'auto',
            }}
          />
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="btn-danger"
              style={{ alignSelf: 'flex-end', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="1" />
              </svg>
              停止
            </button>
          ) : recording || !canSend ? (
            <>
              <button
                onClick={toggleMic}
                disabled={isStreaming}
                title={recording ? '点击发送' : '语音输入'}
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 'var(--icon-button-size, 40px)', height: 'var(--icon-button-size, 40px)',
                  padding: 0,
                  background: recording ? 'var(--danger-bg)' : 'none',
                  border: recording ? '1px solid var(--danger)' : '1px solid var(--border)',
                  color: recording ? 'var(--danger)' : 'var(--text-muted)',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {recording ? (
                  <canvas
                    ref={waveRef}
                    width={24}
                    height={24}
                    style={{ width: 24, height: 24 }}
                  />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleFileSelect}
                disabled={isStreaming}
                title="上传文件"
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 'var(--icon-button-size, 40px)', height: 'var(--icon-button-size, 40px)',
                  padding: 0,
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)',
                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={handleSend}
              className="btn-primary"
              style={{ alignSelf: 'flex-end', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              发送
            </button>
          )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
})
