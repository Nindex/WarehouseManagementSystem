// 安装 better-sqlite3 预编译版本
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 安装 better-sqlite3（预编译版本）...\n');

const projectRoot = path.join(__dirname, '..');
const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');

// 删除旧的 better-sqlite3
if (fs.existsSync(betterSqlite3Path)) {
  console.log('🗑️  删除旧的 better-sqlite3...');
  try {
    fs.rmSync(betterSqlite3Path, { recursive: true, force: true });
    console.log('✅ 已删除旧的 better-sqlite3\n');
  } catch (e) {
    console.log('⚠️  无法删除旧的 better-sqlite3，可能正在使用中\n');
    console.log('💡 请关闭所有可能使用 better-sqlite3 的程序后重试\n');
    process.exit(1);
  }
}

// 设置环境变量
const env = {
  ...process.env,
  npm_config_build_from_source: 'false',
  npm_config_strict_ssl: 'false',
  npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download',
};

console.log('📥 正在下载预编译的二进制文件...\n');

try {
  execSync('npm install better-sqlite3@^9.6.0 --no-save', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: env
  });
  
  console.log('\n✅ better-sqlite3 安装成功！\n');
  console.log('🎉 better-sqlite3 安装成功！\n');
  process.exit(0);
} catch (e) {
  console.error('\n❌ better-sqlite3 安装失败\n');
  console.error('错误:', e.message);
  console.error('\n💡 可能的解决方案：');
  console.error('   1. 检查网络连接');
  console.error('   2. 尝试使用代理或 VPN');
  console.error('   3. 如果仍然失败，应用将使用 SimpleDB 后备方案\n');
  process.exit(1);
}
