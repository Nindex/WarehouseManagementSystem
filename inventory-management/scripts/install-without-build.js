// 安装脚本：跳过 better-sqlite3 的编译，使用预编译版本或 SimpleDB 后备方案
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 正在安装依赖（跳过 better-sqlite3 编译）...');

try {
  // 设置环境变量跳过编译
  process.env.npm_config_build_from_source = 'false';
  process.env.npm_config_better_sqlite3_binary_host_mirror = 'https://github.com/WiseLibs/better-sqlite3/releases/download';
  
  // 安装所有依赖，但忽略 better-sqlite3 的安装脚本
  console.log('正在安装依赖...');
  execSync('npm install --ignore-scripts', { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      npm_config_build_from_source: 'false',
      npm_config_strict_ssl: 'false'
    }
  });
  
  // 然后尝试单独安装 better-sqlite3（使用预编译版本）
  console.log('正在安装 better-sqlite3（使用预编译版本）...');
  try {
    execSync('npm install better-sqlite3@^9.2.2 --ignore-scripts', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        npm_config_build_from_source: 'false',
        npm_config_strict_ssl: 'false',
        npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download'
      }
    });
  } catch (e) {
    console.warn('⚠️  better-sqlite3 安装失败，应用将使用 SimpleDB 后备方案');
    console.warn('   这不会影响应用的基本功能，但某些数据库功能可能受限');
  }
  
  console.log('✅ 安装完成！');
  console.log('');
  console.log('💡 提示：如果 better-sqlite3 未正确安装，应用会自动使用 SimpleDB 后备方案');
  console.log('   要完整支持 SQLite，请安装 Visual Studio Build Tools：');
  console.log('   https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022');
  
} catch (error) {
  console.error('❌ 安装失败:', error.message);
  process.exit(1);
}
