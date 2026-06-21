/**
 * 解析 super-king SSE assistant_delta 文本中嵌入的 `<skill_content>` 块。
 *
 * 后端在加载 skill（例如 docx、pdf、pptx）时会把 SKILL.md 整段以
 * `<skill_content name="..." base_dir="...">...</skill_content>` 形式拼到
 * assistant 文本流里，前端如果直接显示就会污染聊天区。
 *
 * 这里提供两套 API：
 *   - createSkillStreamParser(): 增量状态机，给 ChatArea 实时流式用，能正确处理
 *     起始/结束标签被 chunk 切开的情况，回调输出：
 *       onText(text)       — 这段是普通 assistant 文本，应该拼到 content
 *       onSkillStart(id, name, baseDir)
 *       onSkillDelta(id, content)
 *       onSkillEnd(id)
 *   - extractSkillBlocks(content): 一次性解析整段字符串，给 MessageView 处理
 *     历史消息（已经存为 content 字符串）用，返回 { cleanContent, skills[] }
 *
 * 实现说明：
 *   - 起始标签格式：<skill_content name="X" base_dir="Y">（属性顺序固定，
 *     与 super-king 当前输出一致；如果未来变了再升级正则）
 *   - 结束标签：</skill_content>
 *   - 保守起见，buffer 中如果尾部可能是不完整的 `<skill_content`，会保留
 *     不 emit；最多保留 256 字符的尾部回看窗口
 */

