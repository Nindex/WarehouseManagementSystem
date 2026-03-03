const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 创建跳过检查文件
const skipFile = path.resolve(os.homedir(), '.skip-forge-system-check');
try {
  fs.writeFileSync(skipFile, '');
  console.log('✓ Skip file created');
} catch (e) {
  console.warn('⚠ Failed to create skip file:', e.message);
}

// 检查构建文件是否存在
const distPath = path.join(__dirname, '..', 'dist', 'index.html');
const mainBuildPath = path.join(__dirname, '..', '.vite', 'build', 'main', 'index.js');
const preloadBuildPath = path.join(__dirname, '..', '.vite', 'build', 'preload', 'index.js');

if (!fs.existsSync(distPath)) {
  console.error('❌ 渲染进程文件不存在，请先运行构建任务');
  console.error(`   期望路径: ${distPath}`);
  process.exit(1);
}

if (!fs.existsSync(mainBuildPath)) {
  console.error('❌ 主进程文件不存在，请先运行构建任务');
  console.error(`   期望路径: ${mainBuildPath}`);
  process.exit(1);
}

if (!fs.existsSync(preloadBuildPath)) {
  console.error('❌ Preload 文件不存在，请先运行构建任务');
  console.error(`   期望路径: ${preloadBuildPath}`);
  process.exit(1);
}

console.log('✓ 所有构建文件已就绪');

// 启动 Electron
const isWindows = process.platform === 'win32';
const electronCmd = isWindows ? 'electron.cmd' : 'electron';
const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', electronCmd);

// 检查 electron 是否存在
if (!fs.existsSync(electronPath)) {
  console.error('❌ Electron not found. Please run: npm install');
  process.exit(1);
}

// 设置环境变量 - 不设置开发服务器 URL，使用构建后的文件
process.env.NODE_ENV = 'development';
process.env.ELECTRON_IS_DEV = '1';
// 抑制 Electron 安全警告（仅在开发模式下）
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
// 不设置 MAIN_WINDOW_VITE_DEV_SERVER_URL，让 Electron 加载构建后的文件

// 启动 electron
console.log('🚀 Starting Electron (仅使用构建文件，无开发服务器)...');
console.log('   使用构建文件:');
console.log(`   - 渲染进程: ${distPath}`);
console.log(`   - 主进程: ${mainBuildPath}`);
console.log(`   - Preload: ${preloadBuildPath}`);

const electron = spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    // 不设置开发服务器 URL，使用构建后的文件
    MAIN_WINDOW_VITE_NAME: 'main_window'
  }
});

electron.on('error', (err) => {
  console.error('❌ Failed to start Electron:', err);
  process.exit(1);
});

electron.on('exit', (code) => {
  console.log(`\nElectron 进程已退出，退出码: ${code}`);
  process.exit(code || 0);
});

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n正在关闭 Electron...');
  electron.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  electron.kill();
  process.exit(0);
});

