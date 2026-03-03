// 智能安装 better-sqlite3 脚本
// 自动检测 Visual Studio 并设置正确的环境变量
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔧 正在智能安装 better-sqlite3...\n');

// 检测 Visual Studio 安装路径
function findVisualStudio() {
  const possiblePaths = [
    // Visual Studio 2022
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
    // Visual Studio 2019
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\VC\\Auxiliary\\Build\\vcvars64.bat',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
  ];

  for (const vsPath of possiblePaths) {
    if (fs.existsSync(vsPath)) {
      console.log(`✓ 找到 Visual Studio: ${vsPath}`);
      return vsPath;
    }
  }

  // 尝试通过 vswhere 查找
  try {
    const vswherePath = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe';
    if (fs.existsSync(vswherePath)) {
      const result = execSync(
        `"${vswherePath}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();
      
      if (result) {
        const vcvarsPath = path.join(result, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
        if (fs.existsSync(vcvarsPath)) {
          console.log(`✓ 通过 vswhere 找到 Visual Studio: ${vcvarsPath}`);
          return vcvarsPath;
        }
      }
    }
  } catch (e) {
    // vswhere 查找失败，继续
  }

  return null;
}

// 设置环境变量
function setupEnvironment() {
  const vsPath = findVisualStudio();
  
  if (vsPath) {
    // 设置 node-gyp 环境变量
    process.env.GYP_MSVS_VERSION = '2022'; // 默认使用 2022
    process.env.npm_config_msvs_version = '2022';
    
    // 尝试从路径中提取版本
    if (vsPath.includes('2019')) {
      process.env.GYP_MSVS_VERSION = '2019';
      process.env.npm_config_msvs_version = '2019';
    }
    
    console.log(`✓ 设置 Visual Studio 版本: ${process.env.GYP_MSVS_VERSION}\n`);
  } else {
    console.warn('⚠️  未找到 Visual Studio 安装');
    console.warn('   将尝试使用预编译的二进制文件\n');
  }

  // 设置其他必要的环境变量
  process.env.npm_config_build_from_source = 'false';
  process.env.npm_config_strict_ssl = 'false';
  process.env.npm_config_better_sqlite3_binary_host_mirror = 'https://github.com/WiseLibs/better-sqlite3/releases/download';
  
  // 设置 node-gyp 相关环境变量
  process.env.npm_config_node_gyp = path.join(
    __dirname,
    '..',
    'node_modules',
    '@electron',
    'node-gyp',
    'bin',
    'node-gyp.js'
  );
}

// 尝试安装 better-sqlite3
function installBetterSqlite3() {
  const projectRoot = path.join(__dirname, '..');
  const env = {
    ...process.env,
    npm_config_build_from_source: 'false',
    npm_config_strict_ssl: 'false',
    npm_config_better_sqlite3_binary_host_mirror: 'https://github.com/WiseLibs/better-sqlite3/releases/download',
  };

  // 方法 1: 尝试使用预编译的二进制文件（最快）
  console.log('📦 方法 1: 尝试使用预编译的二进制文件...');
  try {
    execSync('npm install better-sqlite3@^9.2.2 --ignore-scripts', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: env
    });
    
    // 验证安装
    const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
    if (fs.existsSync(betterSqlite3Path)) {
      console.log('\n✅ better-sqlite3 安装成功（使用预编译版本）\n');
      return true;
    }
  } catch (e) {
    console.warn('⚠️  预编译版本安装失败，尝试从源代码编译...\n');
  }

  // 方法 2: 尝试从源代码编译（需要 Visual Studio）
  console.log('🔨 方法 2: 尝试从源代码编译...');
  try {
    // 先清理
    const betterSqlite3Path = path.join(projectRoot, 'node_modules', 'better-sqlite3');
    if (fs.existsSync(betterSqlite3Path)) {
      try {
        fs.rmSync(betterSqlite3Path, { recursive: true, force: true });
      } catch (e) {
        // 忽略清理错误
      }
    }

    // 安装并编译
    execSync('npm install better-sqlite3@^9.2.2 --build-from-source', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: env
    });
    
    console.log('\n✅ better-sqlite3 安装成功（从源代码编译）\n');
    return true;
  } catch (e) {
    console.error('\n❌ 从源代码编译失败');
    console.error('   错误:', e.message);
    return false;
  }
}

// 主函数
function main() {
  try {
    setupEnvironment();
    const success = installBetterSqlite3();
    
    if (!success) {
      console.log('\n⚠️  better-sqlite3 安装失败');
      console.log('   应用将使用 SimpleDB 后备方案');
      console.log('   这不会影响应用的基本功能，但某些数据库功能可能受限\n');
      console.log('💡 要完整支持 SQLite，请确保：');
      console.log('   1. 已安装 Visual Studio 2022 或 2019');
      console.log('   2. 已安装"使用 C++ 的桌面开发"工作负载');
      console.log('   3. 以管理员权限运行此脚本\n');
      process.exit(0); // 不退出，允许应用继续使用 SimpleDB
    }
  } catch (error) {
    console.error('\n❌ 安装过程出错:', error.message);
    console.error('   应用将使用 SimpleDB 后备方案\n');
    process.exit(0); // 不退出，允许应用继续使用 SimpleDB
  }
}

main();
