# 流式消息完整展示 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前端完整展示 Agent 调用过程中的所有信息（思考过程、工具调用、工具结果），消除"好像没调用 Claude"的用户体验问题。

**Architecture:** 后端新增 `stream_start`/`stream_end` 事件来标记一次 Agent 调用的生命周期；前端将所有流式事件（assistant、thinking、tool_use、tool_result）聚合到同一个"助手回合"消息气泡中，按顺序完整渲染。每个 `tool_use` 显示为可折叠的工具调用卡片，包含工具名和参数。

**Tech Stack:** TypeScript, React, Zustand, WebSocket

---

## 问题清单

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | 每次 `assistant` 事件都创建新消息 | `App.tsx:73-75` | 消息碎片化，一个回合出现多个气泡 |
| 2 | `tool_use` part 不渲染 | `AssistantChat.tsx:82-157` | 用户看不到 Claude 在调用什么工具 |
| 3 | `tool_result` 被转为纯 text 混入正文 | `App.tsx:89-92` | 工具输出与助手文本混在一起 |
| 4 | 没有 `stream_start`/`stream_end` 事件 | 后端从未发送 | 前端无法知道回合边界，typing 状态可能卡住 |
| 5 | 最终 `result` 被静默丢弃 | `index.ts:337-338` | 最终汇总可能丢失 |
| 6 | 每个 assistant 文本块都单独持久化到 DB | `web.ts:789-806` | 数据库中一个回合产生多条 assistant 记录 |
| 7 | store 中没有 `ToolResultPart` 类型 | `store.ts:45` | tool_result 语义信息丢失 |

## 文件结构

| 文件 | 变更类型 | 职责 |
|------|----------|------|
| `src/agent-runner.ts` | 修改 | 从 `user` 消息中提取 `tool_result` content parts 并流式转发 |
| `src/index.ts` | 修改 | 在 Agent 调用开始/结束时发送 `stream_start`/`stream_end` 事件；转发 `tool_result` |
| `src/channels/web.ts` | 修改 | 改为在 `stream_end` 时持久化完整消息（含 parts），而非逐条持久化 assistant |
| `web/src/store.ts` | 修改 | 新增 `ToolResultPart` 类型；新增 `startAssistantTurn`/`finishAssistantTurn` 方法；历史消息加载时标记 `_turnComplete` |
| `web/src/App.tsx` | 修改 | 重写 WebSocket 消息分发：stream_start 创建容器，assistant 追加 part，stream_end 完成回合 |
| `web/src/components/AssistantChat.tsx` | 修改 | 新增 `ToolUseCard`、`ToolResultCard`、`ThinkingBlock` 组件，按 parts 顺序渲染完整内容 |

---

### Task 1: 后端 — 新增 stream_start/stream_end 生命周期事件

**Files:**
- Modify: `src/index.ts:290-365`

- [ ] **Step 1: 在 Agent 调用开始时发送 stream_start**

在 `index.ts` 的 `handleMessage` 函数中，`runAgent` 调用之前，通过 channel 发送 `stream_start` 事件：

```typescript
// 在 runAgent 调用之前（约 line 294）
if (channel.sendStructured) {
  await channel.sendStructured(chatJid, {
    type: 'stream_start',
    workspaceId: workspaceId ?? null,
    conversationId: conversationId ?? null,
  });
}
```

- [ ] **Step 2: 在 Agent 调用结束后发送 stream_end**

在 `runAgent` 回调结束后、`setTyping(false)` 之前（约 line 367），发送 `stream_end`：

```typescript
// 在 setTyping(false) 之前
if (channel.sendStructured) {
  await channel.sendStructured(chatJid, {
    type: 'stream_end',
    workspaceId: workspaceId ?? null,
    conversationId: conversationId ?? null,
  });
}
await channel.setTyping?.(chatJid, false);
```

- [ ] **Step 3: 修复 result 丢弃逻辑**

将 `index.ts:337-338` 的 early return 改为只在流式模式下跳过：

```typescript
// 修改前:
if (streamingSent) return;

// 修改后: 删除这行，让 result 也通过，但避免与流式 assistant 文本重复
```

实际上 result 中的文本通常和流式 assistant 文本是相同内容（最终回复），所以保留跳过逻辑但增加注释说明原因。result 的价值已在流式 assistant 事件中传递，不需要额外处理。**这一步保持原样不变。**

- [ ] **Step 4: 验证后端编译通过**

Run: `cd /Users/h3glove/projeck/nanoclaw && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add stream_start/stream_end events to agent lifecycle"
```

