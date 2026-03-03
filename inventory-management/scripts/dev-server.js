const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// 立即输出，确保脚本已启动
console.log('开发服务器脚本已启动');
process.stdout.write('正在初始化...\n');

// 创建跳过检查文件
const skipFile = path.resolve(os.homedir(), '.skip-forge-system-check');
try {
  fs.writeFileSync(skipFile, '');
  console.log('✓ Skip file created');
} catch (e) {
  console.warn('⚠ Failed to create skip file:', e.message);
}

// 检查主进程和 preload 构建文件是否存在（这些仍然需要构建）
const mainBuildPath = path.join(__dirname, '..', '.vite', 'build', 'main', 'index.js');
const preloadBuildPath = path.join(__dirname, '..', '.vite', 'build', 'preload', 'index.js');

// 设置环境变量，确保主进程构建时能获取到开发服务器 URL
process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL = `http://localhost:3000`;
process.env.MAIN_WINDOW_VITE_NAME = 'main_window';
process.env.NODE_ENV = 'development';

if (!fs.existsSync(mainBuildPath)) {
  console.error('❌ 主进程文件不存在，请先运行构建任务');
  console.error(`   期望路径: ${mainBuildPath}`);
  console.error('   运行: npm run build:main:watch');
  console.error('   注意：请确保在运行 watch 模式时设置了 MAIN_WINDOW_VITE_DEV_SERVER_URL 环境变量');
  process.exit(1);
}

if (!fs.existsSync(preloadBuildPath)) {
  console.error('❌ Preload 文件不存在，请先运行构建任务');
  console.error(`   期望路径: ${preloadBuildPath}`);
  console.error('   运行: npm run build:preload:watch');
  process.exit(1);
}

console.log('✓ 主进程和 Preload 文件已就绪');

// Vite 开发服务器配置
const VITE_PORT = 3000;
const VITE_HOST = 'localhost';
const DEV_SERVER_URL = `http://${VITE_HOST}:${VITE_PORT}`;

// 检查端口是否可用（带超时）
function checkPort(port, host) {
  return new Promise((resolve) => {
    const server = http.createServer();
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          server.close();
        } catch (e) {
          // 忽略关闭错误
        }
        console.log(`端口检查超时，假设端口 ${port} 可用`);
        resolve(true);
      }
    }, 2000);
    
    server.listen(port, host, () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        server.close(() => resolve(true));
      }
    });
    
    server.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });
}

// 清理占用端口的进程（Windows）
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve();
      return;
    }
    
    exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
      if (error || !stdout) {
        resolve();
        return;
      }
      
      const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0) {
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }
      });
      
      if (pids.size === 0) {
        resolve();
        return;
      }
      
      console.log(`检测到端口 ${port} 被占用，正在清理进程...`);
      let killed = 0;
      const total = pids.size;
      
      pids.forEach(pid => {
        exec(`taskkill /F /PID ${pid}`, (err) => {
          if (!err) {
            killed++;
            console.log(`已终止进程 ${pid}`);
          }
          if (killed === total) {
            setTimeout(resolve, 500);
          }
        });
      });
      
      // 超时保护
      setTimeout(resolve, 3000);
    });
  });
}

// 启动 Vite 开发服务器
async function startViteServer() {
  console.log('检查端口状态...');
  // 先检查并清理端口
  const isPortAvailable = await checkPort(VITE_PORT, VITE_HOST);
  console.log(`端口 ${VITE_PORT} 状态: ${isPortAvailable ? '可用' : '被占用'}`);
  
  if (!isPortAvailable) {
    console.log(`端口 ${VITE_PORT} 被占用，正在清理...`);
    await killProcessOnPort(VITE_PORT);
    
    // 再次检查
    console.log('重新检查端口...');
    const stillOccupied = !(await checkPort(VITE_PORT, VITE_HOST));
    if (stillOccupied) {
      console.warn(`⚠ 端口 ${VITE_PORT} 仍被占用，Vite 将尝试使用其他端口`);
    } else {
      console.log(`✓ 端口 ${VITE_PORT} 已释放`);
    }
  }

  console.log('🚀 启动 Vite 开发服务器...');
  const vite = spawn('npx', ['vite', '--config', 'vite.config.ts', '--host', 'localhost', '--port', '3000'], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout 和 stderr
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    }
  });

  let viteOutput = '';
  let viteError = '';

  vite.stdout.on('data', (data) => {
    const output = data.toString();
    viteOutput += output;
    // 实时显示 Vite 输出
    process.stdout.write(`[Vite] ${output}`);
    // 检查是否包含服务器启动信息
    if (output.includes('Local:') || output.includes('localhost:') || output.includes('ready in')) {
      console.log('\n✓ 检测到 Vite 服务器启动信息');
    }
  });

  vite.stderr.on('data', (data) => {
    const output = data.toString();
    viteError += output;
    // 实时显示错误
    process.stderr.write(`[Vite Error] ${output}`);
  });

  vite.on('error', (err) => {
    console.error('❌ Failed to start Vite:', err);
    console.error('   错误详情:', err.message);
    process.exit(1);
  });

  vite.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`❌ Vite 服务器退出，退出码: ${code}, 信号: ${signal}`);
      if (viteError) {
        console.error('Vite 错误输出:', viteError);
      }
      if (viteOutput) {
        console.error('Vite 标准输出:', viteOutput);
      }
      process.exit(code);
    }
  });

  // 等待一小段时间，确保进程已启动
  await new Promise(resolve => setTimeout(resolve, 1000));

  return vite;
}

