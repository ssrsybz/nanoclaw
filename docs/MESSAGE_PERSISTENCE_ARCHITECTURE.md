# CLI 消息持久化与工具展示架构方案

本文档详细描述了 Claude Code 的消息持久化机制和工具操作展示系统的实现方案，供复刻参考。

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         React UI Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ MessageList │  │ ToolUseCard │  │ ToolResultCard          │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                 │
│         └────────────────┴─────────────────────┘                 │
│                          │                                       │
│                   useLogMessages Hook                            │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                    Persistence Layer                             │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────┐           │
│  │              SessionStorage                        │           │
│  │  ┌──────────────────────────────────────────────┐ │           │
│  │  │ recordTranscript() → insertMessageChain()    │ │           │
│  │  │                     → appendEntry()          │ │           │
│  │  └──────────────────────────────────────────────┘ │           │
│  │                      │                             │           │
│  │  ┌───────────────────▼────────────────────────┐   │           │
│  │  │ WriteQueue (100ms batch flush)             │   │           │
│  │  └────────────────────────────────────────────┘   │           │
│  └───────────────────────────────────────────────────┘           │
│                          │                                       │
│  ┌───────────────────────▼───────────────────────────┐           │
│  │         transcript.jsonl (JSON Lines format)       │           │
│  │  {"type":"transcript_message","parentUuid":null...}│           │
│  │  {"type":"transcript_message","parentUuid":"xxx"...}           │
│  │  {"type":"summary_message","parentUuid":"yyy"...}  │           │
│  └───────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

## 二、核心数据结构

### 2.1 消息类型定义

```typescript
// types/message.ts

import type { UUID } from 'crypto'

// 消息角色
type MessageRole = 'user' | 'assistant'

// 基础消息接口
interface BaseMessage {
  uuid: UUID
  role: MessageRole
  timestamp: number
  parentUuid: UUID | null  // 形成链表结构
  sessionId: string
}

// 用户消息
interface UserMessage extends BaseMessage {
  role: 'user'
  content: string | ContentBlock[]
}

// 助手消息
interface AssistantMessage extends BaseMessage {
  role: 'assistant'
  content: ContentBlock[]
  thinking?: string  // 思考内容
}

// 内容块类型
type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock

interface TextBlock {
  type: 'text'
  text: string
}

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string  // 工具名称，如 "Read", "Edit", "Write"
  input: Record<string, unknown>  // 工具参数
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}
```

### 2.2 持久化条目类型

```typescript
// types/logs.ts

import type { UUID } from 'crypto'

// 条目类型枚举
type EntryType =
  | 'transcript_message'    // 普通消息
  | 'summary_message'       // 会话摘要
  | 'custom_title_message'  // 自定义标题
  | 'tombstone_message'     // 墓碑消息（已删除）

// 基础条目接口
interface BaseEntry {
  type: EntryType
  parentUuid: UUID | null
  timestamp: number
  sessionId: string
}

// 消息条目
interface TranscriptMessageEntry extends BaseEntry {
  type: 'transcript_message'
  message: SerializedMessage
}

// 摘要条目
interface SummaryMessageEntry extends BaseEntry {
  type: 'summary_message'
  summary: string
  rawMessages: SerializedMessage[]  // 原始消息用于重建
}

// 序列化消息（包含会话元数据）
interface SerializedMessage {
  uuid: UUID
  role: MessageRole
  content: ContentBlock[]
  timestamp: number
  parentUuid: UUID | null
  sessionId: string
  // 会话元数据
  version: string          // 消息格式版本
  requestType?: string     // 请求类型
  model?: string           // 使用的模型
}
```

## 三、工具系统接口

### 3.1 工具基础接口

```typescript
// Tool.ts

import type { UUID } from 'crypto'
import type { ReactElement } from 'react'

// 工具输入参数类型
interface ToolInput {
  [key: string]: unknown
}

// 工具结果类型
interface ToolResult {
  output: string
  error?: boolean
  metadata?: Record<string, unknown>
}

// 工具接口
interface Tool<TInput extends ToolInput = ToolInput> {
  // 工具名称
  name: string

  // 用户友好的名称（用于UI显示）
  userFacingName(): string

  // 渲染工具调用消息
  renderToolUseMessage?(input: TInput): ReactElement | string

  // 渲染工具结果消息
  renderToolResultMessage?(
    result: ToolResult,
    input: TInput
  ): ReactElement | string

  // 渲染进度消息（实时更新）
  renderToolUseProgressMessage?(
    input: TInput,
    progress: ProgressInfo
  ): ReactElement | string

  // 获取活动描述（用于状态栏等）
  getActivityDescription?(input: TInput): string

  // 获取工具使用摘要
  getToolUseSummary?(input: TInput): string

  // 执行工具
  execute(input: TInput): Promise<ToolResult>
}

// 进度信息
interface ProgressInfo {
  message: string
  percentage?: number
  phase?: string
}
```

