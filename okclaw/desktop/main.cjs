// OKClaw 桌面端主进程（Electron main, CommonJS）
//
// 职责（薄壳）：
//   1. 单实例锁，防止第二个实例抢端口。
//   2. 首次运行：把只读的 store/public、skills、data 骨架、.env 模板 seed 到用户可写数据目录。
//   3. 生成一个指向包内 cli.js 的 claude shim，设 CLAUDE_CODE_PATH 让 Agent SDK 离线可用。
//   4. 选一个空闲端口，以 ELECTRON_RUN_AS_NODE 方式 spawn 后端 Node 子进程（cwd = 用户数据目录）。
//   5. 健康检查轮询该端口，成功后 BrowserWindow 加载它（桌面窗口，不用浏览器）。
//   6. 退出时 tree-kill 后端进程树（含 cli.js 孙进程）。
//
// 关键设计：后端代码（dist/node_modules）留在只读 Resources/，数据全部基于 cwd，所以只要
// 把 cwd 指向用户数据目录，后端零改动即可正常工作，且原生模块 better-sqlite3 跑在真正的
// Node 环境里，绕开 Electron 的 Node ABI 不匹配问题。

'use strict';

// 清理可能从宿主环境（IDE 等）泄漏的 Electron 控制变量，避免主进程被误判为
// “node 模式”或“已打包”。这些变量只应在我们显式给后端子进程设置时才存在。
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_FORCE_IS_PACKAGED;
delete process.env.ELECTRON_OVERRIDE_DIST_PATH;

const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
} = require('electron');

// 统一应用名为 OKClaw，使数据目录落在 ~/Library/Application Support/OKClaw
// （默认会按 package.json 的 name=okclaw-desktop 命名，这里覆盖）。必须在 app ready 前调用。
app.setName('OKClaw');

const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// 路径解析
// ---------------------------------------------------------------------------

// dev 模式：后端根是主项目根（desktop 的上级）；打包后：Resources/backend
// 注意：app.isPackaged 可能被外部 ELECTRON_FORCE_IS_PACKAGED 环境变量污染，所以
// 同时校验路径是否存在，并在打包路径无效时回退到 dev 路径，更稳健。
function getBackendRoot() {
  const devRoot = path.resolve(__dirname, '..');
  if (app.isPackaged) {
    const pkgRoot = path.join(process.resourcesPath, 'backend');
    if (fs.existsSync(path.join(pkgRoot, 'dist', 'index.js'))) {
      return pkgRoot;
    }
    // 打包路径无效（或被 env 污染）→ 回退 dev
    console.warn(`[main] 打包后端路径无效，回退 dev: ${pkgRoot}`);
    return devRoot;
  }
  return devRoot;
}

function getSeedDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'seed');
  }
  return path.join(__dirname, 'seed');
}

// 解析独立 node 二进制路径。
// 打包后：Resources/node/bin/node；dev：desktop/bin/node（需先用 build.sh 下载）。
// 关键：用独立 node（而非 Electron 二进制）跑后端和 cli.js，避免 macOS 弹终端窗口。
function getNodeBin() {
  if (app.isPackaged) {
    const pkgNode = path.join(process.resourcesPath, 'node', 'bin', 'node');
    if (fs.existsSync(pkgNode)) return pkgNode;
  }
  // dev：desktop/bin/node
  const devNode = path.join(__dirname, 'bin', 'node');
  if (fs.existsSync(devNode)) return devNode;
  // 兜底：系统 node（仅 dev 环境可用，打包后不应走到这里）
  console.warn('[main] 未找到内置 node 二进制，回退系统 node');
  return 'node';
}

