import { useState, useEffect } from 'react'

interface Props {
  phrases: string[]
}

export function Typewriter({ phrases }: Props) {
  const [phraseIdx, setPhraseIdx] = useState(() => Math.floor(Math.random() * phrases.length))
  const [text, setText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [caretOn, setCaretOn] = useState(true)

  useEffect(() => {
    const blink = setInterval(() => setCaretOn((v) => !v), 530)
    return () => clearInterval(blink)
  }, [])

  useEffect(() => {
    const current = phrases[phraseIdx]
    let timeout: ReturnType<typeof setTimeout>
    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), 1800)
    } else if (deleting && text === '') {
      queueMicrotask(() => {
        setDeleting(false)
        setPhraseIdx((i) => (i + 1) % phrases.length)
      })
    } else {
      const next = deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1)
      timeout = setTimeout(() => setText(next), deleting ? 28 : 55)
    }
    return () => clearTimeout(timeout)
  }, [text, deleting, phraseIdx, phrases])

  return (
    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
      {text}
      <span style={{ opacity: caretOn ? 1 : 0, color: 'var(--accent)', marginLeft: 1 }}>▍</span>
    </span>
  )
}