### 3.2 工具实现示例

```typescript
// tools/FileReadTool/index.ts

import { Tool } from '../Tool.js'
import type { ReactElement } from 'react'
import { FileReadMessage } from './UI.jsx'

interface FileReadInput {
  file_path: string
  offset?: number
  limit?: number
}

export class FileReadTool implements Tool<FileReadInput> {
  name = 'Read'

  userFacingName(): string {
    return 'Read File'
  }

  getActivityDescription(input: FileReadInput): string {
    const filename = input.file_path.split('/').pop()
    return `Reading ${filename}`
  }

  renderToolUseMessage(input: FileReadInput): ReactElement {
    return FileReadMessage({
      filePath: input.file_path,
      offset: input.offset,
      limit: input.limit,
      phase: 'pending'
    })
  }

  renderToolResultMessage(
    result: ToolResult,
    input: FileReadInput
  ): ReactElement {
    const lines = result.output.split('\n').length
    return FileReadMessage({
      filePath: input.file_path,
      offset: input.offset,
      limit: input.limit,
      phase: 'complete',
      lineCount: lines
    })
  }

  getToolUseSummary(input: FileReadInput): string {
    const filename = input.file_path.split('/').pop()
    return `Read ${filename}`
  }

  async execute(input: FileReadInput): Promise<ToolResult> {
    // 实际的文件读取逻辑
    const content = await readFile(input.file_path)
    return { output: content }
  }
}
```

### 3.3 工具UI组件

```typescript
// tools/FileReadTool/UI.tsx

import React from 'react'

interface FileReadMessageProps {
  filePath: string
  offset?: number
  limit?: number
  phase: 'pending' | 'complete' | 'error'
  lineCount?: number
  error?: string
}

export function FileReadMessage(props: FileReadMessageProps) {
  const { filePath, offset, limit, phase, lineCount, error } = props

  // 提取文件名
  const filename = filePath.split('/').pop()

  if (phase === 'pending') {
    return (
      <div className="tool-use-card">
        <div className="tool-header">
          <span className="tool-icon">📖</span>
          <span className="tool-name">Read</span>
        </div>
        <div className="tool-content">
          <code className="file-path">{filePath}</code>
          {offset !== undefined && (
            <span className="line-range">
              lines {offset}
              {limit !== undefined && `-${offset + limit}`}
            </span>
          )}
        </div>
        <div className="tool-status pending">Reading...</div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="tool-use-card error">
        <div className="tool-header">
          <span className="tool-icon">📖</span>
          <span className="tool-name">Read</span>
        </div>
        <div className="tool-content">
          <code className="file-path">{filePath}</code>
        </div>
        <div className="tool-status error">{error}</div>
      </div>
    )
  }

  return (
    <div className="tool-use-card complete">
      <div className="tool-header">
        <span className="tool-icon">📖</span>
        <span className="tool-name">Read</span>
      </div>
      <div className="tool-content">
        <code className="file-path">{filePath}</code>
        {offset !== undefined && (
          <span className="line-range">
            lines {offset}
            {limit !== undefined && `-${offset + limit}`}
          </span>
        )}
      </div>
      <div className="tool-result-summary">
        {lineCount} lines read
      </div>
    </div>
  )
}
```

## 四、持久化层实现

### 4.1 SessionStorage 核心实现