// 等待开发服务器就绪
function waitForServer(url, maxAttempts = 60, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    console.log(`等待开发服务器启动: ${url}...`);
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          console.log(`✓ Vite 开发服务器已就绪: ${url}`);
          resolve(url);
        } else {
          req.destroy();
          if (attempts >= maxAttempts) {
            reject(new Error(`开发服务器在 ${maxAttempts * delay}ms 内未启动 (状态码: ${res.statusCode})`));
          } else {
            setTimeout(check, delay);
          }
        }
      });
      req.on('error', (err) => {
        if (attempts < maxAttempts) {
          if (attempts % 10 === 0) {
            console.log(`等待中... (${attempts}/${maxAttempts}) - ${err.message}`);
          }
          setTimeout(check, delay);
        } else {
          reject(new Error(`开发服务器在 ${maxAttempts * delay}ms 内未启动: ${err.message}`));
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts >= maxAttempts) {
          reject(new Error(`开发服务器在 ${maxAttempts * delay}ms 内未启动 (连接超时)`));
        } else {
          setTimeout(check, delay);
        }
      });
    };
    check();
  });
}

// 启动 Electron
function startElectron(serverUrl) {
  const isWindows = process.platform === 'win32';
  const electronCmd = isWindows ? 'electron.cmd' : 'electron';
  const electronPath = path.join(__dirname, '..', 'node_modules', '.bin', electronCmd);

  if (!fs.existsSync(electronPath)) {
    console.error('❌ Electron not found. Please run: npm install');
    process.exit(1);
  }

  console.log('🚀 启动 Electron...');
  console.log(`   开发服务器: ${serverUrl}`);
  console.log(`   主进程: ${mainBuildPath}`);
  console.log(`   Preload: ${preloadBuildPath}`);

  const electron = spawn(electronPath, ['.'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_IS_DEV: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      MAIN_WINDOW_VITE_DEV_SERVER_URL: serverUrl,
      MAIN_WINDOW_VITE_NAME: 'main_window',
    }
  });

  electron.on('error', (err) => {
    console.error('❌ Failed to start Electron:', err);
    process.exit(1);
  });

  electron.on('exit', (code) => {
    console.log(`\nElectron 进程已退出，退出码: ${code}`);
    // 不立即退出，让 Vite 服务器继续运行
  });

  return electron;
}

// 主函数
async function main() {
  console.log('开始启动开发服务器...');
  try {
    // 启动 Vite 开发服务器
    console.log('准备启动 Vite 服务器...');
    const vite = await startViteServer();
    console.log('Vite 服务器进程已启动');

    // 等待服务器就绪（最多等待30秒）
    let actualServerUrl = DEV_SERVER_URL;
    try {
      actualServerUrl = await waitForServer(DEV_SERVER_URL);
    } catch (err) {
      console.error('❌ 等待开发服务器超时:', err.message);
      vite.kill();
      process.exit(1);
    }

    // 启动 Electron（使用实际的服务器 URL）
    const electron = startElectron(actualServerUrl);

    // 处理退出信号
    const cleanup = () => {
      console.log('\n正在关闭...');
      if (electron && !electron.killed) {
        electron.kill();
      }
      if (vite && !vite.killed) {
        vite.kill();
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // 如果 Electron 退出，也关闭 Vite
    electron.on('exit', (code) => {
      console.log(`Electron 已退出 (退出码: ${code})`);
      setTimeout(() => {
        if (vite && !vite.killed) {
          vite.kill();
        }
        process.exit(code || 0);
      }, 1000);
    });

  } catch (err) {
    console.error('❌ 启动失败:', err);
    if (typeof vite !== 'undefined' && vite && !vite.killed) {
      vite.kill();
    }
    process.exit(1);
  }
}

main();

