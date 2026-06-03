const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let backendProcess;
const PORT = 3100;

function isDev() {
  return process.env.ELECTRON_DEV === 'true' || !app.isPackaged;
}

function startBackend() {
  return new Promise((resolve) => {
    if (isDev()) {
      // 开发模式：假设后端已在外部启动
      resolve();
      return;
    }

    const backendPath = path.join(process.resourcesPath, 'dist', 'index.js');
    const nodePath = process.execPath.includes('node')
      ? 'node'
      : path.join(path.dirname(process.execPath), 'node') || 'node';

    backendProcess = spawn(nodePath, [backendPath], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'inherit',
      cwd: process.resourcesPath
    });

    backendProcess.on('error', (err) => {
      console.error('Backend process error:', err);
    });

    // 等待后端启动
    let attempts = 0;
    const maxAttempts = 30;
    const checkServer = setInterval(() => {
      http.get(`http://localhost:${PORT}`, (res) => {
        clearInterval(checkServer);
        resolve();
      }).on('error', () => {
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(checkServer);
          resolve();
        }
      });
    }, 500);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    title: 'OKClaw',
    show: false
  });

  const url = isDev()
    ? 'http://localhost:5173'
    : `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
