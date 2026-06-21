export interface SessionInfo {
  id: string
  name?: string
  cwd: string
  created: string
  modified: string
  messageCount: number
  firstMessage: string
  titleSource?: 'ai' | 'user'
  aiTitleGenerated?: boolean
  parentSessionId?: string
  sessionFile?: string
  error?: boolean
  orphaned?: boolean
  model?: { provider: string; modelId: string } | null
  cost?: number
  tokens?: { input: number; output: number; total: number }
}

export interface MessageAttachment {
  id: number
  name: string
  url: string
  type: 'image' | 'document' | 'presentation' | 'spreadsheet' | 'pdf' | 'text' | 'file'
  mimeType?: string
  size?: number
  /** 上传到 <cwd>/.uploads/ 之后的绝对路径，用于历史消息复用 ArtifactCard 三按钮 */
  localPath?: string
  /** 是否图片（图片走 base64 + super-king images 字段，文档走 cwd 复制） */
  isImage?: boolean
}

export interface ArtifactInfo {
  id: string
  sessionId: string
  name: string
  path: string
  mimeType: string
  size: number
  kind: 'word' | 'presentation' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'file'
  timeCreated: number
  messageIndex?: number
  /** 本地启发式扫描出来的 artifact：用户磁盘上的绝对路径（FileCard 据此走 IPC 而不是 HTTP） */
  localPath?: string
  /** 文件当前是否存在（用于卡片置灰） */
  exists?: boolean
  /** 来源：backend = super-king SSE 推送；local-scan = 前端文本扫描兜底 */
  source?: 'backend' | 'local-scan'
}

export interface LocalAttachment {
  id: number
  name: string
  url: string
  file: File
  progress: number
  /** 写入到 OS 临时目录的绝对路径（writeBlobToTemp 结果）。ready 后才有。 */
  tempPath?: string
  /** 上传状态机：uploading（写 temp 中）/ ready（可发送）/ error（失败） */
  status?: 'uploading' | 'ready' | 'error'
  /** 失败时的错误信息（显示在卡片上） */
  error?: string
}

export type ToolStatus = 'running' | 'done' | 'error' | 'waiting_permission'

export interface ToolCallInfo {
  id: string
  name: string
  status: ToolStatus
  args?: unknown
  result?: unknown
  partialResult?: unknown
  permissionId?: string
}

