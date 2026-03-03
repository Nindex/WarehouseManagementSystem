# PowerShell 安装脚本
# 设置执行策略（如果需要）
$ErrorActionPreference = "Continue"

Write-Host "🔧 正在安装 better-sqlite3..." -ForegroundColor Cyan
Write-Host ""

# 获取脚本所在目录的父目录（项目根目录）
$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath) {
    $projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
} elseif ($PSScriptRoot) {
    $projectRoot = Split-Path -Parent $PSScriptRoot
} else {
    # 如果都不可用，尝试使用当前工作目录或默认路径
    $defaultPath = "c:\Users\22753\Desktop\仓库管理系统\inventory-management"
    if (Test-Path $defaultPath) {
        $projectRoot = $defaultPath
    } else {
        Write-Host "❌ 无法确定项目目录，请手动切换到项目目录后运行" -ForegroundColor Red
        Write-Host "   项目路径应该是: c:\Users\22753\Desktop\仓库管理系统\inventory-management" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "项目目录: $projectRoot" -ForegroundColor Gray
if (-not (Test-Path $projectRoot)) {
    Write-Host "❌ 项目目录不存在: $projectRoot" -ForegroundColor Red
    exit 1
}
Set-Location $projectRoot

# 设置环境变量
$env:npm_config_build_from_source = "false"
$env:npm_config_strict_ssl = "false"
$env:npm_config_better_sqlite3_binary_host_mirror = "https://github.com/WiseLibs/better-sqlite3/releases/download"

Write-Host "📦 正在安装 better-sqlite3（使用预编译版本）..." -ForegroundColor Yellow
npm install better-sqlite3@^9.2.2 --ignore-scripts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ better-sqlite3 安装完成！" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ 安装失败" -ForegroundColor Red
    Write-Host "   应用将使用 SimpleDB 后备方案" -ForegroundColor Yellow
    exit 0
}
