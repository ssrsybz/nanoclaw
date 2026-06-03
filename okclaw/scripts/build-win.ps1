# Windows 打包脚本 (PowerShell)
# 在 Windows 机器上运行此脚本来生成安装包

Write-Host "=== OKClaw Windows Build Script ===" -ForegroundColor Green

# 检查 Node.js 版本
$nodeVersion = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 20) {
    Write-Host "Error: Node.js 20+ is required. Current version: $(node -v)" -ForegroundColor Red
    exit 1
}

# 进入项目目录
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
Set-Location $projectDir

Write-Host "Project directory: $projectDir"

# 安装依赖
Write-Host ""
Write-Host "=== Installing dependencies ===" -ForegroundColor Yellow
npm install

# 构建项目
Write-Host ""
Write-Host "=== Building project ===" -ForegroundColor Yellow
npm run build

# 打包 Windows 版本
Write-Host ""
Write-Host "=== Building Windows packages ===" -ForegroundColor Yellow
npx electron-builder --win

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Green
Write-Host "Output files are in: $projectDir\release\"

# 列出生成的文件
Get-ChildItem release\ | Format-Table Name, Length -AutoSize

# 提示代码签名
Write-Host ""
Write-Host "=== Code Signing (Optional) ===" -ForegroundColor Cyan
Write-Host "For distribution, you need to sign the app with your code signing certificate."
Write-Host "Set these environment variables before running:"
Write-Host "  WIN_CSC_LINK=C:\path\to\certificate.pfx"
Write-Host "  WIN_CSC_KEY_PASSWORD=your_password"