---

### Task 1.5: 后端 — 从 SDK user 消息中提取 tool_result 并流式转发

**Files:**
- Modify: `src/agent-runner.ts:654-655`（在 assistant 处理块之后、system init 之前）
- Modify: `src/index.ts:304-334`（在 onOutput 回调中新增 tool_result 分支）

**背景：** Claude Agent SDK 的流式事件中，`tool_use` 出现在 `message.type === 'assistant'` 的 content parts 里，但工具执行结果出现在下一条 `message.type === 'user'` 消息的 content parts 中（`part.type === 'tool_result'`）。当前 `agent-runner.ts` 完全忽略了 user 消息，导致工具结果信息从未被转发到前端。

- [ ] **Step 1: 在 agent-runner.ts 中提取 user 消息的 tool_result parts**

在 `agent-runner.ts` 约 line 654（assistant 消息处理结束的 `}` 之后），添加 user 消息中 tool_result 的提取逻辑：

```typescript
// 处理 user 消息中的 tool_result parts（SDK 将工具执行结果放在 user 消息中）
if (message.type === 'user' && onOutput) {
  const userMsg = message as unknown as {
    message?: {
      content?: Array<{
        type: string;
        tool_use_id?: string;
        content?: string | Array<{ type: string; text?: string }>;
      }>;
    };
  };
  if (userMsg.message?.content) {
    for (const part of userMsg.message.content) {
      if (part.type === 'tool_result') {
        // tool_result 的 content 可能是 string 或 content block array
        let text = '';
        if (typeof part.content === 'string') {
          text = part.content;
        } else if (Array.isArray(part.content)) {
          text = part.content
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { text?: string }) => b.text || '')
            .join('');
        }
        if (text) {
          await onOutput({
            status: 'success',
            result: null,
            newSessionId,
            streamType: 'tool_result',
            streamData: { toolOutput: text },
          });
        }
      }
    }
  }
}
```

- [ ] **Step 2: 扩展 AgentOutput 类型支持 tool_result streamType**

检查 `src/agent-runner.ts` 或 `src/types.ts` 中 `AgentOutput` 接口的 `streamType` 和 `streamData` 定义，确保支持 `tool_result`：

```typescript
// 在 streamData 类型中添加:
toolOutput?: string;

// streamType 已在 types.ts 的 StreamMessage 中定义了 'tool_result'
```

- [ ] **Step 3: 在 index.ts 的 onOutput 回调中转发 tool_result**

在 `src/index.ts` 约 line 333（`tool_use` 分支之后），添加 `tool_result` 分支：

```typescript
} else if (result.streamType === 'tool_result' && result.streamData?.toolOutput) {
  await channel.sendStructured(chatJid, {
    type: 'tool_result',
    content: result.streamData.toolOutput,
    workspaceId: workspaceId ?? null,
    conversationId: conversationId ?? null,
  });
}
```

- [ ] **Step 4: 验证后端编译通过**

Run: `cd /Users/h3glove/projeck/nanoclaw && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/agent-runner.ts src/index.ts
git commit -m "feat: extract tool_result from SDK user messages and stream to frontend"
```

---

### Task 2: 后端 — 改为 stream_end 时持久化完整消息

**Files:**
- Modify: `src/channels/web.ts:788-806`
- Modify: `web/src/App.tsx`（在 stream_end handler 中添加 REST 持久化）

**背景：** 当前每个 `assistant` 流式块都单独持久化一条 DB 记录，且不包含 parts。这导致历史消息无法还原工具调用信息。改为：删除逐条持久化，改为前端在收到 `stream_end` 时一次性持久化完整的助手消息（含所有 parts）。

- [ ] **Step 1: 删除 web.ts 中对每个 assistant 消息的逐条持久化**

将 `web.ts:789-806` 中的 `if (conversationId && data.type === 'assistant' && data.content)` 块删除。流式 assistant 消息只通过 WebSocket 转发，不再逐条写入 DB。

- [ ] **Step 2: 前端在 stream_end 时持久化完整消息**

在 `App.tsx` 的 `stream_end` case 中，将完整的 assistant 消息（含 parts）通过 REST API 持久化：

