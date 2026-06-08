import { useRef, useState, useCallback, forwardRef, useImperativeHandle, useEffect, type KeyboardEvent } from 'react'
import type { LocalAttachment } from '../mockData'

interface Props {
  onSend: (message: string, attachments?: LocalAttachment[]) => void
  isStreaming?: boolean
  placeholder?: string
}

export interface ChatInputHandle {
  insertText: (text: string) => void
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, isStreaming, placeholder,
}, ref) {
  const [value, setValue] = useState('')
  const [recording, setRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const waveAnimRef = useRef<number>(0)
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const shouldKeepRecordingRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingRef = useRef(false)
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])

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

  const startRecording = useCallback(() => {
    if (recording) return

    shouldKeepRecordingRef.current = true

    if (hasSpeechAPI) {
      const rec = createRecognition()
      if (!rec) return
      recognitionRef.current = rec
      let finalTranscript = ''

      const scheduleRestart = (delay: number) => {
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current)
          restartTimerRef.current = null
        }
        if (!shouldKeepRecordingRef.current) return
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null
          if (!shouldKeepRecordingRef.current) return
          if (recognitionRef.current !== rec) return
          try {
            rec.start()
          } catch (_) {
            scheduleRestart(400)
          }
        }, delay)
      }

      rec.onresult = (e: SpeechRecognitionEvent) => {
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
        if (recognitionRef.current !== rec) return
        if (!shouldKeepRecordingRef.current) return
        scheduleRestart(250)
      }
      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        const recoverable = e.error === 'no-speech' || e.error === 'aborted' || e.error === 'audio-capture' || e.error === 'network'
        if (recoverable && shouldKeepRecordingRef.current) {
          return
        }
        shouldKeepRecordingRef.current = false
        recordingRef.current = false
        setRecording(false)
        recognitionRef.current = null
      }
      try {
        rec.start()
        recordingRef.current = true
        setRecording(true)
      } catch (_) {
        shouldKeepRecordingRef.current = false
        recognitionRef.current = null
      }
    } else {
      recordingRef.current = true
      setRecording(true)
      mockTimerRef.current = setInterval(() => {
        if (!shouldKeepRecordingRef.current) return
        const chars = '用中文学编程吧'
        setValue((v) => v + chars[Math.floor(Math.random() * chars.length)])
      }, 300)
    }
  }, [recording, hasSpeechAPI])

  const stopRecording = useCallback(() => {
    shouldKeepRecordingRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try { rec.stop() } catch (_) { /* ignore */ }
      try { rec.abort() } catch (_) { /* ignore */ }
    }
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
        const readyAttachments = currentAttachments.filter((a) => a.progress >= 100)
        onSend(msg, readyAttachments.length > 0 ? readyAttachments : undefined)
      }
    } else {
      startRecording()
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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const total = files.length
    let completed = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const id = Date.now() + i
      const entry = { name: file.name, url: URL.createObjectURL(file), file, progress: 0, id }
      setAttachments((prev) => [...prev, entry])
      const steps = [10, 25, 40, 60, 75, 90, 100]
      steps.forEach((p, si) => {
        setTimeout(() => {
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, progress: p } : a))
          )
          if (p === 100) {
            completed++
            if (completed === total && recordingRef.current) {
              stopRecording()
            }
          }
        }, 200 * (si + 1))
      })
    }
    e.target.value = ''
  }, [stopRecording])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].url)
      next.splice(index, 1)
      return next
    })
  }, [])

  const handleSend = useCallback(() => {
    const msg = value.trim()
    if (!msg && attachments.length === 0) return
    if (isStreaming) return
    const readyAttachments = attachments.filter((a) => a.progress >= 100)
    onSend(msg, readyAttachments.length > 0 ? readyAttachments : undefined)
    setValue('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
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
  const canSend = hasText || attachments.length > 0

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
        drawingCtx.fillStyle = `rgba(239, 68, 68, ${0.5 + amp * 0.5})`
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            borderRadius: 24,
            padding: '14px 16px 14px 20px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {attachments.map((att, i) => (
                <div key={att.id} style={{ position: 'relative', width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={att.url} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: att.progress < 100 ? 0.5 : 1 }} />
                  {att.progress < 100 && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.4)',
                    }}>
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{att.progress}%</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeAttachment(i) }}
                    style={{
                      position: 'absolute', top: -2, right: -2,
                      width: 16, height: 16, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.7)', border: 'none',
                      color: '#fff', fontSize: 10, lineHeight: '16px',
                      textAlign: 'center', cursor: 'pointer', padding: 0,
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={recording ? '正在听...' : (placeholder ?? (isStreaming ? '智能体运行中...' : '发消息...'))}
            rows={1}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text)',
              fontSize: 15,
              lineHeight: 1.8,
              fontFamily: 'inherit',
              minHeight: 40,
              maxHeight: 160,
              overflow: 'auto',
            }}
          />
          {recording || !canSend ? (
            <>
              <button
                onClick={toggleMic}
                disabled={isStreaming}
                title={recording ? '点击发送' : '语音输入'}
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40,
                  padding: 0,
                  background: recording ? 'rgba(239,68,68,0.15)' : 'none',
                  border: recording ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border)',
                  borderRadius: 8,
                  color: recording ? '#ef4444' : 'var(--text-muted)',
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
                title="上传图片"
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40,
                  padding: 0,
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
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
              disabled={isStreaming}
              style={{
                flexShrink: 0,
                alignSelf: 'flex-end',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                height: 40, padding: '0 14px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              Send
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  )
})
