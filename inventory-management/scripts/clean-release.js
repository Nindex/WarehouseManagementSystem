const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const releaseDir = path.join(__dirname, '..', 'release')

console.log('正在清理 release 目录...')

if (fs.existsSync(releaseDir)) {
  try {
    // 尝试正常删除
    fs.rmSync(releaseDir, { recursive: true, force: true })
    console.log('✅ release 目录已清理')
  } catch (error) {
    console.warn('⚠️ 无法删除 release 目录，可能被占用')
    console.warn('请手动关闭所有 Electron 应用和文件资源管理器窗口')
    console.warn('然后运行: npm run clean:release')
    
    // 在 Windows 上尝试使用 rmdir 命令
    if (process.platform === 'win32') {
      try {
        console.log('尝试使用 Windows rmdir 命令...')
        execSync(`rmdir /s /q "${releaseDir}"`, { stdio: 'inherit' })
        console.log('✅ release 目录已清理')
      } catch (e) {
        console.error('❌ 清理失败，请手动删除 release 目录')
        process.exit(1)
      }
    } else {
      process.exit(1)
    }
  }
} else {
  console.log('release 目录不存在，无需清理')
}
