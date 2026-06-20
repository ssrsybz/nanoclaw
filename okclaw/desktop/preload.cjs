// OKClaw 桌面端 preload（当前为最小占位）。
// 后端是独立 Node 子进程，前端通过 HTTP/WS 与之通信，主进程不需要向渲染层暴露原生 API。
// 后续若需要在窗口内加入原生菜单交互（如「打开数据目录」「打开日志」），可在此通过
// contextBridge.exposeInMainWorld 暴露。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('okclawDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || 'dev',
});
