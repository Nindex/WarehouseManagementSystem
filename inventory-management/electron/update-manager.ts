/**
 * 更新管理器
 * 统一管理增量更新的逻辑和工具函数
 */

import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { createLogger } from '../src/utils/logger'
import { UpdateManifest, DownloadProgressEvent, IncrementalUpdateInfo, CheckIncrementalUpdateResult, DownloadIncrementalUpdateResult, ApplyIncrementalUpdateResult } from '../src/types/incremental-update'

const log = createLogger('update-manager')

// 工具函数：生成友好的时间戳格式
export function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

// 工具函数：简单的版本比较
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const maxLength = Math.max(parts1.length, parts2.length)

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0
    const part2 = parts2[i] || 0
    if (part1 > part2) return 1
    if (part1 < part2) return -1
  }
  return 0
}

// 工具函数：下载文件
export function downloadFile(url: string, destPath: string, onProgress?: (progress: DownloadProgressEvent) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const file = fs.createWriteStream(destPath)

    const request = protocol.get(url, { timeout: 30000 }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        const redirectUrl = response.headers.location!
        const absoluteUrl = redirectUrl.startsWith('http')
          ? redirectUrl
          : new URL(redirectUrl, url).toString()
        return downloadFile(absoluteUrl, destPath, onProgress)
          .then(resolve)
          .catch(reject)
      }

      if (response.statusCode !== 200 && response.statusCode !== 206) {
        reject(new Error(`下载失败: ${response.statusCode}`))
        return
      }

      const total = parseInt(response.headers['content-length'] || '0', 10)
      let transferred = 0

      response.on('data', (chunk) => {
        transferred += chunk.length
        if (onProgress && total > 0) {
          const percent = Math.round((transferred / total) * 100)
          onProgress({
            percent,
            transferred,
            total
          })
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        resolve()
      })

      file.on('error', (err) => {
        fs.unlinkSync(destPath)
        reject(err)
      })
    })

    request.on('error', reject)

    request.on('timeout', () => {
      request.destroy()
      fs.unlinkSync(destPath)
      reject(new Error('下载超时'))
    })

    request.setTimeout(30000)
  })
}

// 工具函数：验证文件哈希
export function verifyFileHash(filePath: string, expectedHash: string): boolean {
  try {
    const content = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    return hash === expectedHash
  } catch (error) {
    log.error('验证文件哈希失败', { filePath, error: String(error) })
    return false
  }
}

// 工具函数：检查文件是否被锁定（Windows）
export async function isFileLockedWindows(filePath: string, maxWaitTime: number = 60000, checkInterval: number = 1000): Promise<boolean> {
  log.info('开始检查文件锁定状态', { filePath, maxWaitTime, checkInterval })

  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const { execSync } = require('child_process')
      
      const script = `
        $file = Get-Item "${filePath.replace(/\\/g, '\\\\')}"
        $locked = $false
        try {
          $stream = $file.Open([System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
          $stream.Close()
        } catch {
          $locked = $true
        }
        if ($locked) { exit 1 } else { exit 0 }
      `
      
      const tempScript = path.join(app.getPath('temp'), `check-lock-${Date.now()}.ps1`)
      fs.writeFileSync(tempScript, script, 'utf8')
      
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, { 
          stdio: 'pipe',
          timeout: 5000 
        })
        log.info('文件已解锁', { filePath })
        return true
      } catch (error: any) {
        if (error.status === 1) {
          log.info('文件仍被锁定，等待中...', { filePath, elapsed: Date.now() - startTime })
          await new Promise(resolve => setTimeout(resolve, checkInterval))
          continue
        }
        log.warn('检查文件锁定状态时出错', { error: error.message })
        return false
      } finally {
        try { fs.unlinkSync(tempScript) } catch (e) {}
      }
    } catch (error: any) {
      log.warn('无法检查文件锁定状态', { error: error.message })
      return false
    }
  }

  log.warn('文件锁定超时', { filePath, maxWaitTime })
  return false
}

