/**
 * 下载并解压一个与 bsdiff-node ABI 匹配的 Node 运行时（Windows x64）。
 *
 * 背景：
 * - 你的增量包里 bsdiff-node 是用 NODE_MODULE_VERSION=119 编译的
 * - 你当前用系统 Node v22（NODE_MODULE_VERSION=127）运行 updater.js，会导致原生模块不匹配
 *
 * 解决：
 * - 下载 Node v21（NODE_MODULE_VERSION=119）作为“便携 node.exe”
 * - 放到项目根目录的 node-runtime/ 下，并在 electron-builder extraResources 中带到 resources/node-runtime/
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const NODE_VERSION = process.env.NODE_RUNTIME_VERSION || '21.7.3'
const ARCH = 'win-x64'
const fileName = `node-v${NODE_VERSION}-${ARCH}.zip`
const url = `https://nodejs.org/dist/v${NODE_VERSION}/${fileName}`

const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'node-runtime')
const outNodeExe = path.join(outDir, 'node.exe')

function runPwsh(script) {
  const ps = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'inherit' }
  )
  if (ps.status !== 0) {
    throw new Error(`PowerShell 执行失败，退出码: ${ps.status}`)
  }
}

async function main() {
  console.log('== 下载 Node Runtime（用于 updater） ==')
  console.log('版本:', NODE_VERSION)
  console.log('URL:', url)
  console.log('输出目录:', outDir)

  fs.mkdirSync(outDir, { recursive: true })

  const tmpZip = path.join(os.tmpdir(), `node-runtime-${NODE_VERSION}-${Date.now()}.zip`)
  const tmpExtract = path.join(os.tmpdir(), `node-runtime-extract-${NODE_VERSION}-${Date.now()}`)

  // 1) 下载 zip
  // -UseBasicParsing 在新 PowerShell 中已弃用，但保留兼容；失败可忽略
  runPwsh([
    `$ProgressPreference='SilentlyContinue';`,
    `Write-Host "Downloading to: ${tmpZip}";`,
    `Invoke-WebRequest -Uri "${url}" -OutFile "${tmpZip}" -UseBasicParsing;`
  ].join(' '))

  // 2) 解压
  runPwsh([
    `Write-Host "Extracting to: ${tmpExtract}";`,
    `if (Test-Path "${tmpExtract}") { Remove-Item -Recurse -Force "${tmpExtract}" } ;`,
    `Expand-Archive -Path "${tmpZip}" -DestinationPath "${tmpExtract}" -Force;`
  ].join(' '))

  // 3) 复制 node.exe
  const extractedRoot = path.join(tmpExtract, `node-v${NODE_VERSION}-${ARCH}`)
  const extractedNodeExe = path.join(extractedRoot, 'node.exe')
  if (!fs.existsSync(extractedNodeExe)) {
    throw new Error(`未找到解压后的 node.exe: ${extractedNodeExe}`)
  }

  fs.copyFileSync(extractedNodeExe, outNodeExe)
  console.log('✅ 已生成:', outNodeExe)

  // 4) 清理临时文件（尽力而为）
  try { fs.unlinkSync(tmpZip) } catch {}
  try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch {}

  console.log('\n下一步：')
  console.log('- 确保 package.json 已把 node-runtime 加入 extraResources（resources/node-runtime）')
  console.log('- 重新打包安装包后，updater 将优先使用 resources/node-runtime/node.exe')
}

main().catch((e) => {
  console.error('❌ 下载失败:', e && e.message ? e.message : e)
  process.exit(1)
})

