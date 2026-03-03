// 安装 better-sqlite3 的原生绑定文件
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 正在安装 better-sqlite3 原生绑定...\n');

const projectRoot = path.join(__dirname, '..');
const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');

if (!fs.existsSync(betterSqlite3Path)) {
  console.error('❌ better-sqlite3 未安装，请先运行: npm install better-sqlite3@^9.2.2');
  process.exit(1);
}

// 设置环境变量
const env = {
  ...process.env,
  npm_config_build_from_source: 'false',
  npm_config_strict_ssl: 'false',
  npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download',
};

// 方法 1: 尝试使用 prebuild-install 下载预编译的二进制文件
console.log('📦 方法 1: 尝试下载预编译的二进制文件...');
try {
  execSync('npx prebuild-install --runtime node --target-prefix "" --verbose', {
    stdio: 'inherit',
    cwd: betterSqlite3Path,
    env: env
  });
  
  // 检查是否成功
  const possiblePaths = [
    path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node'),
    path.join(betterSqlite3Path, 'build', 'Debug', 'better_sqlite3.node'),
    path.join(betterSqlite3Path, 'build', 'better_sqlite3.node'),
  ];
  
  for (const nodePath of possiblePaths) {
    if (fs.existsSync(nodePath)) {
      console.log('\n✅ 预编译的二进制文件已下载:', nodePath);
      console.log('\n🎉 better-sqlite3 安装完成！\n');
      process.exit(0);
    }
  }
  
  console.warn('⚠️  prebuild-install 完成，但未找到 .node 文件，尝试编译...\n');
} catch (e) {
  console.warn('⚠️  预编译版本下载失败，尝试从源代码编译...\n');
  console.warn('   错误:', e.message);
}

// 方法 2: 尝试从源代码编译（需要 Visual Studio）
console.log('🔨 方法 2: 尝试从源代码编译...');
try {
  // 设置 Visual Studio 环境变量
  env.GYP_MSVS_VERSION = '2022';
  env.npm_config_msvs_version = '2022';
  
  execSync('npx node-gyp rebuild --release', {
    stdio: 'inherit',
    cwd: betterSqlite3Path,
    env: env
  });
  
  // 检查编译结果
  const buildPath = path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node');
  if (fs.existsSync(buildPath)) {
    console.log('\n✅ 从源代码编译成功:', buildPath);
    console.log('\n🎉 better-sqlite3 安装完成！\n');
    process.exit(0);
  } else {
    throw new Error('编译完成但未找到 .node 文件');
  }
} catch (e) {
  console.error('\n❌ 从源代码编译失败');
  console.error('   错误:', e.message);
  console.error('\n💡 解决方案：');
  console.error('   1. 确保已安装 Visual Studio 2022 或 2019');
  console.error('   2. 确保已安装"使用 C++ 的桌面开发"工作负载');
  console.error('   3. 以管理员权限运行此脚本');
  console.error('   4. 或者使用 SimpleDB 后备方案（应用会自动切换）\n');
  process.exit(1);
}
