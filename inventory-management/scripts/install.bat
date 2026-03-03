@echo off
chcp 65001 >nul
echo 🔧 正在安装 better-sqlite3...
echo.

cd /d "%~dp0.."

set npm_config_build_from_source=false
set npm_config_strict_ssl=false
set npm_config_better_sqlite3_binary_host_mirror=https://github.com/WiseLibs/better-sqlite3/releases/download

echo 📦 正在安装 better-sqlite3（使用预编译版本）...
call npm install better-sqlite3@^9.2.2 --ignore-scripts

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ better-sqlite3 安装完成！
    echo.
) else (
    echo.
    echo ❌ 安装失败
    echo    应用将使用 SimpleDB 后备方案
    exit /b 0
)

pause
