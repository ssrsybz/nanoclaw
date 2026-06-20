# OKClaw 桌面端打包（desktop/）

本目录自成一体，负责把 OKClaw（Node 后端 + Web 前端）打包成 **macOS 桌面应用**（Electron 外壳），产出**完全离线自包含**的 `.pkg` / `.dmg` 安装包。整个打包流程都在这里，与主项目 `src/`、`web/` 解耦，便于后续持续优化。

## 设计要点

- **Electron 薄壳 + Node 子进程**：主进程只开窗口，后端以独立 Node 子进程运行（`ELECTRON_RUN_AS_NODE=1` 复用 Electron 自带 Node）。这样 `better-sqlite3` 等原生模块跑在真正的 Node 环境里，**绕开 Electron 的 Node ABI 不匹配问题**（上次打包失败的主因之一）。后端代码零改动。
- **完全离线**：所有依赖、`node_modules`、前端产物、Node 运行时、Claude Agent SDK 的 `cli.js` 全部打进安装包。目标机无需联网 `npm install`。
- **Claude CLI 自带**：AI 核心用的是 SDK 包内的 `cli.js`，主进程生成一个 shim 指向它，不依赖系统安装的 `claude`。
- **数据隔离**：后端一切基于 `process.cwd()`，主进程把 `cwd` 指向 `~/Library/Application Support/OKClaw`（可写），首运行把 `store/public`、`skills`、data 骨架、`.env` 模板 seed 进去。代码留只读 `Resources/`。
- **密钥安全**：真实 `.env` 绝不打包；分发包只带空 `.env.template`，首次启动后在应用内「设置」页填 API Key。
- **无需 Apple 审核**：`.pkg` 不签名/不公证，首次打开需右键→Open 绕过 Gatekeeper（已接受）。

## 目录结构

```
desktop/
  package.json     # electron + electron-builder，含全部 build 配置
  main.cjs         # 主进程（spawn 后端、窗口、健康检查、seeding、shim、tree-kill）
  preload.cjs      # 渲染层桥（当前最小占位）
  icon.icns        # 应用图标
  build.sh         # 自包含构建脚本
  README.md        # 本文件
  seed/
    .env.template          # 空配置模板（无密钥）
    data-skeleton/         # 空的 data/ 目录树（sessions/uploads/ipc/claude-config）
  out/                     # 构建产物（.pkg/.dmg），已 gitignore
```

## 如何构建

在 **arm64 macOS**（Apple Silicon）上：

```bash
cd desktop
bash build.sh
```

产物：

- `desktop/out/OKClaw-<version>-arm64.pkg`（主交付物）
- `desktop/out/OKClaw-<version>-arm64.dmg`（拖拽安装，可选）

## 如何安装（给最终用户）

1. 双击 `.pkg`（首次 macOS 会因未签名拦截 → 右键→打开，或终端 `xattr -dr com.apple.quarantine "OKClaw-xxx.pkg"`）；也可 `sudo installer -pkg OKClaw-<v>-arm64.pkg -target /`。
2. 打开「启动台」里的 OKClaw → 出现桌面窗口（先 loading，再显示界面）。
3. 在应用内「设置」填入 API Key（ANTHROPIC_API_KEY / BASE_URL / MODEL），保存。
4. 数据与日志位置：`~/Library/Application Support/OKClaw/`
   - `store/`（含 `messages.db`）、`data/`、`skills/`、`.env`、`logs/backend.log`

## 开发调试（dev 模式）

```bash
cd desktop
npm install
npm start
```

dev 模式下，主进程会把后端根指向 `desktop/..`（主项目根）。建议另开终端 `npm run dev` 跑后端联调端口/数据交互（注意 dev 下窗口也会自己 spawn 一份后端子进程，按需调整）。

## 故障排查

| 现象 | 排查 |
|---|---|
| 窗口一直 loading / 启动失败弹窗 | 看 `~/Library/Application Support/OKClaw/logs/backend.log` 尾部 |
| AI 不回复 | 确认 `.env` 里 API Key 已填；日志里看 cli.js 的 stderr |
| 端口冲突 | 已自动选空闲端口，通常无此问题 |
| 残留进程 | 退出时会 tree-kill；异常残留可 `pkill -f 'dist/index.js'`、`pkill -f 'cli.js'` |
| better-sqlite3 报 NODE_MODULE_VERSION | 不要 electron-rebuild；确认构建机与目标机同为 arm64 |

## 后续优化方向

- 代码签名 + 公证（有开发者证书后），消除 Gatekeeper 警告。
- x64（Intel）双架构或 universal 产物。
- 应用内自动更新（electron-updater）。
- 首运行向导式配置 API Key，替代手动进设置页。