```typescript
case 'stream_end': {
  setTyping(false);
  finishAssistantTurn(conversationId);
  // 持久化完整的助手回合（含 parts）
  const currentMsgs = useStore.getState().messages[conversationId] || [];
  const lastAssistant = [...currentMsgs].reverse().find(m => m.role === 'assistant');
  if (lastAssistant && activeWorkspaceIdRef.current) {
    try {
      await fetch(`/api/workspaces/${activeWorkspaceIdRef.current}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: lastAssistant.content,
          parts: lastAssistant.parts,
        }),
      });
    } catch (err) {
      console.error('Failed to persist assistant turn:', err);
    }
  }
  break;
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /Users/h3glove/projeck/nanoclaw && npm run build`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/channels/web.ts web/src/App.tsx
git commit -m "refactor: persist complete assistant turn with parts on stream_end"
```

---

### Task 3: 前端 — 扩展 Store 类型和方法

**Files:**
- Modify: `web/src/store.ts`

- [ ] **Step 1: 新增 ToolResultPart 类型**

在 `store.ts:39-45` 中，`ContentPart` 联合类型增加 `ToolResultPart`：

```typescript
export interface ToolResultPart {
  type: 'tool_result';
  content: string;
  toolUseId?: string;
}

export type ContentPart = TextPart | ThinkingPart | ToolUsePart | ToolResultPart;
```

- [ ] **Step 2: 新增 startAssistantTurn 方法**

在 `store.ts` 的 `WorkspaceStore` interface 和实现中新增方法：

```typescript
// Interface 中新增:
startAssistantTurn: (conversationId: string) => void;
```

实现逻辑：创建一条空的 assistant 消息（role='assistant', content='', parts=[]），作为当前回合的容器。如果最后一条消息已经是 assistant 且没有收到过 stream_end，则复用它而不是新建。

```typescript
startAssistantTurn: (conversationId: string) =>
  set((state) => {
    const msgs = state.messages[conversationId] || [];
    // 如果最后一条是 assistant 且是当前回合（还没收到 stream_end），复用
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
      return state; // 复用现有的
    }
    // 否则创建新的空 assistant 消息
    return {
      messages: {
        ...state.messages,
        [conversationId]: [
          ...msgs,
          { role: 'assistant' as const, content: '', parts: [] as ContentPart[] },
        ],
      },
    };
  }),
```

注意：需要在 `ChatMessage` 接口中新增一个内部标记 `_turnComplete`（不序列化）来标记回合是否结束。用下划线前缀表示这是内部状态。

- [ ] **Step 3: 修改 ChatMessage 接口**

```typescript
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: ContentPart[];
  attachment?: AttachmentInfo;
  /** Internal: marks if this assistant turn is complete (received stream_end) */
  _turnComplete?: boolean;
}
```

- [ ] **Step 4: 修复历史消息加载 — 标记 _turnComplete**

在 `switchConversation` 加载历史消息时，所有消息都应标记为 `_turnComplete: true`，避免 `startAssistantTurn` 错误复用旧消息：

```typescript
// 修改 switchConversation 中的 set 调用（约 line 301-313）
set((state) => ({
  messages: {
    ...state.messages,
    [conversationId]: data.messages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts,
      attachment: m.attachment,
      _turnComplete: true, // 历史消息始终标记为已完成
    })),
  },
}));
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd /Users/h3glove/projeck/nanoclaw/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add web/src/store.ts
git commit -m "feat: add ToolResultPart type and startAssistantTurn to store"
```

---

### Task 4: 前端 — 重写 WebSocket 消息分发逻辑

**Files:**
- Modify: `web/src/App.tsx:48-97`

- [ ] **Step 1: 重写 onmessage handler**

核心改变：`stream_start` 创建回合容器，`assistant` 第一次用 `appendMessage`，后续用 `appendPart`，`stream_end` 标记回合完成。

```typescript
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    const conversationId = data.conversationId || activeConversationIdRef.current;
    if (!conversationId) return;

    switch (data.type) {
      case 'connected':
        setConnected(true);
        break;

      case 'typing':
        setTyping(true);
        break;

      case 'stream_start':
        // Agent 开始工作，创建空的助手回合容器
        setTyping(true);
        startAssistantTurn(conversationId);
        break;

      case 'assistant': {
        setTyping(false);
        // 检查是否已有进行中的 assistant 回合
        const msgs = useStore.getState().messages[conversationId] || [];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
          // 追加到现有回合
          appendPart(conversationId, { type: 'text', text: data.content });
        } else {
          // 创建新回合（兼容无 stream_start 的情况）
          appendMessage(conversationId, {
            role: 'assistant',
            content: data.content,
            parts: [{ type: 'text', text: data.content }],
          });
        }
        break;
      }

      case 'thinking':
        appendPart(conversationId, { type: 'thinking', text: data.content });
        break;

      case 'tool_use':
        appendPart(conversationId, { type: 'tool_use', toolName: data.toolName, toolInput: data.toolInput });
        break;

      case 'tool_result':
        if (data.content) {
          appendPart(conversationId, { type: 'tool_result', content: data.content });
        }
        break;

      case 'stream_end': {
        setTyping(false);
        // 标记回合完成
        const msgs = useStore.getState().messages[conversationId] || [];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
          // 更新 _turnComplete 标记
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: [
                ...msgs.slice(0, -1),
                { ...lastMsg, _turnComplete: true },
              ],
            },
          }));
        }
        break;
      }

      // Legacy fallback
      case 'message':
        if (data.content) {
          setTyping(false);
          appendMessage(conversationId, { role: 'assistant', content: data.content });
        }
        break;
    }
  } catch {
    // ignore non-JSON messages
  }
};
```

