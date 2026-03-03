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

// 启动 vite 开发服务器和 electron
const isWindows = process.platform === 'win32';
const electronCmd = isWindows ? 'electron.cmd' : 'electron';
const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', electronCmd);

// 检查 electron 是否存在
if (!fs.existsSync(electronPath)) {
  console.error('❌ Electron not found. Please run: npm install');
  process.exit(1);
}

// 设置环境变量
process.env.NODE_ENV = 'development';
process.env.ELECTRON_IS_DEV = '1';

// 启动 electron
console.log('🚀 Starting Electron...');
const electron = spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'http://localhost:3000',
    MAIN_WINDOW_VITE_NAME: 'main_window'
  }
});

electron.on('error', (err) => {
  console.error('❌ Failed to start Electron:', err);
  process.exit(1);
});

electron.on('exit', (code) => {
  process.exit(code || 0);
});

// 处理退出信号
process.on('SIGINT', () => {
  electron.kill();
  process.exit(0);
});