export type AgentStep =
  | { type: 'thinking'; id: string; content: string; durationMs: number; isThinking: boolean }
  | { type: 'tool'; id: string; name: string; status: ToolStatus; args?: unknown; result?: unknown; partialResult?: unknown; permissionId?: string }
  | { type: 'skill_load'; id: string; name: string; baseDir: string; content: string; isLoading: boolean }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  parentId?: string
  timestamp?: string
  attachments?: MessageAttachment[]
  artifacts?: ArtifactInfo[]
  steps?: AgentStep[]
  thinkingContent?: string
  thinkingDurationMs?: number
  toolCalls?: ToolCallInfo[]
  pendingTask?: 'word' | 'default'
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export const mockSessions: SessionInfo[] = [
  {
    id: 'sess-001',
    name: 'Python教学课程设计',
    cwd: '/Users/teacher/projects/education',
    created: '2026-06-07T08:00:00Z',
    modified: '2026-06-08T14:30:00Z',
    messageCount: 24,
    firstMessage: '请帮我设计一个初中数学的三角函数教学方案',
  },
  {
    id: 'sess-002',
    name: 'React组件开发',
    cwd: '/Users/teacher/projects/react-ui',
    created: '2026-06-08T09:00:00Z',
    modified: '2026-06-08T10:15:00Z',
    messageCount: 18,
    firstMessage: '帮我写一个可复用的表格组件',
  },
  {
    id: 'sess-003',
    name: '数学题库生成',
    cwd: '/Users/teacher/projects/math',
    created: '2026-06-07T14:00:00Z',
    modified: '2026-06-07T16:45:00Z',
    messageCount: 32,
    firstMessage: '生成一套初中代数练习题',
  },
  {
    id: 'sess-004',
    name: 'English reading assistant',
    cwd: '/Users/teacher/projects/english',
    created: '2026-06-06T09:00:00Z',
    modified: '2026-06-07T09:20:00Z',
    messageCount: 15,
    firstMessage: 'Create a reading comprehension exercise for intermediate students',
  },
  {
    id: 'sess-005',
    name: '物理实验模拟',
    cwd: '/Users/teacher/projects/physics',
    created: '2026-06-05T10:00:00Z',
    modified: '2026-06-06T11:00:00Z',
    messageCount: 28,
    firstMessage: '模拟自由落体运动的动画',
  },
  {
    id: 'sess-006',
    name: '试题批改分析（forked）',
    cwd: '/Users/teacher/projects/education',
    created: '2026-06-08T15:00:00Z',
    modified: '2026-06-08T15:45:00Z',
    messageCount: 12,
    firstMessage: '分析这批数学试卷的答题情况',
    parentSessionId: 'sess-001',
  },
  {
    id: 'sess-007',
    orphaned: true,
    cwd: '/Users/teacher/projects/temp',
    created: '2026-06-08T16:00:00Z',
    modified: '2026-06-08T16:02:00Z',
    messageCount: 1,
    firstMessage: 'test',
    error: true,
  },
]

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: '请帮我设计一个初中数学的三角函数教学方案',
    timestamp: '2026-06-08T14:30:00Z',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: `好的，我来设计一个初中数学三角函数教学方案。

## 教学目标

1. **理解正弦、余弦、正切**的基本概念
2. **掌握特殊角**（30°、45°、60°）的三角函数值
3. **能运用三角函数**解决简单的实际问题

## 教学重点

- 直角三角形中边角关系
- 三角函数定义的记忆方法
- 测量高度、距离等实际问题

## 教学方案

### 第一课时：引入概念

使用"测高问题"引入，让学生思考：如何测量一棵大树的高度而不需要爬上去？

\`\`\`
已知：距离树底10米，仰角30°
解：树高 = 10 × tan(30°) = 10 × 0.577 ≈ 5.77米
\`\`\`

### 第二课时：特殊角记忆

| 角度 | sin | cos | tan |
|------|-----|-----|-----|
| 30° | 1/2 | √3/2 | √3/3 |
| 45° | √2/2 | √2/2 | 1 |
| 60° | √3/2 | 1/2 | √3 |

> **记忆口诀**：一二三，三二一，三九二十七

需要我继续展开更多课时内容吗？`,
    timestamp: '2026-06-08T14:31:00Z',
  },
  {
    id: 'msg-3',
    role: 'user',
    content: '需要，再帮我设计一些课堂练习题',
    timestamp: '2026-06-08T14:32:00Z',
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content: `当然，这里是配套的课堂练习题：

## 基础练习

### 1. 计算题
求下列各式的值：
- \`sin 30° + cos 60°\`
- \`tan 45° - sin 30°\`
- \`cos 30° × tan 60°\`

### 2. 应用题
一座塔在水平地面上投下阴影长20米，此时太阳仰角为60°，求塔高。

### 3. 综合题
在 △ABC 中，∠C = 90°，AB = 10，∠A = 30°，求 BC 和 AC 的长度。

> **答案提示**：第2题答案 ≈ 34.64米，第3题 BC = 5，AC = 5√3 ≈ 8.66

需要我提供详细的解题步骤吗？`,
    timestamp: '2026-06-08T14:33:00Z',
  },
  {
    id: 'msg-5',
    role: 'user',
    content: '帮我写一个Python程序来验证这些三角函数的计算',
    timestamp: '2026-06-08T14:34:00Z',
  },
  {
    id: 'msg-6',
    role: 'assistant',
    content: `这是一个验证三角函数计算的Python程序：

\`\`\`python
import math

def verify_trig():
    """验证三角函数特殊值"""
    print("=== 三角函数验证 ===")
    
    # 30度
    rad_30 = math.radians(30)
    print(f"sin 30° = {math.sin(rad_30):.4f} (理论: 0.5)")
    print(f"cos 30° = {math.cos(rad_30):.4f} (理论: √3/2 ≈ 0.8660)")
    print(f"tan 30° = {math.tan(rad_30):.4f} (理论: √3/3 ≈ 0.5774)")
    
    # 45度
    rad_45 = math.radians(45)
    print(f"sin 45° = {math.sin(rad_45):.4f} (理论: √2/2 ≈ 0.7071)")
    print(f"cos 45° = {math.cos(rad_45):.4f} (理论: √2/2 ≈ 0.7071)")
    
    # 60度
    rad_60 = math.radians(60)
    print(f"sin 60° = {math.sin(rad_60):.4f} (理论: √3/2 ≈ 0.8660)")
    print(f"cos 60° = {math.cos(rad_60):.4f} (理论: 0.5)")
    print(f"tan 60° = {math.tan(rad_60):.4f} (理论: √3 ≈ 1.7321)")
    
    # 塔高计算
    print("\n=== 应用题验证 ===")
    shadow = 20
    angle = 60
    rad = math.radians(angle)
    height = shadow * math.tan(rad)
    print(f"塔高 = {height:.2f}米 (阴影{shadow}m, 仰角{angle}°)")
    
    # 直角三角形
    ab = 10
    angle_a = 30
    rad_a = math.radians(angle_a)
    bc = ab * math.sin(rad_a)
    ac = ab * math.cos(rad_a)
    print(f"\nAB = {ab}, ∠A = {angle_a}°")
    print(f"BC = {bc:.2f}, AC = {ac:.2f}")

if __name__ == "__main__":
    verify_trig()
\`\`\`

运行结果：
\`\`\`
=== 三角函数验证 ===
sin 30° = 0.5000 (理论: 0.5)
cos 30° = 0.8660 (理论: √3/2 ≈ 0.8660)
tan 30° = 0.5774 (理论: √3/3 ≈ 0.5774)
sin 45° = 0.7071 (理论: √2/2 ≈ 0.7071)
cos 45° = 0.7071 (理论: √2/2 ≈ 0.7071)

=== 应用题验证 ===
塔高 = 34.64米 (阴影20m, 仰角60°)
AB = 10, ∠A = 30°
BC = 5.00, AC = 8.66
\`\`\`

这样学生可以通过编程来直观理解三角函数的计算过程。`,
    timestamp: '2026-06-08T14:35:00Z',
  },
]