// 工具函数：使用 Windows MoveFileEx 进行延迟重命名
export async function scheduleFileReplaceWindows(newFile: string, targetFile: string): Promise<boolean> {
  log.info('安排延迟重命名', { newFile, targetFile })

  try {
    const { execSync } = require('child_process')
    
    const escapePath = (p: string) => p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedNewFile = escapePath(newFile)
    const escapedTargetFile = escapePath(targetFile)
    
    const psScript = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
}
"@
$result = [Win32]::MoveFileEx("${escapedNewFile}", "${escapedTargetFile}", 4)
if (-not $result) {
  $errorCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  Write-Error "MoveFileEx failed with error code: $errorCode"
  exit 1
}
Write-Host "Success: Delayed file replacement scheduled"
`
    
    const tempScript = path.join(app.getPath('temp'), `schedule-replace-${Date.now()}.ps1`)
    fs.writeFileSync(tempScript, psScript, 'utf8')
    
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`, { 
        stdio: 'pipe',
        timeout: 10000 
      })
      log.info('延迟重命名已安排，将在系统重启后生效')
      return true
    } catch (error: any) {
      log.error('安排延迟重命名失败', { error: error.message })
      return false
    } finally {
      try { fs.unlinkSync(tempScript) } catch (e) {}
    }
  } catch (error: any) {
    log.error('安排延迟重命名时出错', { error: error.message })
    return false
  }
}

// 工具函数：安全替换文件
export async function safeReplaceFile(newFile: string, targetFile: string, options: { maxWaitTime?: number; checkInterval?: number; useDelayedReplace?: boolean } = {}): Promise<{ success: boolean; method: string; message?: string }> {
  const {
    maxWaitTime = 60000,
    checkInterval = 1000,
    useDelayedReplace = true
  } = options

  log.info('开始安全替换文件', { targetFile, options })

  if (!fs.existsSync(newFile)) {
    throw new Error(`新文件不存在: ${newFile}`)
  }

  if (!fs.existsSync(targetFile)) {
    log.info('目标文件不存在，直接重命名')
    fs.renameSync(newFile, targetFile)
    return { success: true, method: 'direct' }
  }

  // 方法1: 尝试直接重命名
  try {
    fs.renameSync(newFile, targetFile)
    log.info('直接重命名成功')
    return { success: true, method: 'direct' }
  } catch (error: any) {
    if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') {
      throw error
    }
    log.warn('直接重命名失败，尝试其他方法', { error: error.code })
  }

  // 方法2: 等待文件解锁后重命名（仅 Windows）
  if (process.platform === 'win32') {
    log.info('尝试等待文件解锁...')

    const unlocked = await isFileLockedWindows(targetFile, maxWaitTime, checkInterval)
    if (unlocked) {
      try {
        fs.unlinkSync(targetFile)
        fs.renameSync(newFile, targetFile)
        log.info('等待解锁后替换成功')
        return { success: true, method: 'wait-and-replace' }
      } catch (error: any) {
        log.warn('等待解锁后仍然失败', { error: error.message })
      }
    }

    // 方法3: 使用延迟重命名（如果启用）
    if (useDelayedReplace) {
      log.info('尝试使用延迟重命名...')

      const scheduled = await scheduleFileReplaceWindows(newFile, targetFile)
      if (scheduled) {
        return { 
          success: true, 
          method: 'delayed',
          message: '文件将在系统重启后自动替换，请重启系统以完成更新'
        }
      }
    }

    // 方法4: 复制到临时位置，提示用户手动处理
    const tempDir = path.join(path.dirname(targetFile), 'update-pending')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const tempTarget = path.join(tempDir, path.basename(targetFile))
    fs.copyFileSync(newFile, tempTarget)

    log.warn('无法直接替换，文件已复制到临时位置', { tempTarget })

    throw new Error(
      `无法替换正在使用的文件: ${path.basename(targetFile)}\n` +
      `文件已保存到: ${tempTarget}\n\n` +
      `请按以下步骤操作:\n` +
      `1. 关闭所有正在运行的应用程序\n` +
      `2. 手动将文件从临时位置复制到目标位置\n` +
      `3. 重新启动应用程序\n\n` +
      `或者重启系统以完成更新。`
    )
  } else {
    // 非 Windows 系统，抛出原始错误
    throw new Error(`无法替换文件 ${path.basename(targetFile)}: 文件可能被锁定。请关闭应用程序后重试。`)
  }
}

