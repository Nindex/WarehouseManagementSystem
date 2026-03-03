// 修复 better-sqlite3 绑定文件问题
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 修复 better-sqlite3 绑定文件...\n');

const projectRoot = path.join(__dirname, '..');

// 设置环境变量
const env = {
  ...process.env,
  npm_config_build_from_source: 'true', // 强制从源码编译
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
      console.log(`📝 使用配置的 Python: ${config.pythonPath}\n`);
    }
  }
} catch (e) {
  // 忽略
}

// 如果配置文件中没有，尝试从环境变量获取
if (!env.PYTHON && process.env.PYTHON) {
  env.PYTHON = process.env.PYTHON;
  console.log(`📝 使用环境变量中的 Python: ${env.PYTHON}\n`);
}

const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');

// 检查 better-sqlite3 是否已安装
if (!fs.existsSync(betterSqlite3Path)) {
  console.log('❌ better-sqlite3 未安装，请先运行: npm install better-sqlite3\n');
  process.exit(1);
}

console.log('📦 步骤 1: 清理旧的构建文件...\n');
try {
  const buildPath = path.join(betterSqlite3Path, 'build');
  if (fs.existsSync(buildPath)) {
    fs.rmSync(buildPath, { recursive: true, force: true });
    console.log('✅ 已清理旧的构建文件\n');
  }
} catch (e) {
  console.log('⚠️  清理构建文件时出错，继续...\n');
}

console.log('📦 步骤 2: 重新编译 better-sqlite3...\n');

// 方法 1: 尝试使用 node-gyp 直接编译
try {
  console.log('尝试方法 1: 使用 node-gyp 编译...\n');
  execSync('npx node-gyp rebuild', {
    stdio: 'inherit',
    cwd: betterSqlite3Path,
    env: env
  });
  console.log('\n✅ node-gyp 编译成功！\n');
} catch (e) {
  console.log('\n⚠️  node-gyp 编译失败，尝试 electron-rebuild...\n');
  
  // 方法 2: 尝试使用 electron-rebuild
  try {
    console.log('尝试方法 2: 使用 electron-rebuild 编译...\n');
    execSync('npx electron-rebuild -f -w better-sqlite3', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: env
    });
    console.log('\n✅ electron-rebuild 编译成功！\n');
  } catch (e2) {
    console.log('\n⚠️  electron-rebuild 也失败，尝试重新安装...\n');
    
    // 方法 3: 重新安装并编译
    try {
      console.log('尝试方法 3: 重新安装 better-sqlite3 并编译...\n');
      
      // 删除 better-sqlite3
      fs.rmSync(betterSqlite3Path, { recursive: true, force: true });
      
      // 重新安装
      execSync('npm install better-sqlite3@^9.2.2 --save', {
        stdio: 'inherit',
        cwd: projectRoot,
        env: env
      });
      
      console.log('\n✅ better-sqlite3 重新安装完成！\n');
    } catch (e3) {
      console.error('\n❌ 所有方法都失败了');
      console.error('   错误:', e3.message);
      console.error('\n💡 请检查：');
      console.error('   1. Python 3.9/3.10/3.11 已正确安装');
      console.error('   2. Visual Studio 2022 C++ 工具集已安装');
      console.error('   3. 运行: npm run check:python 和 npm run check:vs\n');
      process.exit(1);
    }
  }
}

// 验证编译结果
console.log('📦 步骤 3: 验证编译结果...\n');
const possiblePaths = [
  path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node'),
  path.join(betterSqlite3Path, 'build', 'Debug', 'better_sqlite3.node'),
  path.join(betterSqlite3Path, 'build', 'better_sqlite3.node'),
];

let found = false;
for (const nodePath of possiblePaths) {
  if (fs.existsSync(nodePath)) {
    console.log(`✅ 找到绑定文件: ${nodePath}\n`);
    found = true;
    break;
  }
}

if (!found) {
  console.log('⚠️  未找到编译后的绑定文件');
  console.log('   但可能在其他位置，请运行测试: npm run test:sqlite\n');
} else {
  console.log('🎉 better-sqlite3 修复完成！\n');
  console.log('💡 请运行测试验证: npm run test:sqlite\n');
}

process.exit(0);