export const mockFileTree: FileNode[] = [
  {
    name: 'education',
    path: '/Users/teacher/projects/education',
    type: 'directory',
    children: [
      { name: 'lesson_plan.md', path: '/Users/teacher/projects/education/lesson_plan.md', type: 'file' },
      { name: 'exercises.py', path: '/Users/teacher/projects/education/exercises.py', type: 'file' },
      { name: 'trig_verify.py', path: '/Users/teacher/projects/education/trig_verify.py', type: 'file' },
      { name: 'quiz_data.json', path: '/Users/teacher/projects/education/quiz_data.json', type: 'file' },
      {
        name: 'materials',
        path: '/Users/teacher/projects/education/materials',
        type: 'directory',
        children: [
          { name: 'slides.pptx', path: '/Users/teacher/projects/education/materials/slides.pptx', type: 'file' },
          { name: 'worksheet.pdf', path: '/Users/teacher/projects/education/materials/worksheet.pdf', type: 'file' },
          { name: 'answers.md', path: '/Users/teacher/projects/education/materials/answers.md', type: 'file' },
        ],
      },
    ],
  },
  {
    name: 'react-ui',
    path: '/Users/teacher/projects/react-ui',
    type: 'directory',
    children: [
      { name: 'src', path: '/Users/teacher/projects/react-ui/src', type: 'directory', children: [
        { name: 'App.tsx', path: '/Users/teacher/projects/react-ui/src/App.tsx', type: 'file' },
        { name: 'Table.tsx', path: '/Users/teacher/projects/react-ui/src/Table.tsx', type: 'file' },
        { name: 'index.css', path: '/Users/teacher/projects/react-ui/src/index.css', type: 'file' },
      ]},
      { name: 'package.json', path: '/Users/teacher/projects/react-ui/package.json', type: 'file' },
      { name: 'tsconfig.json', path: '/Users/teacher/projects/react-ui/tsconfig.json', type: 'file' },
    ],
  },
  {
    name: 'math',
    path: '/Users/teacher/projects/math',
    type: 'directory',
    children: [
      { name: 'questions.json', path: '/Users/teacher/projects/math/questions.json', type: 'file' },
      { name: 'generator.py', path: '/Users/teacher/projects/math/generator.py', type: 'file' },
      { name: 'answers', path: '/Users/teacher/projects/math/answers', type: 'directory', children: [
        { name: 'set_01.json', path: '/Users/teacher/projects/math/answers/set_01.json', type: 'file' },
        { name: 'set_02.json', path: '/Users/teacher/projects/math/answers/set_02.json', type: 'file' },
      ]},
    ],
  },
  {
    name: 'english',
    path: '/Users/teacher/projects/english',
    type: 'directory',
    children: [
      { name: 'reading_exercise.md', path: '/Users/teacher/projects/english/reading_exercise.md', type: 'file' },
      { name: 'vocabulary.json', path: '/Users/teacher/projects/english/vocabulary.json', type: 'file' },
    ],
  },
  {
    name: 'physics',
    path: '/Users/teacher/projects/physics',
    type: 'directory',
    children: [
      { name: 'simulation.py', path: '/Users/teacher/projects/physics/simulation.py', type: 'file' },
      { name: 'config.yaml', path: '/Users/teacher/projects/physics/config.yaml', type: 'file' },
    ],
  },
  {
    name: 'temp',
    path: '/Users/teacher/projects/temp',
    type: 'directory',
    children: [
      { name: 'test.txt', path: '/Users/teacher/projects/temp/test.txt', type: 'file' },
    ],
  },
]