/**
 * 更新管理器类
 */
export class UpdateManager {
  private mainWindow: BrowserWindow | null = null
  private updateServerUrl: string = ''
  private incrementalUpdatePackagePath: string = ''

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow
  }

  // 设置更新服务器地址
  setUpdateServerUrl(url: string): void {
    this.updateServerUrl = url.trim()
    log.info('更新服务器地址已设置', { url: this.updateServerUrl })
  }

  // 获取更新服务器地址
  getUpdateServerUrl(): string {
    return this.updateServerUrl
  }

  // 检查增量更新
  async checkIncrementalUpdate(currentVersion: string): Promise<CheckIncrementalUpdateResult> {
    if (!this.updateServerUrl) {
      return { available: false, error: '未配置更新服务器' }
    }

    try {
      const baseUrl = this.updateServerUrl.replace(/\/$/, '')
      const checkUrl = `${baseUrl}/api/updates/${currentVersion}`

      log.info('检查增量更新', { currentVersion, checkUrl })

      const response = await fetch(checkUrl)
      const data = await response.json()

      if (data.success && data.update) {
        log.info('发现增量更新', {
          fromVersion: data.update.fromVersion,
          toVersion: data.update.toVersion
        })

        const info: IncrementalUpdateInfo = {
          fromVersion: data.update.fromVersion,
          toVersion: data.update.toVersion,
          packageSize: data.update.package.size / (1024 * 1024),
          totalFiles: Object.keys(data.update.fileManifest).length,
          changes: data.update.changes,
          releaseNotes: Array.isArray(data.update.changelog) ? data.update.changelog.join('\n• ') : data.update.changelog,
          estimatedTime: Math.ceil(data.update.package.size / (1024 * 1024))
        }

        return { available: true, update: data.update, info }
      }

      return { available: false }
    } catch (error: any) {
      log.error('检查增量更新失败', { error: String(error) })
      return { available: false, error: error.message }
    }
  }

  // 下载增量更新包
  async downloadIncrementalPackage(manifest: UpdateManifest): Promise<DownloadIncrementalUpdateResult> {
    try {
      if (!this.updateServerUrl) {
        return { success: false, error: '未配置更新服务器' }
      }

      // 获取应用安装目录
      let appDir: string
      if (app && app.isReady()) {
        appDir = path.dirname(app.getPath('exe'))
      } else {
        appDir = path.dirname(process.execPath)
      }

      // 创建更新目录
      const updateDir = path.join(appDir, 'update')
      if (!fs.existsSync(updateDir)) {
        fs.mkdirSync(updateDir, { recursive: true })
      }

      const packagePath = path.join(updateDir, manifest.package.name)
      const baseUrl = this.updateServerUrl.replace(/\/$/, '')
      const downloadUrl = `${baseUrl}/api/download/${manifest.package.name}`

      log.info('下载增量更新包', { downloadUrl, packagePath })

      // 下载文件
      await downloadFile(downloadUrl, packagePath, (progress) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('incremental-update-progress', progress)
        }
      })

      log.info('增量包下载完成')

      // 验证包哈希
      if (!verifyFileHash(packagePath, manifest.package.hash)) {
        fs.unlinkSync(packagePath)
        throw new Error('包哈希验证失败')
      }

      // 保存包路径
      this.incrementalUpdatePackagePath = packagePath

      // 通知前端下载完成
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('incremental-update-downloaded', {
          toVersion: manifest.toVersion,
          packagePath: packagePath
        })
      }

      return { success: true }
    } catch (error: any) {
      log.error('下载增量更新包失败', { error: String(error) })
      return { success: false, error: error.message }
    }
  }

  // 应用增量更新（准备独立更新程序）
  async applyIncrementalUpdate(manifest: UpdateManifest): Promise<ApplyIncrementalUpdateResult> {
    try {
      log.info('开始准备独立更新', { toVersion: manifest.toVersion })

      // 获取应用路径
      const appPath = app.getPath('exe')
      const appDir = path.dirname(appPath)

      // 创建更新信息文件
      const updateInfo = {
        packagePath: this.incrementalUpdatePackagePath,
        manifest: manifest,
        appPath: appPath,
        appDir: appDir,
        timestamp: new Date().toISOString()
      }

      // 保存到临时文件
      const tempDir = app.getPath('temp')
      const updateInfoPath = path.join(tempDir, `update-info-${Date.now()}.json`)

      fs.writeFileSync(updateInfoPath, JSON.stringify(updateInfo, null, 2), 'utf-8')
      log.info('更新信息已保存', { updateInfoPath })

      // 启动更新程序 - 使用多个候选路径查找 updater.js
      const updaterScriptCandidates = [
        // 开发环境优先：相对于项目根目录
        path.join(process.cwd(), 'scripts', 'updater.js'),
        path.resolve(process.cwd(), 'scripts', 'updater.js'),
        // 相对于当前文件位置
        path.join(__dirname, '..', 'scripts', 'updater.js'),
        path.resolve(__dirname, '..', 'scripts', 'updater.js'),
        // 打包后的路径
        path.join(process.resourcesPath, 'scripts', 'updater.js'),
        path.join(process.resourcesPath, 'app', 'scripts', 'updater.js'),
        path.join(process.resourcesPath, 'app.asar', 'scripts', 'updater.js'),
        // 应用目录下的路径
        path.join(appDir, 'resources', 'scripts', 'updater.js'),
        path.join(appDir, 'scripts', 'updater.js'),
      ]

      // 查找存在的 updater.js 文件
      let updaterScript: string | null = null
      for (const candidate of updaterScriptCandidates) {
        try {
          if (fs.existsSync(candidate)) {
            updaterScript = candidate
            log.info('找到更新程序', { path: candidate })
            break
          }
        } catch (e) {
          // 忽略检查错误，继续下一个候选路径
        }
      }

      if (!updaterScript) {
        log.error('更新程序未找到', { candidates: updaterScriptCandidates })
        throw new Error(`更新程序不存在，已尝试以下路径：\n${updaterScriptCandidates.join('\n')}`)
      }

      log.info('启动更新程序', { updaterScript, updateInfoPath })

      // 确定使用哪个 Node.js 来运行更新程序
      // 优先使用随应用发布的 node-runtime（Node 21 / ABI 119），再尝试 Electron 内置 node.exe，最后才用系统 node
      let nodeExecutable: string = 'node' // 最后兜底：系统的 node
      const electronPath = app.getPath('exe')
      const electronDir = path.dirname(electronPath)
      
      // 1) 优先：resources/node-runtime/node.exe（我们打包进 extraResources）
      const packagedNodeCandidates = [
        path.join(process.resourcesPath, 'node-runtime', 'node.exe'),
        path.join(appDir, 'resources', 'node-runtime', 'node.exe'),
        path.join(electronDir, 'resources', 'node-runtime', 'node.exe'),
      ]
      for (const p of packagedNodeCandidates) {
        try {
          if (fs.existsSync(p)) {
            nodeExecutable = p
            log.info('找到随应用发布的 Node Runtime', { path: p })
            break
          }
        } catch {}
      }

      // 尝试查找 Electron 内置的 Node.js
      const electronNodePaths = [
        path.join(process.resourcesPath, 'node.exe'), // Windows
        path.join(electronDir, 'node.exe'), // Windows 便携版
        path.join(process.resourcesPath, 'node'), // Linux/Mac
        path.join(electronDir, 'node'), // Linux/Mac 便携版
      ]
      
      let foundNode = false
      // 2) 如果没有 node-runtime，再尝试 Electron 内置 node.exe
      if (nodeExecutable === 'node') {
        for (const nodePath of electronNodePaths) {
          if (fs.existsSync(nodePath)) {
            nodeExecutable = nodePath
            foundNode = true
            log.info('找到 Electron 内置 Node.js', { path: nodePath })
            break
          }
        }
      }
      
      // 如果找不到 Electron 内置的 Node.js，使用系统的 node（已经是默认值）
      if (!foundNode) {
        if (nodeExecutable === 'node') {
          log.info('使用系统 Node.js')
        }
      }

      // 使用 spawn 启动更新程序
      const { spawn } = require('child_process')
      const isWindows = process.platform === 'win32'
      
      // 创建日志文件路径用于调试
      const logDir = path.join(appDir, 'logs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      const updaterLogPath = path.join(logDir, `updater-${Date.now()}.log`)
      
      log.info('启动更新程序进程', { 
        nodeExecutable, 
        updaterScript, 
        updateInfoPath,
        logPath: updaterLogPath
      })

      // 设置 NODE_PATH 以便 updater.js 能找到 node_modules
      const nodePaths = [
        path.join(process.resourcesPath, 'app.asar', 'node_modules'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        path.join(process.resourcesPath, 'app', 'node_modules'),
        path.join(appDir, 'resources', 'app.asar', 'node_modules'),
        path.join(appDir, 'resources', 'app.asar.unpacked', 'node_modules'),
        process.env.NODE_PATH || ''
      ].filter(Boolean).join(path.delimiter)

      log.info('设置更新程序环境变量', { 
        NODE_PATH: nodePaths,
        NODE_ENV: 'production'
      })

      const updaterProcess = spawn(nodeExecutable, [updaterScript, updateInfoPath], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'], // 捕获输出以便调试
        cwd: path.dirname(updaterScript),
        shell: isWindows, // Windows 上可能需要 shell
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NODE_PATH: nodePaths
        }
      })

      // 将输出写入日志文件
      const logStream = fs.createWriteStream(updaterLogPath, { flags: 'a' })
      updaterProcess.stdout?.on('data', (data: Buffer) => {
        logStream.write(data)
        log.info('更新程序输出', { data: data.toString().trim() })
      })
      updaterProcess.stderr?.on('data', (data: Buffer) => {
        logStream.write(data)
        log.warn('更新程序错误输出', { data: data.toString().trim() })
      })

      let processStarted = false
      let processError: Error | null = null

      updaterProcess.on('error', (error: any) => {
        processError = error
        log.error('启动更新程序失败', { error: String(error), stack: error.stack })
        logStream.end()
        // 错误会被在下面的检查中处理
      })

      updaterProcess.on('spawn', () => {
        processStarted = true
        log.info('更新程序进程已启动', { pid: updaterProcess.pid })
        // 不立即关闭日志流，让进程继续写入，直到进程退出
      })

      updaterProcess.on('exit', (code: number, signal: string) => {
        logStream.end()
        log.info('更新程序进程退出', { code, signal, pid: updaterProcess.pid })
        
        // 如果退出码不为0，记录警告但不阻止主应用退出
        // 因为更新程序可能已经部分完成工作
        if (code !== 0 && code !== null) {
          log.warn('更新程序异常退出', { 
            code, 
            signal,
            logPath: updaterLogPath,
            message: '请查看更新程序日志文件以获取详细信息'
          })
        }
      })

      // 等待一小段时间确保进程启动成功
      await new Promise((resolve) => setTimeout(resolve, 1000))
      
      // 检查进程是否启动失败
      if (!processStarted) {
        if (processError) {
          log.error('更新程序启动失败', { error: processError })
          throw processError
        } else {
          // 如果进程立即退出，检查退出码
          if (updaterProcess.exitCode !== null) {
            const exitCode = updaterProcess.exitCode
            log.warn('更新程序立即退出', { 
              exitCode,
              logPath: updaterLogPath,
              message: '更新程序可能遇到了错误，请查看日志文件'
            })
            // 不抛出错误，让更新程序自己处理错误并记录日志
          }
        }
      }

      // 释放更新程序进程（使其独立运行）
      updaterProcess.unref()

      // 通知前端更新程序已启动
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-applied', {
          fromVersion: manifest.fromVersion,
          toVersion: manifest.toVersion,
          success: true,
          message: '更新程序已启动，应用即将退出进行更新...'
        })
      }

      // 延迟退出主应用，给用户一些时间看到消息
      setTimeout(() => {
        log.info('主应用退出，开始更新')
        app.quit()
      }, 3000)

      return {
        success: true,
        restarted: false
      }

    } catch (error: any) {
      log.error('准备独立更新失败', { error: String(error) })
      return {
        success: false,
        error: error.message || '准备独立更新失败'
      }
    }
  }

  // 获取增量更新包路径
  getIncrementalPackagePath(): string {
    return this.incrementalUpdatePackagePath
  }
}
