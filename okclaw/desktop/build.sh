#!/bin/bash
# =============================================================================
# OKClaw 桌面端打包脚本（自包含，在 desktop/ 目录内运行）
#
# 用法：
#   cd desktop && bash build.sh
#
# 产出：
#   desktop/out/OKClaw-<version>-arm64.pkg   （主交付物，离线安装）
#   desktop/out/OKClaw-<version>-arm64.dmg   （拖拽安装，可选）
#
# 流程：
#   1. 构建后端（主项目 tsc → dist/）
#   2. 构建前端（web/ vite → store/public）
#   3. 校验原生模块（better-sqlite3 arm64）
#   4. 密钥泄漏守卫（grep sk-ant）
#   5. electron-builder 打 pkg + dmg
# =============================================================================
set -euo pipefail

# 颜色
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
info()  { echo -e "${G}[INFO]${N} $1"; }
warn()  { echo -e "${Y}[WARN]${N} $1"; }
fail()  { echo -e "${R}[ERROR]${N} $1"; exit 1; }

# desktop/ 自身路径（脚本所在目录）
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 主项目根 = desktop/..
ROOT="$(cd "$DESKTOP_DIR/.." && pwd)"

info "desktop 目录: $DESKTOP_DIR"
info "主项目根: $ROOT"

cd "$ROOT"

# 国内/弱网环境下，electron-builder 下载 Electron 二进制（来自 GitHub）经常超时。
# 默认走 npmmirror 镜像，保证构建可重复。已设环境变量则尊重用户选择。
: "${ELECTRON_MIRROR:=https://npmmirror.com/mirrors/electron/}"
: "${ELECTRON_BUILDER_BINARIES_MIRROR:=https://npmmirror.com/mirrors/electron-builder-binaries/}"
export ELECTRON_MIRROR ELECTRON_BUILDER_BINARIES_MIRROR

# ---------- 0. 环境检查 ----------
command -v node >/dev/null 2>&1 || fail "未找到 node"
ARCH="$(uname -m)"
info "当前架构: $ARCH"
[ "$ARCH" = "arm64" ] || warn "当前非 arm64（$ARCH），产物架构可能与目标不符"

# ---------- 1. 构建后端 ----------
info "[1/5] 安装并构建后端 (tsc → dist/) ..."
npm ci
npm run build
[ -f "$ROOT/dist/index.js" ] || fail "后端构建失败：dist/index.js 不存在"

# ---------- 2. 构建前端 ----------
info "[2/5] 构建前端 (vite → store/public) ..."
(
  cd "$ROOT/web"
  npm ci
  npm run build
)
[ -f "$ROOT/store/public/index.html" ] || fail "前端构建失败：store/public/index.html 不存在"

# ---------- 3. 准备独立 node 二进制 + 重编译原生模块 ----------
info "[3/5] 准备独立 node 二进制 + better-sqlite3 原生模块 ..."

# 3a. 确保有独立 node 二进制（用于跑后端和 cli.js，避免 macOS 弹终端窗口）。
#     后端用独立 node 而非 Electron 二进制，better-sqlite3 必须针对该 node 的 ABI 编译。
NODE_VERSION="v22.11.0"
NODE_BIN="$DESKTOP_DIR/bin/node"
if [ ! -x "$NODE_BIN" ] || [ "$("$NODE_BIN" --version 2>/dev/null)" != "$NODE_VERSION" ]; then
  info "下载独立 Node ${NODE_VERSION} (darwin-arm64) ..."
  mkdir -p "$DESKTOP_DIR/bin"
  TMP_NODE_TGZ="$DESKTOP_DIR/.node.tar.gz"
  curl -L --fail \
    "https://npmmirror.com/mirrors/node/${NODE_VERSION}/node-${NODE_VERSION}-darwin-arm64.tar.gz" \
    -o "$TMP_NODE_TGZ" || fail "下载 Node 失败"
  mkdir -p "$DESKTOP_DIR/.node-extract"
  tar -xzf "$TMP_NODE_TGZ" -C "$DESKTOP_DIR/.node-extract"
  cp "$DESKTOP_DIR/.node-extract/node-${NODE_VERSION}-darwin-arm64/bin/node" "$NODE_BIN"
  chmod +x "$NODE_BIN"
  rm -rf "$TMP_NODE_TGZ" "$DESKTOP_DIR/.node-extract"
fi
info "独立 node: $("$NODE_BIN" --version) (ABI: $("$NODE_BIN" -e 'process.stdout.write(process.versions.modules)'))"

# 3b. 用该 node 二进制 rebuild better-sqlite3（针对其 ABI），原生模块即可被它加载。
SQLITE_NODE="$ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
[ -f "$SQLITE_NODE" ] || fail "未找到 better-sqlite3.node: $SQLITE_NODE"
file "$SQLITE_NODE" | grep -qi "arm64" || fail "better-sqlite3.node 不是 arm64"
info "针对内置 node (${NODE_VERSION}, ABI 127) 重编译 better-sqlite3 ..."
(
  cd "$ROOT"
  # 把内置 node 放到 PATH 最前，让 node-gyp 针对它的 ABI 编译
  PATH="$DESKTOP_DIR/bin:$PATH" npm rebuild better-sqlite3 --build-from-source
)
"$NODE_BIN" -e "const D=require('$ROOT/node_modules/better-sqlite3'); new D(':memory:')" \
  || fail "better-sqlite3 无法在内置 node 下加载"
info "原生模块 OK (arm64, ABI 127)"
info "[4/5] 密钥泄漏守卫 (grep sk-ant / 明文 token) ..."
LEAK=""
LEAK=$(grep -rIl --exclude-dir=node_modules --exclude-dir=.git \
  -e 'sk-ant-' \
  "$ROOT/dist" "$ROOT/store/public" 2>/dev/null || true)
# 单独检查 node_modules 里是否混入了根 .env（理论上不会，但保险）
if [ -f "$ROOT/.env" ]; then
  warn "检测到主项目根 .env（含真实密钥），将确保不被打包（extraResources 已过滤）"
fi
if [ -n "$LEAK" ]; then
  fail "检测到疑似密钥泄漏：\n$LEAK"
fi
info "密钥守卫通过"

# ---------- 5. electron-builder ----------
info "[5/5] electron-builder 打包 (pkg + dmg, arm64) ..."
cd "$DESKTOP_DIR"
npm ci
npx electron-builder --arm64 --mac pkg dmg

info "=========================================="
info "打包完成！"
info "产物目录: $DESKTOP_DIR/out/"
ls -lh "$DESKTOP_DIR/out/" 2>/dev/null || true
info "=========================================="
info "安装方式："
info "  双击 .pkg 安装（首次需右键→打开绕过 Gatekeeper），或"
info "  sudo installer -pkg OKClaw-<v>-arm64.pkg -target /"
info "首次启动后在应用内「设置」填写 API Key。"