注意：需要从 store 中解构新增的 `startAssistantTurn` 方法。另外 `stream_end` case 中需要直接调用 `set`（Zustand 内部方法），但由于我们在组件中，应该通过 store action 来做。新增一个 `finishAssistantTurn` action。

- [ ] **Step 2: 在 store 中新增 finishAssistantTurn**

在 `store.ts` 中：

```typescript
// Interface:
finishAssistantTurn: (conversationId: string) => void;

// Implementation:
finishAssistantTurn: (conversationId: string) =>
  set((state) => {
    const msgs = state.messages[conversationId] || [];
    if (msgs.length === 0) return state;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs.slice(0, -1),
            { ...lastMsg, _turnComplete: true },
          ],
        },
      };
    }
    return state;
  }),
```

- [ ] **Step 3: 更新 App.tsx 中的 store 解构**

```typescript
const {
  fetchWorkspaces,
  switchWorkspace,
  setConnected,
  setTyping,
  appendMessage,
  appendPart,
  startAssistantTurn,
  finishAssistantTurn,
  activeWorkspaceId,
  activeConversationId,
} = useStore();
```

- [ ] **Step 4: 简化 stream_end handler**

用 `finishAssistantTurn` 替代直接操作 state：

```typescript
case 'stream_end':
  setTyping(false);
  finishAssistantTurn(conversationId);
  break;
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `cd /Users/h3glove/projeck/nanoclaw/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/store.ts
git commit -m "feat: rewrite WebSocket message dispatch with turn-based aggregation"
```

---

### Task 5: 前端 — 渲染 tool_use 和 tool_result 内容

**Files:**
- Modify: `web/src/components/AssistantChat.tsx:82-158`

- [ ] **Step 1: 新增 ToolUseCard 组件**

在 `AssistantChat.tsx` 中新增一个可折叠的工具调用卡片组件：

```tsx
function ToolUseCard({ toolName, toolInput }: { toolName: string; toolInput?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono font-medium">{toolName}</span>
        <span className="text-white/30 ml-auto">tool call</span>
      </button>
      {open && toolInput && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap font-mono bg-[#0f0f1a] rounded p-2 max-h-60 overflow-auto">
            {toolInput}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 新增 ToolResultCard 组件**

```tsx
function ToolResultCard({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
  return (
    <div className="my-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400/80 hover:text-emerald-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>tool result</span>
        <span className="text-white/30 ml-auto">{content.length} chars</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap font-mono bg-[#0f0f1a] rounded p-2 max-h-60 overflow-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 重写 AssistantMessage 组件的渲染逻辑**

将当前的"先展示 thinking，再展示 Markdown content"改为"按 parts 顺序逐一渲染"。核心变化：

```tsx
function AssistantMessage({ content, parts }: { content: string; parts?: ContentPart[] }) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // 如果没有 parts（旧消息兼容），直接渲染 content
  if (!parts || parts.length === 0) {
    return (
      <div className="flex justify-start">
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#16213e] text-white/90 text-sm border border-white/5 max-w-[85%]">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // 按 parts 顺序渲染，将连续的 text parts 合并后统一用 Markdown 渲染
  const renderedParts: React.ReactNode[] = [];
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      renderedParts.push(
        <div key={`text-${renderedParts.length}`} className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#16213e] text-white/90 text-sm border border-white/5">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {textBuffer}
            </ReactMarkdown>
          </div>
        </div>
      );
      textBuffer = '';
    }
  };

  for (const part of parts) {
    if (part.type === 'text') {
      textBuffer += part.text;
    } else if (part.type === 'thinking') {
      flushText();
      renderedParts.push(
        <ThinkingBlock key={`think-${renderedParts.length}`} text={part.text} />
      );
    } else if (part.type === 'tool_use') {
      flushText();
      renderedParts.push(
        <ToolUseCard key={`tool-${renderedParts.length}`} toolName={part.toolName} toolInput={part.toolInput} />
      );
    } else if (part.type === 'tool_result') {
      flushText();
      renderedParts.push(
        <ToolResultCard key={`result-${renderedParts.length}`} content={part.content} />
      );
    }
  }
  flushText();

  return (
    <div className="flex justify-start group/message">
      <div className="flex flex-col gap-1 max-w-[85%]">
        {renderedParts}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 提取 ThinkingBlock 子组件**

将现有的 thinking 折叠逻辑提取为独立组件：

```tsx
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-indigo-400/70 hover:text-indigo-400 transition-colors px-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {open ? '隐藏思考过程' : '思考过程'}
      </button>
      {open && (
        <div className="px-4 py-3 rounded-xl bg-[#0f0f1a] border border-indigo-500/20 text-white/50 text-xs space-y-2">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: 提取 markdownComponents 为常量**

将 ReactMarkdown 的 components prop 提取为组件外部常量，避免每次渲染重新创建：

```tsx
const markdownComponents = {
  code(props: any) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const inline = !match;
    return inline ? (
      <code className="bg-[#0f0f1a] text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...rest}>
        {children}
      </code>
    ) : (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
        className="!bg-[#0f0f1a] !rounded-lg !my-2 !border !border-white/10"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  a({ href, children }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{children}</a>;
  },
  blockquote({ children }: any) {
    return <blockquote className="border-l-3 border-indigo-500 pl-3 my-2 text-white/60">{children}</blockquote>;
  },
};
```

- [ ] **Step 6: 更新 import**

在 `AssistantChat.tsx` 顶部更新 import，增加 `ToolResultPart`：

```typescript
import { useStore, type ThinkingPart, type ToolUsePart, type ToolResultPart, type ContentPart, type AttachmentInfo } from '../store';
```

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd /Users/h3glove/projeck/nanoclaw/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: Commit**

```bash
git add web/src/components/AssistantChat.tsx
git commit -m "feat: render tool_use and tool_result as collapsible cards in chat"
```

---

### Task 6: 集成验证

**Files:** 无新文件

- [ ] **Step 1: 启动开发环境**

Run: `cd /Users/h3glove/projeck/nanoclaw && npm run dev:all`

- [ ] **Step 2: 在浏览器中验证基本消息流**

打开 `http://localhost:5173`，发送一条简单消息（如"你好"），验证：
- [ ] 收到 `stream_start` 后出现 typing 动画
- [ ] assistant 文本正常显示在一个气泡中
- [ ] 收到 `stream_end` 后 typing 动画消失
- [ ] 只有一个 assistant 消息气泡（不是多个碎片）

- [ ] **Step 3: 验证工具调用显示**

发送一条会触发工具调用的消息（如"当前目录有什么文件"），验证：
- [ ] tool_use 卡片出现，显示工具名称（如 `Bash`）
- [ ] 点击可展开查看工具参数
- [ ] tool_result 卡片出现，显示工具返回内容
- [ ] 最终的 assistant 回复也正常显示
- [ ] 所有内容按顺序排列在一个回合中

- [ ] **Step 4: 验证思考过程显示**

如果模型使用了 extended thinking，验证：
- [ ] thinking 部分显示为可折叠区域
- [ ] 点击可展开查看思考内容

- [ ] **Step 5: 验证向后兼容**

刷新页面加载历史消息，验证：
- [ ] 已有的 assistant 消息（无 parts 或只有 text parts）正常渲染
- [ ] 不会因为新增的 `_turnComplete` 字段导致报错

- [ ] **Step 6: Commit (如有修复)**

---

## 视觉效果参考

修复后的消息渲染顺序：

```
[用户消息]  当前目录有什么文件？

[助手回合 - 单个气泡组]
  ┌─ 💭 思考过程 (可折叠) ─────────────────┐
  │  用户想查看当前目录文件...                  │
  └────────────────────────────────────────┘
  ┌─ 🔧 Bash (可折叠) ──── tool call ─────┐
  │  > ls -la                               │
  └────────────────────────────────────────┘
  ┌─ 📋 tool result (可折叠) ── 847 chars ─┐
  │  total 48                                │
  │  drwxr-xr-x  12 user  staff  384 ...    │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ 当前目录包含以下文件和目录：               │
  │ - src/ (源代码目录)                      │
  │ - web/ (前端目录)                        │
  │ - README.md                             │
  └────────────────────────────────────────┘
```
