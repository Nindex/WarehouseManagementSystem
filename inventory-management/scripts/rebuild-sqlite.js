// 为 Electron 重新编译 better-sqlite3
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 正在为 Electron 重新编译 better-sqlite3...\n');

const projectRoot = path.join(__dirname, '..');

// 设置环境变量
const env = {
  ...process.env,
  npm_config_build_from_source: 'false',
  npm_config_strict_ssl: 'false',
  npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download',
  GYP_MSVS_VERSION: '2022',
  npm_config_msvs_version: '2022',
};

// 尝试从配置文件获取 Python 路径
let pythonPath = null;
try {
  const configPath = path.join(projectRoot, '.python-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.pythonPath && fs.existsSync(config.pythonPath)) {
      pythonPath = config.pythonPath;
    }
  }
} catch (e) {
  // 忽略
}

// 如果配置文件中没有，尝试从环境变量获取
if (!pythonPath && process.env.PYTHON) {
  pythonPath = process.env.PYTHON;
}

// 设置所有可能的 Python 环境变量
if (pythonPath) {
  env.PYTHON = pythonPath;
  env.npm_config_python = pythonPath;
  env.PYTHONPATH = path.dirname(pythonPath);
  console.log(`📝 使用 Python: ${pythonPath}\n`);
} else {
  console.log('⚠️  未找到 Python 配置，尝试自动检测...\n');
}

try {
  console.log('📦 使用 electron-rebuild 重新编译 better-sqlite3...\n');
  
  // 在 Windows 上，需要确保环境变量正确传递
  const command = process.platform === 'win32' 
    ? `set PYTHON=${env.PYTHON || ''} && set npm_config_python=${env.npm_config_python || ''} && npx electron-rebuild -f -w better-sqlite3`
    : `PYTHON=${env.PYTHON || ''} npm_config_python=${env.npm_config_python || ''} npx electron-rebuild -f -w better-sqlite3`;
  
  execSync(command, {
    stdio: 'inherit',
    cwd: projectRoot,
    env: env,
    shell: true
  });
  
  console.log('\n✅ better-sqlite3 重新编译完成！\n');
  process.exit(0);
} catch (e) {
  console.error('\n❌ electron-rebuild 失败');
  console.error('   错误:', e.message);
  console.error('\n💡 尝试使用 prebuild-install...\n');
  
  // 尝试使用 prebuild-install
  try {
    const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
    console.log('📦 使用 prebuild-install 下载预编译版本...');
    
    // 获取 Electron 版本
    const electronPackage = require(path.join(projectRoot, 'node_modules', 'electron', 'package.json'));
    const electronVersion = electronPackage.version;
    const nodeVersion = electronPackage.config?.target || '22.15.0'; // Electron 28 使用的 Node.js 版本
    
    console.log(`   Electron 版本: ${electronVersion}`);
    console.log(`   Node.js 版本: ${nodeVersion}`);
    
    execSync(`npx prebuild-install --runtime electron --target ${electronVersion} --verbose`, {
      stdio: 'inherit',
      cwd: betterSqlite3Path,
      env: env
    });
    
    console.log('\n✅ prebuild-install 完成！\n');
    process.exit(0);
  } catch (e2) {
    console.error('\n❌ prebuild-install 也失败');
    console.error('   错误:', e2.message);
    console.error('\n⚠️  应用将使用 SimpleDB 后备方案');
    console.error('   这不会影响基本功能\n');
    process.exit(0);
  }
}