// 用户可写数据目录：~/Library/Application Support/OKClaw
function getUserDataRoot() {
  return app.getPath('userData');
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 仅当目标不存在时复制（幂等 seed）
function seedIfMissing(src, dest, opts = {}) {
  if (!fs.existsSync(dest)) {
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`[seed] ${path.basename(dest)} ← ${src}`);
    } else if (opts.warnIfMissing) {
      console.warn(`[seed] 源不存在，跳过: ${src}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 首次运行数据 seeding
// ---------------------------------------------------------------------------

function seedUserData() {
  const user = getUserDataRoot();
  const backend = getBackendRoot();
  const seed = getSeedDir();

  ensureDir(user);
  ensureDir(path.join(user, 'logs'));
  ensureDir(path.join(user, 'bin'));

  // store/public（前端静态资源，只读，仅首次复制）
  seedIfMissing(
    path.join(backend, 'store', 'public'),
    path.join(user, 'store', 'public'),
    { warnIfMissing: true },
  );
  ensureDir(path.join(user, 'store'));

  // skills（后端从 cwd/skills 读取）
  seedIfMissing(
    path.join(backend, 'skills'),
    path.join(user, 'skills'),
    { warnIfMissing: true },
  );

  // data 骨架目录
  const skeleton = path.join(seed, 'data-skeleton');
  if (fs.existsSync(skeleton)) {
    // 把 skeleton 下的每个子目录/文件 seed 进 user/data
    for (const entry of fs.readdirSync(skeleton)) {
      seedIfMissing(
        path.join(skeleton, entry),
        path.join(user, 'data', entry),
      );
    }
  } else {
    // 兜底：直接建空目录
    for (const d of ['sessions', 'uploads', 'ipc', 'claude-config']) {
      ensureDir(path.join(user, 'data', d));
    }
  }

  // .env 模板（绝不含密钥）
  const envTemplate = path.join(seed, '.env.template');
  const envDest = path.join(user, '.env');
  if (!fs.existsSync(envDest)) {
    if (fs.existsSync(envTemplate)) {
      fs.copyFileSync(envTemplate, envDest);
      console.log('[seed] .env ← seed/.env.template');
    } else {
      fs.writeFileSync(envDest, '# 请在应用内「设置」页面填写 API Key\n');
      console.log('[seed] .env ← 空');
    }
  }
}

// ---------------------------------------------------------------------------
// Claude shim：让 pathToClaudeCodeExecutable 指向包内 cli.js，离线可用
// ---------------------------------------------------------------------------

function ensureClaudeShim() {
  const user = getUserDataRoot();
  const shimPath = path.join(user, 'bin', 'claude');

  // 解析 cli.js 的绝对路径（基于后端根，dev/打包都适用）
  const cliJs = path.join(
    getBackendRoot(),
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk',
    'cli.js',
  );
  if (!fs.existsSync(cliJs)) {
    console.warn(`[shim] cli.js 不存在: ${cliJs}（离线 AI 将不可用）`);
  }

  // node 可执行文件：用打包在应用内的独立 node（不用 Electron 二进制）。
  // 关键：不设 ELECTRON_RUN_AS_NODE，且不通过 Electron 二进制跑 cli.js。
  // 这样 cli.js 及它 spawn 的所有子进程都是普通 node 进程，macOS 不会弹出
  // 可见终端窗口（之前用 Electron 二进制 + ELECTRON_RUN_AS_NODE 会触发弹窗）。
  const nodeBin = getNodeBin();

  const shim = `#!/bin/bash
# 由 OKClaw 桌面端自动生成 —— 用应用内的 node 跑 Claude Agent SDK cli.js
exec ${JSON.stringify(nodeBin).slice(1, -1)} ${JSON.stringify(cliJs).slice(1, -1)} "$@"
`;

  // 每次都重写（路径可能因安装位置变化）
  fs.writeFileSync(shimPath, shim, { mode: 0o755 });
  fs.chmodSync(shimPath, 0o755);
  console.log(`[shim] ${shimPath} → cli.js`);

  return shimPath;
}

// ---------------------------------------------------------------------------
// 选一个空闲端口（避免和系统已占用的 3100 冲突）
// ---------------------------------------------------------------------------

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------
// 健康检查：轮询后端 HTTP 端口
// ---------------------------------------------------------------------------

function waitForBackend(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/', timeout: 2000 },
        (res) => {
          res.resume();
          // 任何 HTTP 响应都说明后端起来了
          resolve();
        },
      );
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('后端启动超时'));
        } else {
          setTimeout(attempt, 250);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error('后端启动超时'));
        } else {
          setTimeout(attempt, 250);
        }
      });
    }
    attempt();
  });
}

// ---------------------------------------------------------------------------
// 进程树清理（macOS）：杀掉 pid 及其所有子孙
// ---------------------------------------------------------------------------

function treeKill(pid, signal = 'SIGTERM') {
  try {
    // 递归收集子进程
    const children = (pidArg) => {
      let out = '';
      try {
        out = execFileSync('pgrep', ['-P', String(pidArg)], {
          encoding: 'utf8',
        });
      } catch {
        return [];
      }
      const pids = out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
      const all = [];
      for (const p of pids) {
        all.push(p, ...children(p));
      }
      return all;
    };
    const descendants = children(pid);
    for (const p of descendants) {
      try {
        process.kill(p, signal);
      } catch {
        /* 已退出 */
      }
    }
    try {
      process.kill(pid, signal);
    } catch {
      /* 已退出 */
    }
    return descendants.length + 1;
  } catch (err) {
    console.warn('[treeKill] 失败:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 全局状态
// ---------------------------------------------------------------------------

let backendProc = null;
let mainWindow = null;
let loadingWindow = null;
let backendPort = null;
let isQuitting = false;

// ---------------------------------------------------------------------------
// 后端日志收集
// ---------------------------------------------------------------------------

function logLine(line) {
  try {
    const logDir = path.join(getUserDataRoot(), 'logs');
    ensureDir(logDir);
    fs.appendFileSync(
      path.join(logDir, 'backend.log'),
      line + '\n',
    );
  } catch {
    /* 忽略 */
  }
}

// ---------------------------------------------------------------------------
// 启动后端子进程
// ---------------------------------------------------------------------------

function startBackend(claudeShimPath, port) {
  const backend = getBackendRoot();
  const user = getUserDataRoot();
  const entry = path.join(backend, 'dist', 'index.js');

  if (!fs.existsSync(entry)) {
    throw new Error(`后端入口不存在: ${entry}`);
  }

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    WEB_IM_PORT: String(port),
    CLAUDE_CODE_PATH: claudeShimPath,
    // 数据目录提示（后端用 cwd 解析，这里 cwd 已是 user）
    HOME: process.env.HOME || os.homedir(),
    // ===== 关键：确保子进程环境里没有 ELECTRON_RUN_AS_NODE =====
    // 该变量一旦泄漏进 cli.js 的子进程，在 macOS 上会触发可见终端窗口弹出。
    // 我们用独立 node 二进制跑后端（见下方 getNodeBin），本就不需要它。
    // 同时显式删除，防止从 Electron 主进程环境继承。
  };
  delete env.ELECTRON_RUN_AS_NODE;

  backendProc = spawn(getNodeBin(), [entry], {
    cwd: user,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const writeOut = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[backend] ${text}`);
    logLine(text.replace(/\n$/, ''));
  };
  backendProc.stdout.on('data', writeOut);
  backendProc.stderr.on('data', writeOut);

  backendProc.on('exit', (code, signal) => {
    console.log(`[backend] 退出 code=${code} signal=${signal}`);
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      // 后端意外退出
      const tail = readLogTail(20);
      dialog.showErrorBox(
        'OKClaw 后端已停止',
        `后端进程退出（code=${code}）。\n\n最近日志：\n${tail}`,
      );
    }
  });
}