```typescript
// utils/sessionStorage.ts

import { UUID } from 'crypto'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'

// 条目类型
type Entry = TranscriptMessageEntry | SummaryMessageEntry

// 写入队列项
interface WriteQueueItem {
  entry: Entry
  resolve: () => void
  reject: (error: Error) => void
}

// 写入队列
const writeQueue: WriteQueueItem[] = []
let isFlushing = false
let flushTimeout: NodeJS.Timeout | null = null

// 获取会话目录
function getSessionDir(sessionId: string): string {
  return join(getConfigDir(), 'projects', sessionId)
}

// 获取会话文件路径
function getTranscriptPath(sessionId: string): string {
  return join(getSessionDir(sessionId), 'transcript.jsonl')
}

// 追加条目到文件
async function appendEntry(
  sessionId: string,
  entry: Entry
): Promise<void> {
  return new Promise((resolve, reject) => {
    writeQueue.push({ entry, resolve, reject })
    scheduleFlush()
  })
}

// 安排刷新
function scheduleFlush(): void {
  if (flushTimeout) return

  // 100ms 批量刷新
  flushTimeout = setTimeout(() => {
    flushTimeout = null
    flushWriteQueue()
  }, 100)
}

// 刷新写入队列
async function flushWriteQueue(): Promise<void> {
  if (isFlushing || writeQueue.length === 0) return

  isFlushing = true
  const batch = writeQueue.splice(0, writeQueue.length)

  try {
    // 按会话分组
    const bySession = new Map<string, Entry[]>()
    for (const item of batch) {
      const sessionId = item.entry.sessionId
      if (!bySession.has(sessionId)) {
        bySession.set(sessionId, [])
      }
      bySession.get(sessionId)!.push(item.entry)
    }

    // 批量写入每个会话
    for (const [sessionId, entries] of bySession) {
      const filePath = getTranscriptPath(sessionId)
      await mkdir(dirname(filePath), { recursive: true })

      const lines = entries
        .map(e => JSON.stringify(e))
        .join('\n') + '\n'

      await appendFile(filePath, lines, { encoding: 'utf8' })
    }

    // 解决所有 Promise
    for (const item of batch) {
      item.resolve()
    }
  } catch (error) {
    // 拒绝所有 Promise
    for (const item of batch) {
      item.reject(error as Error)
    }
  } finally {
    isFlushing = false

    // 如果队列又有新内容，继续刷新
    if (writeQueue.length > 0) {
      scheduleFlush()
    }
  }
}

// 插入消息链
async function insertMessageChain(
  sessionId: string,
  messages: SerializedMessage[],
  parentHint?: UUID | null
): Promise<UUID | null> {
  let lastUuid: UUID | null = parentHint ?? null

  for (const message of messages) {
    const entry: TranscriptMessageEntry = {
      type: 'transcript_message',
      parentUuid: lastUuid,
      timestamp: message.timestamp || Date.now(),
      sessionId,
      message: {
        ...message,
        parentUuid: lastUuid,
        sessionId
      }
    }

    await appendEntry(sessionId, entry)
    lastUuid = message.uuid
  }

  return lastUuid
}

// 记录对话
async function recordTranscript(
  messages: Message[],
  metadata: { teamName?: string; agentName?: string } = {},
  parentHint?: UUID | null,
  allMessages?: Message[]
): Promise<UUID | null> {
  // 清理并序列化消息
  const cleaned = cleanMessagesForLogging(messages, allMessages)

  const serialized: SerializedMessage[] = cleaned.map(msg => ({
    uuid: msg.uuid,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp || Date.now(),
    parentUuid: msg.parentUuid,
    sessionId: getSessionId(),
    version: '1.0'
  }))

  return insertMessageChain(getSessionId(), serialized, parentHint)
}

// 清理消息用于日志记录
function cleanMessagesForLogging(
  messages: Message[],
  allMessages?: Message[]
): Message[] {
  return messages
    .filter(isLoggableMessage)
    .map(msg => transformForExternalUser(msg, allMessages))
}

// 检查是否可记录的消息
function isLoggableMessage(message: Message): boolean {
  // 过滤掉内部消息、进度消息等
  if (message.type === 'progress') return false
  if (message.type === 'internal') return false
  return true
}

export {
  recordTranscript,
  insertMessageChain,
  appendEntry,
  cleanMessagesForLogging
}
```

### 4.2 历史记录实现

```typescript
// history.ts

import { appendFile, writeFile } from 'fs/promises'
import { join } from 'path'

const MAX_HISTORY_ITEMS = 100
const MAX_PASTED_CONTENT_LENGTH = 1024

// 存储的粘贴内容类型
type StoredPastedContent = {
  id: number
  type: 'text' | 'image'
  content?: string           // 小内容内联存储
  contentHash?: string       // 大内容的哈希引用
  mediaType?: string
  filename?: string
}

// 日志条目类型
type LogEntry = {
  display: string
  pastedContents: Record<number, StoredPastedContent>
  timestamp: number
  project: string
  sessionId?: string
}

// 待写入条目
let pendingEntries: LogEntry[] = []
let isWriting = false
let lastAddedEntry: LogEntry | null = null

// 格式化粘贴文本引用
export function formatPastedTextRef(id: number, numLines: number): string {
  if (numLines === 0) {
    return `[Pasted text #${id}]`
  }
  return `[Pasted text #${id} +${numLines} lines]`
}

// 格式化图片引用
export function formatImageRef(id: number): string {
  return `[Image #${id}]`
}