const SKILL_OPEN_TAG_RE = /<skill_content\s+name="([^"]*)"\s+base_dir="([^"]*)"\s*>/
// 宽容版：属性顺序可颠倒（base_dir 在前，name 在后）。仅作为兜底，不影响主路径。
const SKILL_OPEN_TAG_RE_REV = /<skill_content\s+base_dir="([^"]*)"\s+name="([^"]*)"\s*>/
const SKILL_CLOSE_TAG = '</skill_content>'
const MAX_TAIL_KEEP = 256 // 防止半截标签：buffer 末尾保留多少字节不 emit

export interface SkillBlock {
  id: string
  name: string
  baseDir: string
  content: string
}

export interface ExtractResult {
  cleanContent: string
  skills: SkillBlock[]
}

let blockIdCounter = 0
function nextSkillId(): string {
  blockIdCounter++
  return `skill-${Date.now()}-${blockIdCounter}`
}

/**
 * 一次性提取一段完整字符串中所有的 skill_content 块。
 *
 * 用于历史消息：当 message.content 是一个完整字符串、可能包含一个或多个
 * 已经被拼接进去的 `<skill_content ...>...</skill_content>` 块时，把它们
 * 抽出来，返回干净的剩余文本和 SkillBlock 数组。
 */
export function extractSkillBlocks(content: string): ExtractResult {
  if (!content || !content.includes('<skill_content')) {
    return { cleanContent: content, skills: [] }
  }
  const skills: SkillBlock[] = []
  let cleaned = ''
  let rest = content
  while (rest.length > 0) {
    let openMatch = rest.match(SKILL_OPEN_TAG_RE)
    let name = ''
    let baseDir = ''
    if (openMatch && openMatch.index !== undefined) {
      name = openMatch[1] ?? ''
      baseDir = openMatch[2] ?? ''
    } else {
      // 兜底：试一下反向顺序（base_dir 在前）
      const rev = rest.match(SKILL_OPEN_TAG_RE_REV)
      if (rev && rev.index !== undefined) {
        openMatch = rev
        baseDir = rev[1] ?? ''
        name = rev[2] ?? ''
      }
    }
    if (!openMatch || openMatch.index === undefined) {
      // 还有 <skill_content 字面量但属性格式都不匹配 → 推进一格避免死循环
      const ltIdx = rest.indexOf('<skill_content')
      if (ltIdx >= 0) {
        cleaned += rest.slice(0, ltIdx + 1) // 保留 < 之前 + < 本身
        rest = rest.slice(ltIdx + 1)
        continue
      }
      cleaned += rest
      break
    }
    // 起始标签前的部分是干净文本
    cleaned += rest.slice(0, openMatch.index)
    const afterOpenIdx = openMatch.index + openMatch[0].length
    const closeIdx = rest.indexOf(SKILL_CLOSE_TAG, afterOpenIdx)
    if (closeIdx === -1) {
      // 没找到结束标签：把剩余全部当作 skill 内容（兜底）
      skills.push({
        id: nextSkillId(),
        name,
        baseDir,
        content: rest.slice(afterOpenIdx),
      })
      break
    }
    skills.push({
      id: nextSkillId(),
      name,
      baseDir,
      content: rest.slice(afterOpenIdx, closeIdx),
    })
    rest = rest.slice(closeIdx + SKILL_CLOSE_TAG.length)
  }
  return { cleanContent: cleaned, skills }
}

/**
 * 增量解析器：用于实时 SSE 流。
 *
 * 用法：
 *   const parser = createSkillStreamParser({ onText, onSkillStart, onSkillDelta, onSkillEnd })
 *   parser.push(deltaText)
 *   ...
 *   parser.flush()  // 流结束时调用，把保留的尾部全部 emit
 */
export interface SkillStreamCallbacks {
  onText: (text: string) => void
  onSkillStart: (id: string, name: string, baseDir: string) => void
  onSkillDelta: (id: string, content: string) => void
  onSkillEnd: (id: string) => void
}

export interface SkillStreamParser {
  push: (delta: string) => void
  flush: () => void
}

export function createSkillStreamParser(cbs: SkillStreamCallbacks): SkillStreamParser {
  // 状态机：
  //   - 'text'   : 在普通文本中，搜索 <skill_content
  //   - 'inside' : 已进入 skill 块，搜索 </skill_content>
  let mode: 'text' | 'inside' = 'text'
  let buf = ''
  let currentSkillId: string | null = null

  function processBuffer(isFlush: boolean): void {
    while (buf.length > 0) {
      if (mode === 'text') {
        // 找 < 起点
        const ltIdx = buf.indexOf('<')
        if (ltIdx === -1) {
          // 完全没有 <，整段都是纯文本
          cbs.onText(buf)
          buf = ''
          return
        }
        // < 之前的部分是普通文本，可以放心 emit
        if (ltIdx > 0) {
          cbs.onText(buf.slice(0, ltIdx))
          buf = buf.slice(ltIdx)
        }
        // 现在 buf 以 < 开头，尝试匹配完整 <skill_content ...>
        const m = buf.match(SKILL_OPEN_TAG_RE)
        if (m && m.index === 0) {
          // 完整匹配到起始标签
          const name = m[1] ?? ''
          const baseDir = m[2] ?? ''
          currentSkillId = nextSkillId()
          cbs.onSkillStart(currentSkillId, name, baseDir)
          buf = buf.slice(m[0].length)
          mode = 'inside'
          continue
        }
        // 没匹配上：可能是半截标签，也可能是普通 <
        // 判断：buf 开头是不是 <skill_content 的前缀？
        const possiblePrefix = '<skill_content'
        if (possiblePrefix.startsWith(buf) || buf.startsWith(possiblePrefix)) {
          // buf 是前缀（buf 比 prefix 短）或 buf 以 prefix 开头但属性还没收完
          if (isFlush) {
            // 流结束，强制 emit 当成普通文本
            cbs.onText(buf)
            buf = ''
            return
          }
          // 等更多数据
          return
        }
        // 不是 skill 标签开头（比如 <br>, <div>, < 后面跟空格等）
        // emit < 然后继续扫描后续
        cbs.onText('<')
        buf = buf.slice(1)
        continue
      }
      // mode === 'inside'
      const closeIdx = buf.indexOf(SKILL_CLOSE_TAG)
      if (closeIdx === -1) {
        // 没找到结束标签：把 buf 中"肯定不属于结束标签前缀"的部分 emit 为 skillDelta，
        // 末尾保留可能的半截结束标签
        const keepLen = Math.min(SKILL_CLOSE_TAG.length - 1, buf.length)
        if (buf.length > keepLen) {
          const emitPart = buf.slice(0, buf.length - keepLen)
          if (currentSkillId && emitPart) cbs.onSkillDelta(currentSkillId, emitPart)
          buf = buf.slice(buf.length - keepLen)
        }
        if (isFlush) {
          // 流结束：把剩下的也 emit 进 skill 内容，然后强制结束
          if (currentSkillId && buf) cbs.onSkillDelta(currentSkillId, buf)
          if (currentSkillId) cbs.onSkillEnd(currentSkillId)
          currentSkillId = null
          buf = ''
          mode = 'text'
          return
        }
        return
      }
      // 找到结束标签
      const innerPart = buf.slice(0, closeIdx)
      if (currentSkillId && innerPart) cbs.onSkillDelta(currentSkillId, innerPart)
      if (currentSkillId) cbs.onSkillEnd(currentSkillId)
      currentSkillId = null
      buf = buf.slice(closeIdx + SKILL_CLOSE_TAG.length)
      mode = 'text'
    }
  }

  return {
    push(delta: string) {
      if (!delta) return
      buf += delta
      // 防 buffer 无限增长：text 模式下如果 buf 超过 MAX_TAIL_KEEP 且不包含 <，全 emit
      if (mode === 'text' && buf.length > MAX_TAIL_KEEP && !buf.includes('<')) {
        cbs.onText(buf)
        buf = ''
        return
      }
      processBuffer(false)
    },
    flush() {
      processBuffer(true)
      // 走完循环后剩下的（极少出现）当文本兜底
      if (buf.length > 0) {
        if (mode === 'inside' && currentSkillId) {
          cbs.onSkillDelta(currentSkillId, buf)
          cbs.onSkillEnd(currentSkillId)
          currentSkillId = null
        } else {
          cbs.onText(buf)
        }
        buf = ''
        mode = 'text'
      }
    },
  }
}
