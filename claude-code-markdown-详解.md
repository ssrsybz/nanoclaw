# Claude Code CLI - Markdown 渲染系统详解

本文档详细解释 Claude Code CLI 中 Markdown 输出的完整实现机制。

## 目录

1. [系统架构概览](#系统架构概览)
2. [核心文件说明](#核心文件说明)
3. [Markdown 解析与渲染流程](#markdown-解析与渲染流程)
4. [详细代码解析](#详细代码解析)
5. [表格渲染系统](#表格渲染系统)
6. [流式渲染优化](#流式渲染优化)
7. [ANSI 颜色与样式](#ansi-颜色与样式)

---

## 系统架构概览

```
用户输入/LLM响应
       ↓
   Markdown 文本
       ↓
┌──────────────────┐
│   marked.lexer   │  ← 解析 Markdown 为 Token 数组
└──────────────────┘
       ↓
┌──────────────────┐
│   formatToken    │  ← 将每个 Token 转换为 ANSI 字符串
└──────────────────┘
       ↓
┌──────────────────┐
│  Markdown 组件   │  ← React 组件渲染到终端
└──────────────────┘
       ↓
   终端 ANSI 输出
```

---

## 核心文件说明

| 文件 | 位置 | 功能 |
|------|------|------|
| `markdown.ts` | `utils/` | Markdown 格式化核心，定义所有渲染规则 |
| `Markdown.tsx` | `components/` | React 组件，处理渲染和缓存 |
| `MarkdownTable.tsx` | `components/` | 表格专用渲染组件 |

---

## Markdown 解析与渲染流程

### 1. 解析阶段 (marked.lexer)

使用 `marked` 库将 Markdown 文本解析为 Token 数组：

```typescript
import { marked, type Token, type Tokens } from 'marked';

// 解析 Markdown 文本
const tokens = marked.lexer('# Hello **World**');
// 返回:
// [{ type: 'heading', depth: 1, tokens: [...] }]
```

### 2. 格式化阶段 (formatToken)

将每个 Token 转换为带 ANSI 颜色码的字符串：

```typescript
export function formatToken(
  token: Token,
  theme: ThemeName,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
  highlight: CliHighlight | null = null,
): string
```

### 3. 渲染阶段 (Markdown 组件)

React 组件将格式化后的内容渲染到终端。

---

## 详细代码解析

### 文件: utils/markdown.ts

#### 1. 初始化配置

```typescript
import chalk from 'chalk'
import { marked, type Token, type Tokens } from 'marked'
import stripAnsi from 'strip-ansi'

// 使用 \n 作为换行符（避免 Windows \r\n 问题）
const EOL = '\n'

let markedConfigured = false

export function configureMarked(): void {
  if (markedConfigured) return
  markedConfigured = true

  // 禁用删除线解析 - 模型常用 ~ 表示"约"
  // 例如: ~100 表示大约100
  marked.use({
    tokenizer: {
      del() {
        return undefined  // 不解析 ~~删除线~~
      },
    },
  })
}
```

**说明**:
- `marked` 是一个流行的 Markdown 解析库
- 禁用删除线是因为 `~` 符号常用于表示"大约"（如 ~100ms）
- 使用 `\n` 统一换行符，避免 Windows 兼容问题

#### 2. 主入口函数

```typescript
export function applyMarkdown(
  content: string,
  theme: ThemeName,
  highlight: CliHighlight | null = null,
): string {
  configureMarked()
  return marked
    .lexer(stripPromptXMLTags(content))  // 1. 解析
    .map(_ => formatToken(_, theme, 0, null, null, highlight))  // 2. 格式化
    .join('')  // 3. 合并
    .trim()
}
```

**流程**:
1. `stripPromptXMLTags()` - 移除内部 XML 标签
2. `marked.lexer()` - 解析 Markdown
3. `formatToken()` - 格式化每个 Token
4. `join('')` - 合并为最终字符串

#### 3. Token 格式化函数

```typescript
export function formatToken(
  token: Token,
  theme: ThemeName,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
  highlight: CliHighlight | null = null,
): string {
  switch (token.type) {
    // 各种 token 类型的处理...
  }
}
```

#### 4. 各类型处理详解

##### 4.1 引用块 (blockquote)

```typescript
case 'blockquote': {
  const inner = (token.tokens ?? [])
    .map(_ => formatToken(_, theme, 0, null, null, highlight))
    .join('')

  // 每行添加 │ 前缀
  const bar = chalk.dim(BLOCKQUOTE_BAR)  // '│'
  return inner
    .split(EOL)
    .map(line =>
      stripAnsi(line).trim() ? `${bar} ${chalk.italic(line)}` : line,
    )
    .join(EOL)
}
```

**输出效果**:
```
│ 这是一段引用文字
│ 第二行引用
```

##### 4.2 代码块 (code)

```typescript
case 'code': {
  if (!highlight) {
    return token.text + EOL
  }

  let language = 'plaintext'
  if (token.lang) {
    if (highlight.supportsLanguage(token.lang)) {
      language = token.lang
    } else {
      logForDebugging(
        `Language not supported, falling back to plaintext: ${token.lang}`,
      )
    }
  }
  return highlight.highlight(token.text, { language }) + EOL
}
```

**说明**:
- 支持语法高亮的代码块
- 自动检测语言类型
- 不支持的语言回退到纯文本

##### 4.3 行内代码 (codespan)

```typescript
case 'codespan': {
  // inline code: `code`
  return color('permission', theme)(token.text)
}
```

**说明**:
- 行内代码使用特定颜色高亮
- 颜色由主题系统决定

##### 4.4 斜体和粗体

```typescript
case 'em':
  return chalk.italic(
    (token.tokens ?? [])
      .map(_ => formatToken(_, theme, 0, null, parent, highlight))
      .join(''),
  )

case 'strong':
  return chalk.bold(
    (token.tokens ?? [])
      .map(_ => formatToken(_, theme, 0, null, parent, highlight))
      .join(''),
  )
```

##### 4.5 标题 (heading)

```typescript
case 'heading':
  switch (token.depth) {
    case 1: // h1 - 粗体+斜体+下划线
      return (
        chalk.bold.italic.underline(
          (token.tokens ?? [])
            .map(_ => formatToken(_, theme, 0, null, null, highlight))
            .join(''),
        ) +
        EOL +
        EOL
      )
    case 2: // h2 - 粗体
      return (
        chalk.bold(
          (token.tokens ?? [])
            .map(_ => formatToken(_, theme, 0, null, null, highlight))
            .join(''),
        ) +
        EOL +
        EOL
      )
    default: // h3+ - 粗体
      return (
        chalk.bold(
          (token.tokens ?? [])
            .map(_ => formatToken(_, theme, 0, null, null, highlight))
            .join(''),
        ) +
        EOL +
        EOL
      )
  }
```

**输出效果**:
```
H1 标题 (粗体+斜体+下划线)

H2 标题 (粗体)

H3+ 标题 (粗体)
```

##### 4.6 链接 (link)

```typescript
case 'link': {
  // mailto 链接特殊处理
  if (token.href.startsWith('mailto:')) {
    const email = token.href.replace(/^mailto:/, '')
    return email
  }

  // 提取链接文本
  const linkText = (token.tokens ?? [])
    .map(_ => formatToken(_, theme, 0, null, token, highlight))
    .join('')
  const plainLinkText = stripAnsi(linkText)

  // 有意义的显示文本 - 显示为可点击链接
  if (plainLinkText && plainLinkText !== token.href) {
    return createHyperlink(token.href, linkText)
  }

  // URL 作为显示文本
  return createHyperlink(token.href)
}
```

**说明**:
- `createHyperlink()` 创建 OSC 8 超链接
- 在支持的终端中，用户可以点击链接

##### 4.7 列表 (list / list_item)

```typescript
case 'list': {
  return token.items
    .map((_: Token, index: number) =>
      formatToken(
        _,
        theme,
        listDepth,
        token.ordered ? token.start + index : null,  // 有序编号
        token,
        highlight,
      ),
    )
    .join('')
}

case 'list_item':
  return (token.tokens ?? [])
    .map(
      _ =>
        `${'  '.repeat(listDepth)}${formatToken(_, theme, listDepth + 1, orderedListNumber, token, highlight)}`,
    )
    .join('')

case 'text':
  if (parent?.type === 'list_item') {
    return `${orderedListNumber === null ? '-' : getListNumber(listDepth, orderedListNumber) + '.'} ${token.tokens ? token.tokens.map(_ => formatToken(_, theme, listDepth, orderedListNumber, token, highlight)).join('') : linkifyIssueReferences(token.text)}${EOL}`
  }
  return linkifyIssueReferences(token.text)
```

##### 4.8 列表编号系统

```typescript
// 数字转字母 (1 → a, 27 → aa)
function numberToLetter(n: number): string {
  let result = ''
  while (n > 0) {
    n--
    result = String.fromCharCode(97 + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}

// 数字转罗马数字 (1 → i, 4 → iv)
function numberToRoman(n: number): string {
  let result = ''
  for (const [value, numeral] of ROMAN_VALUES) {
    while (n >= value) {
      result += numeral
      n -= value
    }
  }
  return result
}

// 根据嵌套层级选择编号样式
function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString()  // 1, 2, 3
    case 2:
      return numberToLetter(orderedListNumber)  // a, b, c
    case 3:
      return numberToRoman(orderedListNumber)  // i, ii, iii
    default:
      return orderedListNumber.toString()
  }
}
```

**输出效果**:
```
1. 第一层
   a. 第二层
      i. 第三层
      ii. 第三层
   b. 第二层
2. 第一层
```

##### 4.9 表格 (table)

```typescript
case 'table': {
  const tableToken = token as Tokens.Table

  // 计算每列宽度
  const columnWidths = tableToken.header.map((header, index) => {
    let maxWidth = stringWidth(getDisplayText(header.tokens))
    for (const row of tableToken.rows) {
      const cellLength = stringWidth(getDisplayText(row[index]?.tokens))
      maxWidth = Math.max(maxWidth, cellLength)
    }
    return Math.max(maxWidth, 3)  // 最小宽度 3
  })

  // 格式化表头
  let tableOutput = '| '
  tableToken.header.forEach((header, index) => {
    const content = header.tokens?.map(_ => formatToken(_, theme, 0, null, null, highlight)).join('') ?? ''
    const displayText = getDisplayText(header.tokens)
    const width = columnWidths[index]!
    const align = tableToken.align?.[index]
    tableOutput += padAligned(content, stringWidth(displayText), width, align) + ' | '
  })
  tableOutput = tableOutput.trimEnd() + EOL

  // 添加分隔线
  tableOutput += '|'
  columnWidths.forEach(width => {
    const separator = '-'.repeat(width + 2)
    tableOutput += separator + '|'
  })
  tableOutput += EOL

  // 格式化数据行
  tableToken.rows.forEach(row => {
    tableOutput += '| '
    row.forEach((cell, index) => {
      const content = cell.tokens?.map(_ => formatToken(_, theme, 0, null, null, highlight)).join('') ?? ''
      const displayText = getDisplayText(cell.tokens)
      const width = columnWidths[index]!
      const align = tableToken.align?.[index]
      tableOutput += padAligned(content, stringWidth(displayText), width, align) + ' | '
    })
    tableOutput = tableOutput.trimEnd() + EOL
  })

  return tableOutput + EOL
}
```

##### 4.10 GitHub Issue 链接化

```typescript
// 匹配 owner/repo#123 格式
const ISSUE_REF_PATTERN =
  /(^|[^\w./-])([A-Za-z0-9][\w-]*\/[A-Za-z0-9][\w.-]*)#(\d+)\b/g

function linkifyIssueReferences(text: string): string {
  if (!supportsHyperlinks()) {
    return text
  }
  return text.replace(
    ISSUE_REF_PATTERN,
    (_match, prefix, repo, num) =>
      prefix +
      createHyperlink(
        `https://github.com/${repo}/issues/${num}`,
        `${repo}#${num}`,
      ),
  )
}
```

**说明**:
- 自动将 `owner/repo#123` 转换为可点击链接
- 例如: `facebook/react#123` → 链接到 GitHub issue

##### 4.11 对齐填充

```typescript
export function padAligned(
  content: string,
  displayWidth: number,
  targetWidth: number,
  align: 'left' | 'center' | 'right' | null | undefined,
): string {
  const padding = Math.max(0, targetWidth - displayWidth)

  if (align === 'center') {
    const leftPad = Math.floor(padding / 2)
    return ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad)
  }
  if (align === 'right') {
    return ' '.repeat(padding) + content
  }
  return content + ' '.repeat(padding)  // 默认左对齐
}
```

---

## 表格渲染系统

### 文件: components/MarkdownTable.tsx

表格渲染是一个复杂的子系统，需要处理：
1. 终端宽度限制
2. 列宽计算
3. 文本换行
4. 多行单元格对齐

#### 1. 核心常量

```typescript
// 安全边距，防止表格溢出
const SAFETY_MARGIN = 4

// 最小列宽，防止极端布局
const MIN_COLUMN_WIDTH = 3

// 最大行高，超过则切换到垂直格式
const MAX_ROW_LINES = 4

// ANSI 粗体转义码
const ANSI_BOLD_START = '\x1b[1m'
const ANSI_BOLD_END = '\x1b[22m'
```

#### 2. 文本换行

```typescript
function wrapText(text: string, width: number, options?: {
  hard?: boolean;
}): string[] {
  if (width <= 0) return [text]

  const trimmedText = text.trimEnd()
  const wrapped = wrapAnsi(trimmedText, width, {
    hard: options?.hard ?? false,  // 是否强制断词
    trim: false,
    wordWrap: true
  })

  // 过滤空行
  const lines = wrapped.split('\n').filter(line => line.length > 0)
  return lines.length > 0 ? lines : ['']
}
```

#### 3. 列宽计算

```typescript
// 计算最小宽度（最长单词）
function getMinWidth(tokens: Token[] | undefined): number {
  const text = getPlainText(tokens)
  const words = text.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return MIN_COLUMN_WIDTH
  return Math.max(...words.map(w => stringWidth(w)), MIN_COLUMN_WIDTH)
}

// 计算理想宽度（完整内容）
function getIdealWidth(tokens: Token[] | undefined): number {
  return Math.max(stringWidth(getPlainText(tokens)), MIN_COLUMN_WIDTH)
}
```

#### 4. 宽度分配算法

```typescript
// 可用空间
const availableWidth = Math.max(
  terminalWidth - borderOverhead - SAFETY_MARGIN,
  numCols * MIN_COLUMN_WIDTH
)

// 三种情况
if (totalIdeal <= availableWidth) {
  // 情况1: 内容完全适配 - 使用理想宽度
  columnWidths = idealWidths
} else if (totalMin <= availableWidth) {
  // 情况2: 需要压缩 - 按比例分配
  const extraSpace = availableWidth - totalMin
  const overflows = idealWidths.map((ideal, i) => ideal - minWidths[i])
  const totalOverflow = overflows.reduce((sum, o) => sum + o, 0)
  columnWidths = minWidths.map((min, i) => {
    const extra = Math.floor(overflows[i] / totalOverflow * extraSpace)
    return min + extra
  })
} else {
  // 情况3: 空间不足 - 强制压缩，允许断词
  needsHardWrap = true
  const scaleFactor = availableWidth / totalMin
  columnWidths = minWidths.map(w =>
    Math.max(Math.floor(w * scaleFactor), MIN_COLUMN_WIDTH)
  )
}
```

#### 5. 行渲染

```typescript
function renderRowLines(
  cells: Array<{ tokens?: Token[] }>,
  isHeader: boolean
): string[] {
  // 获取每个单元格的换行文本
  const cellLines = cells.map((cell, colIndex) => {
    const formattedText = formatCell(cell.tokens)
    const width = columnWidths[colIndex]
    return wrapText(formattedText, width, { hard: needsHardWrap })
  })

  // 找到最大行数
  const maxLines = Math.max(...cellLines.map(lines => lines.length), 1)

  // 计算垂直偏移（居中对齐）
  const verticalOffsets = cellLines.map(lines =>
    Math.floor((maxLines - lines.length) / 2)
  )

  // 构建每一行
  const result: string[] = []
  for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
    let line = '│'
    for (let colIndex = 0; colIndex < cells.length; colIndex++) {
      const lines = cellLines[colIndex]
      const offset = verticalOffsets[colIndex]
      const contentLineIdx = lineIdx - offset
      const lineText = contentLineIdx >= 0 && contentLineIdx < lines.length
        ? lines[contentLineIdx]
        : ''
      const width = columnWidths[colIndex]
      const align = isHeader ? 'center' : token.align?.[colIndex] ?? 'left'
      line += ' ' + padAligned(lineText, stringWidth(lineText), width, align) + ' │'
    }
    result.push(line)
  }
  return result
}
```

#### 6. 边框渲染

```typescript
function renderBorderLine(type: 'top' | 'middle' | 'bottom'): string {
  const [left, mid, cross, right] = {
    top: ['┌', '─', '┬', '┐'],
    middle: ['├', '─', '┼', '┤'],
    bottom: ['└', '─', '┴', '┘']
  }[type]

  let line = left
  columnWidths.forEach((width, colIndex) => {
    line += mid.repeat(width + 2)
    line += colIndex < columnWidths.length - 1 ? cross : right
  })
  return line
}
```

**输出效果**:
```
┌─────────────┬─────────────┐
│   Header 1  │   Header 2  │
├─────────────┼─────────────┤
│   Cell 1    │   Cell 2    │
│   Line 2    │             │
├─────────────┼─────────────┤
│   Cell 3    │   Cell 4    │
└─────────────┴─────────────┘
```

#### 7. 垂直格式（窄终端）

```typescript
function renderVerticalFormat(): string {
  const lines: string[] = []
  const headers = token.header.map(h => getPlainText(h.tokens))
  const separator = '─'.repeat(Math.min(terminalWidth - 1, 40))
  const wrapIndent = '  '

  token.rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      lines.push(separator)
    }
    row.forEach((cell, colIndex) => {
      const label = headers[colIndex] || `Column ${colIndex + 1}`
      const value = formatCell(cell.tokens)
        .trimEnd()
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      // 第一行：粗体标签 + 值
      lines.push(`${ANSI_BOLD_START}${label}:${ANSI_BOLD_END} ${value}`)
    })
  })

  return lines.join('\n')
}
```

**输出效果** (窄终端):
```
────────────────────────
Name: John Doe
Age: 30
City: New York
────────────────────────
Name: Jane Smith
Age: 25
City: Los Angeles
```

---

## 流式渲染优化

### 文件: components/Markdown.tsx

#### 1. Token 缓存

```typescript
// 模块级 Token 缓存
const TOKEN_CACHE_MAX = 500
const tokenCache = new Map<string, Token[]>()
```

**说明**:
- `marked.lexer()` 解析约需 3ms
- 缓存避免重复解析相同内容
- LRU 策略，最多 500 条

#### 2. 快速路径检测

```typescript
// Markdown 语法检测正则
const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /

function hasMarkdownSyntax(s: string): boolean {
  // 只检测前 500 个字符
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s)
}

function cachedLexer(content: string): Token[] {
  // 快速路径：无 Markdown 语法 - 跳过解析
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: 'paragraph',
      raw: content,
      text: content,
      tokens: [{ type: 'text', raw: content, text: content }]
    }]
  }

  // 使用缓存
  const key = hashContent(content)
  const hit = tokenCache.get(key)
  if (hit) {
    // LRU: 移到最近使用
    tokenCache.delete(key)
    tokenCache.set(key, hit)
    return hit
  }

  // 解析并缓存
  const tokens = marked.lexer(content)
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value
    if (first !== undefined) tokenCache.delete(first)
  }
  tokenCache.set(key, tokens)
  return tokens
}
```

#### 3. 流式渲染组件

```typescript
export function StreamingMarkdown({ children }: StreamingProps): React.ReactNode {
  'use no memo'  // 禁用 React Compiler 优化

  configureMarked()

  const stripped = stripPromptXMLTags(children)
  const stablePrefixRef = useRef('')

  // 重置检测
  if (!stripped.startsWith(stablePrefixRef.current)) {
    stablePrefixRef.current = ''
  }

  // 只解析新增部分
  const boundary = stablePrefixRef.current.length
  const tokens = marked.lexer(stripped.substring(boundary))

  // 找到最后一个非空 token
  let lastContentIdx = tokens.length - 1
  while (lastContentIdx >= 0 && tokens[lastContentIdx].type === 'space') {
    lastContentIdx--
  }

  // 计算稳定前缀
  let advance = 0
  for (let i = 0; i < lastContentIdx; i++) {
    advance += tokens[i].raw.length
  }
  if (advance > 0) {
    stablePrefixRef.current = stripped.substring(0, boundary + advance)
  }

  const stablePrefix = stablePrefixRef.current
  const unstableSuffix = stripped.substring(stablePrefix.length)

  // 分别渲染稳定部分和不稳定部分
  return (
    <Box flexDirection="column" gap={1}>
      {stablePrefix && <Markdown>{stablePrefix}</Markdown>}
      {unstableSuffix && <Markdown>{unstableSuffix}</Markdown>}
    </Box>
  )
}
```

**优化原理**:
- 将流式内容分为"稳定前缀"和"不稳定后缀"
- 稳定部分只解析一次，缓存结果
- 不稳定部分每次重新解析
- 大幅减少解析次数

---

## ANSI 颜色与样式

### chalk 库

使用 `chalk` 库生成 ANSI 转义码：

```typescript
import chalk from 'chalk'

// 基础样式
chalk.bold('粗体')        // \x1b[1m粗体\x1b[22m
chalk.italic('斜体')      // \x1b[3m斜体\x1b[23m
chalk.underline('下划线') // \x1b[4m下划线\x1b[24m
chalk.dim('暗淡')         // \x1b[2m暗淡\x1b[22m

// 组合样式
chalk.bold.italic.underline('组合')

// 颜色
chalk.red('红色')
chalk.green('绿色')
chalk.blue('蓝色')
```

### OSC 8 超链接

```typescript
function createHyperlink(url: string, text?: string): string {
  if (!supportsHyperlinks()) {
    return text ?? url
  }
  // OSC 8 格式: \x1b]8;;URL\x1b\\TEXT\x1b]8;;\x1b\\
  return `\x1b]8;;${url}\x1b\\${text ?? url}\x1b]8;;\x1b\\`
}
```

**支持的终端**:
- iTerm2
- Windows Terminal
- VSCode 终端
- Kitty
- WezTerm

---

## 总结

Claude Code CLI 的 Markdown 渲染系统是一个完整的解决方案：

1. **解析**: 使用 `marked` 库解析 Markdown
2. **格式化**: 将 Token 转换为 ANSI 字符串
3. **渲染**: React 组件渲染到终端
4. **优化**: Token 缓存、快速路径检测、流式渲染
5. **表格**: 自适应宽度、多行单元格、垂直格式备选
6. **链接**: OSC 8 超链接、GitHub Issue 自动链接化

这套系统确保了 Markdown 内容在终端中以最佳方式呈现。