// 解析引用
export function parseReferences(
  input: string
): Array<{ id: number; match: string; index: number }> {
  const referencePattern =
    /\[(Pasted text|Image|\.\.\.Truncated text) #(\d+)(?: \+\d+ lines)?(\.)*\]/g
  const matches = [...input.matchAll(referencePattern)]

  return matches
    .map(match => ({
      id: parseInt(match[2] || '0'),
      match: match[0],
      index: match.index!
    }))
    .filter(match => match.id > 0)
}

// 添加到历史记录
export function addToHistory(command: HistoryEntry | string): void {
  // 跳过特定环境
  if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY)) {
    return
  }

  void addToPromptHistory(command)
}

// 获取历史记录
export async function* getHistory(): AsyncGenerator<HistoryEntry> {
  const currentProject = getProjectRoot()
  const currentSession = getSessionId()
  const otherSessionEntries: LogEntry[] = []
  let yielded = 0

  for await (const entry of makeLogEntryReader()) {
    if (!entry || typeof entry.project !== 'string') continue
    if (entry.project !== currentProject) continue

    if (entry.sessionId === currentSession) {
      yield await logEntryToHistoryEntry(entry)
      yielded++
    } else {
      otherSessionEntries.push(entry)
    }

    if (yielded + otherSessionEntries.length >= MAX_HISTORY_ITEMS) break
  }

  for (const entry of otherSessionEntries) {
    if (yielded >= MAX_HISTORY_ITEMS) return
    yield await logEntryToHistoryEntry(entry)
    yielded++
  }
}

// 撤销最近的历史记录
export function removeLastFromHistory(): void {
  if (!lastAddedEntry) return
  const entry = lastAddedEntry
  lastAddedEntry = null

  const idx = pendingEntries.lastIndexOf(entry)
  if (idx !== -1) {
    pendingEntries.splice(idx, 1)
  } else {
    // 已刷新到磁盘，添加到跳过集合
    skippedTimestamps.add(entry.timestamp)
  }
}
```

## 五、React 钩子实现

### 5.1 useLogMessages 钩子

```typescript
// hooks/useLogMessages.ts

import { UUID } from 'crypto'
import { useEffect, useRef } from 'react'

/**
 * 自动将消息记录到持久化存储的钩子
 *
 * @param messages 当前对话消息列表
 * @param ignore 是否忽略记录
 */
export function useLogMessages(
  messages: Message[],
  ignore: boolean = false
) {
  // 记录已处理的消息长度，避免重复处理
  const lastRecordedLengthRef = useRef(0)
  const lastParentUuidRef = useRef<UUID | undefined>(undefined)
  const firstMessageUuidRef = useRef<UUID | undefined>(undefined)
  const callSeqRef = useRef(0)

  useEffect(() => {
    if (ignore) return

    const currentFirstUuid = messages[0]?.uuid as UUID | undefined
    const prevLength = lastRecordedLengthRef.current

    // 检测是否是增量更新
    const wasFirstRender = firstMessageUuidRef.current === undefined
    const isIncremental =
      currentFirstUuid !== undefined &&
      !wasFirstRender &&
      currentFirstUuid === firstMessageUuidRef.current &&
      prevLength <= messages.length

    // 检测是否是同头收缩（删除/撤销等）
    const isSameHeadShrink =
      currentFirstUuid !== undefined &&
      !wasFirstRender &&
      currentFirstUuid === firstMessageUuidRef.current &&
      prevLength > messages.length

    // 计算起始索引
    const startIndex = isIncremental ? prevLength : 0
    if (startIndex === messages.length) return

    // 获取待记录的消息切片
    const slice = startIndex === 0 ? messages : messages.slice(startIndex)
    const parentHint = isIncremental ? lastParentUuidRef.current : undefined

    // 异步记录
    const seq = ++callSeqRef.current
    void recordTranscript(slice, {}, parentHint, messages)
      .then(lastRecordedUuid => {
        // 防止过期闭包覆盖新数据
        if (seq !== callSeqRef.current) return
        if (lastRecordedUuid && !isIncremental) {
          lastParentUuidRef.current = lastRecordedUuid
        }
      })

    // 同步更新父UUID引用
    if (isIncremental || wasFirstRender || isSameHeadShrink) {
      const last = cleanMessagesForLogging(slice, messages)
        .findLast(isChainParticipant)
      if (last) {
        lastParentUuidRef.current = last.uuid as UUID
      }
    }

    lastRecordedLengthRef.current = messages.length
    firstMessageUuidRef.current = currentFirstUuid
  }, [messages, ignore])
}
```

## 六、JSONL 文件格式

### 6.1 文件结构

```
transcript.jsonl
├── {"type":"transcript_message","parentUuid":null,"timestamp":1714396800000,...}
├── {"type":"transcript_message","parentUuid":"abc-123","timestamp":1714396801000,...}
├── {"type":"transcript_message","parentUuid":"def-456","timestamp":1714396802000,...}
└── {"type":"summary_message","parentUuid":"ghi-789","timestamp":1714396900000,...}
```

### 6.2 parentUuid 链式结构

```
null (第一条消息)
  │
  └──► uuid-001 (parentUuid: null)
          │
          └──► uuid-002 (parentUuid: uuid-001)
                  │
                  └──► uuid-003 (parentUuid: uuid-002)
                          │
                          └──► ...