function readLogTail(lines = 30) {
  try {
    const f = path.join(getUserDataRoot(), 'logs', 'backend.log');
    if (!fs.existsSync(f)) return '(无日志)';
    const content = fs.readFileSync(f, 'utf8');
    const arr = content.split('\n').filter(Boolean);
    return arr.slice(-lines).join('\n');
  } catch {
    return '(读取日志失败)';
  }
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

const LOADING_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OKClaw</title>
<style>
  html,body{margin:0;height:100%;background:#0f1020;color:#e6e6e6;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    display:flex;align-items:center;justify-content:center;flex-direction:column}
  .dot{width:14px;height:14px;border-radius:50%;background:#6c7ee1;margin:18px 0;
    animation:p 1s infinite ease-in-out}
  @keyframes p{0%,100%{transform:scale(.6);opacity:.5}50%{transform:scale(1);opacity:1}}
  h1{font-size:20px;font-weight:600;margin:0}
  p{color:#888;font-size:13px;margin-top:8px}
</style></head>
<body>
  <h1>OKClaw</h1>
  <div class="dot"></div>
  <p>正在启动…</p>
</body></html>`;

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 360,
    height: 240,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    center: true,
    show: true,
    backgroundColor: '#0f1020',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  loadingWindow.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_HTML),
  );
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'OKClaw',
    backgroundColor: '#0f1020',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.once('ready-to-show', () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
      loadingWindow = null;
    }
    mainWindow.show();
    // 调试时可用 OKCLAW_DEVTOOLS=1 启动打开 DevTools；正式版默认关闭
    if (process.env.OKCLAW_DEVTOOLS === '1' || !app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // 外链在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 渲染层崩溃 / 无响应 监听（把真实原因打到日志，而不是默默白屏）
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[renderer] 渲染进程异常退出:', JSON.stringify(details));
    logLine(`[renderer] render-process-gone: ${JSON.stringify(details)}`);
    dialog.showErrorBox(
      'OKClaw 界面崩溃',
      `渲染进程异常退出：${details && details.reason}\n即将自动重载界面。`,
    );
    // 自动重载（而非退出整个 app）
    try {
      mainWindow.webContents.reload();
    } catch {
      /* 忽略 */
    }
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[renderer] 无响应');
    logLine('[renderer] unresponsive');
  });
  mainWindow.webContents.on('console-message', (event, level, message) => {
    // 捕获前端 console 报错，写到日志便于诊断白屏
    logLine(`[renderer-console] ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      // 1. seed 用户数据目录
      seedUserData();
      // 2. 生成 claude shim
      const claudeShim = ensureClaudeShim();
      // 3. 选端口
      backendPort = await pickFreePort();
      console.log(`[main] 选用端口 ${backendPort}`);
      // 4. 启动后端
      startBackend(claudeShim, backendPort);
      // 5. loading 窗口
      createLoadingWindow();
      // 6. 等后端就绪
      await waitForBackend(backendPort, 60000);
      // 7. 主窗口
      createMainWindow(backendPort);
    } catch (err) {
      console.error('[main] 启动失败:', err);
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      dialog.showErrorBox(
        'OKClaw 启动失败',
        `${err && err.message ? err.message : err}\n\n最近后端日志：\n${readLogTail(30)}`,
      );
      app.quit();
    }
  });

  // 退出清理
  app.on('before-quit', () => {
    isQuitting = true;
    if (backendProc) {
      const pid = backendProc.pid;
      console.log(`[quit] tree-kill 后端进程树 pid=${pid}`);
      const n = treeKill(pid, 'SIGTERM');
      // 3 秒后兜底 SIGKILL
      setTimeout(() => {
        try {
          treeKill(pid, 'SIGKILL');
        } catch {
          /* 忽略 */
        }
      }, 3000);
      void n;
    }
  });

  // 关闭所有窗口：只有“用户主动退出”时才真正退出；否则（渲染崩溃/误关）重建窗口，
  // 避免后端还活着、前端却白屏且整个 app 退出。
  app.on('window-all-closed', () => {
    if (isQuitting) {
      app.quit();
      return;
    }
    // 窗口意外全关（如渲染崩溃 reload 期间）→ 后端若仍在线，重建主窗口
    if (backendProc && backendPort && !backendProc.killed) {
      console.log('[main] 窗口全部关闭但后端仍在运行，重建主窗口');
      createMainWindow(backendPort);
    } else {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendPort) {
      createMainWindow(backendPort);
    }
  });
}

// 隐藏 macOS 默认菜单中需要后端在线才有意义的项；保留最小菜单
if (process.platform === 'darwin') {
  const template = [
    {
      label: 'OKClaw',
      submenu: [
        { role: 'about', label: '关于 OKClaw' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 OKClaw' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: '退出 OKClaw' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch {
    /* 忽略 */
  }
}
