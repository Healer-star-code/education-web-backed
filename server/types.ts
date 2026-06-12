export interface ApiImagePayload {
  name: string
  mimeType: string
  data: string
}

export interface PromptPayload {
  message: string
  images?: ApiImagePayload[]
}

export interface WebSessionInfo {
  id: string
  cwd: string
  sessionFile?: string
  created: string
  modified: string
  firstMessage: string
  messageCount: number
  name?: string
  parentSessionId?: string
}

export interface SkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
}

export interface PermissionRequestInfo {
  id: string
  sessionId: string
  toolName: string
  operation: 'read' | 'write' | 'search' | 'list' | 'execute'
  path?: string
  command?: string
  reason: string
  timeCreated: number
}

export type WebAgentEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'agent_start' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_end'; content: string }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'assistant_message_end' }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_update'; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'permission_request'; request: PermissionRequestInfo }
  | { type: 'permission_resolved'; requestId: string; decision: 'allow_once' | 'allow_session' | 'deny' }
  | { type: 'agent_end' }
  | { type: 'error'; message: string }