```

## 七、工具注册与发现

### 7.1 工具注册表

```typescript
// tools/registry.ts

import type { Tool } from '../Tool.js'

// 工具注册表
const toolRegistry = new Map<string, Tool>()

// 注册工具
export function registerTool(tool: Tool): void {
  toolRegistry.set(tool.name, tool)
}

// 获取工具
export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name)
}

// 获取所有工具
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values())
}

// 初始化：注册所有内置工具
export function initializeTools(): void {
  registerTool(new FileReadTool())
  registerTool(new FileEditTool())
  registerTool(new FileWriteTool())
  registerTool(new BashTool())
  registerTool(new WebSearchTool())
  // ... 更多工具
}
```

### 7.2 工具渲染器映射

```typescript
// components/ToolRenderer.tsx

import React from 'react'
import { getTool } from '../tools/registry.js'

interface ToolRendererProps {
  type: 'use' | 'result' | 'progress'
  toolName: string
  input: Record<string, unknown>
  result?: ToolResult
  progress?: ProgressInfo
}

export function ToolRenderer(props: ToolRendererProps) {
  const { type, toolName, input, result, progress } = props

  const tool = getTool(toolName)
  if (!tool) {
    return <div className="unknown-tool">Unknown tool: {toolName}</div>
  }

  switch (type) {
    case 'use':
      if (tool.renderToolUseMessage) {
        return tool.renderToolUseMessage(input)
      }
      return (
        <div className="tool-use">
          {tool.userFacingName()}: {JSON.stringify(input)}
        </div>
      )

    case 'result':
      if (tool.renderToolResultMessage && result) {
        return tool.renderToolResultMessage(result, input)
      }
      return (
        <div className="tool-result">
          {result?.output || 'No result'}
        </div>
      )

    case 'progress':
      if (tool.renderToolUseProgressMessage && progress) {
        return tool.renderToolUseProgressMessage(input, progress)
      }
      return (
        <div className="tool-progress">
          {progress?.message || 'Processing...'}
        </div>
      )
  }
}
```

## 八、文件结构总结

```
src/
├── types/
│   ├── message.ts          # 消息类型定义
│   └── logs.ts             # 日志条目类型定义
│
├── utils/
│   ├── sessionStorage.ts   # 核心持久化实现
│   └── history.ts          # 历史记录管理
│
├── tools/
│   ├── index.ts            # 工具导出
│   ├── registry.ts         # 工具注册表
│   ├── Tool.ts             # 工具接口定义
│   ├── FileReadTool/
│   │   ├── index.ts        # 工具实现
│   │   └── UI.tsx          # UI组件
│   ├── FileEditTool/
│   ├── FileWriteTool/
│   └── ...                 # 其他工具
│
├── hooks/
│   └── useLogMessages.ts   # React钩子
│
├── components/
│   ├── MessageList.tsx     # 消息列表
│   ├── ToolRenderer.tsx    # 工具渲染器
│   └── ...
│
└── state/
    └── AppState.ts         # 应用状态管理
```

## 九、关键设计要点

1. **JSONL 格式**：每行一个 JSON 对象，便于追加写入和按行读取

2. **parentUuid 链**：形成消息的链表结构，支持对话重建和增量同步

3. **写入队列**：100ms 批量刷新，减少 IO 操作

4. **工具接口**：每个工具控制自己的 UI 展示，通过 `userFacingName`、`renderToolUseMessage` 等方法

5. **React 钩子**：`useLogMessages` 自动监听消息变化并持久化

6. **增量更新**：通过 `lastRecordedLengthRef` 跟踪已处理消息，避免全量扫描

7. **压缩处理**：大内容通过哈希引用存储在外部文件

8. **历史去重**：通过 `seen` Set 避免重复显示相同命令
