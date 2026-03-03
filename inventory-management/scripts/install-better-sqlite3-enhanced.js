// 增强版 better-sqlite3 安装脚本
// 自动处理 Python 和 Visual Studio 配置
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 增强版 better-sqlite3 安装脚本\n');
console.log('此脚本将：');
console.log('  1. 配置环境变量');
console.log('  2. 安装 better-sqlite3\n');

const projectRoot = path.join(__dirname, '..');



// 步骤 1: 配置环境变量
console.log('═══════════════════════════════════════');
console.log('步骤 1: 配置环境变量');
console.log('═══════════════════════════════════════\n');

const env = {
  ...process.env,
  npm_config_build_from_source: 'false',
  npm_config_strict_ssl: 'false',
  npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download',
  GYP_MSVS_VERSION: '2022',
  npm_config_msvs_version: '2022',
};

// 尝试从配置文件获取 Python 路径
try {
  const configPath = path.join(projectRoot, '.python-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.pythonPath && fs.existsSync(config.pythonPath)) {
      env.PYTHON = config.pythonPath;
      console.log(`📝 使用配置的 Python: ${config.pythonPath}`);
      console.log(`   版本: ${config.version}\n`);
    }
  }
} catch (e) {
  // 忽略，继续尝试从环境变量获取
}

// 如果配置文件中没有，尝试从环境变量获取
if (!env.PYTHON && process.env.PYTHON) {
  env.PYTHON = process.env.PYTHON;
  console.log(`📝 使用环境变量中的 Python: ${env.PYTHON}\n`);
}

// 步骤 2: 清理旧的安装
console.log('═══════════════════════════════════════');
console.log('步骤 2: 清理旧的 better-sqlite3 安装');
console.log('═══════════════════════════════════════\n');

const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
if (fs.existsSync(betterSqlite3Path)) {
  console.log('🗑️  删除旧的 better-sqlite3...');
  try {
    fs.rmSync(betterSqlite3Path, { recursive: true, force: true });
    console.log('✅ 已删除旧的 better-sqlite3\n');
  } catch (e) {
    console.log('⚠️  无法删除旧的 better-sqlite3，可能正在使用中\n');
  }
}

// 步骤 3: 安装 better-sqlite3
console.log('═══════════════════════════════════════');
console.log('步骤 3: 安装 better-sqlite3');
console.log('═══════════════════════════════════════\n');

console.log('📦 正在安装 better-sqlite3@^9.2.2...\n');

try {
  // 首先尝试使用预编译二进制文件
  console.log('尝试 1: 使用预编译二进制文件（推荐）\n');
  execSync('npm install better-sqlite3@^9.2.2 --no-save', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: env
  });
  console.log('\n✅ better-sqlite3 安装成功！\n');
} catch (e) {
  console.log('\n⚠️  预编译二进制文件安装失败，尝试从源码编译...\n');
  
  try {
    // 如果预编译失败，尝试从源码编译
    console.log('尝试 2: 从源码编译\n');
    env.npm_config_build_from_source = 'true';
    execSync('npm install better-sqlite3@^9.2.2 --no-save --build-from-source', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: env
    });
    console.log('\n✅ better-sqlite3 从源码编译成功！\n');
  } catch (e2) {
    console.log('\n❌ better-sqlite3 安装失败\n');
    console.log('错误详情:');
    console.error(e2.message);
    console.log('\n💡 可能的解决方案：');
    console.log('   1. 确保已安装 Python 3.9、3.10 或 3.11');
    console.log('   2. 确保已安装 Visual Studio 2022 并包含 "使用 C++ 的桌面开发"');
    console.log('   3. 设置环境变量: set PYTHON="C:\\Python310\\python.exe"（替换为实际路径）');
    console.log('   4. 或运行: npm run check:python 来自动配置');
    console.log('   5. 重新运行此脚本');
    console.log('   6. 如果仍然失败，应用将使用 SimpleDB 后备方案\n');
    process.exit(1);
  }
}

console.log('\n🎉 better-sqlite3 安装完成！\n');
process.exit(0);
