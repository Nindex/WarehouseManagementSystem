import { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } from 'electron'
import Module from 'module'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import bcrypt from 'bcryptjs'
import { createLogger, Logger } from '../src/utils/logger'
import { pathToFileURL } from 'url'
import { fileURLToPath } from 'url'
import * as simple from './database/simple'
import { simpleDB } from './database/simple'
import { autoUpdater } from 'electron-updater'
// 暂时移除未实现的主进程API依赖，保留窗口与基础IPC

// 开发模式：抑制 Electron 安全警告（仅在开发模式下）
if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}

// 全局错误处理：捕获并忽略 bluebird 相关的非致命错误
process.on('uncaughtException', (error: Error) => {
  const errorMsg = error.message || String(error)
  const errorStack = error.stack || ''

  // 检查是否是 bluebird 相关的错误（包括 util.js:420 和 async.js:3）
  const isBluebirdError =
    errorMsg.includes('bluebird') ||
    errorStack.includes('bluebird') ||
    errorStack.includes('util.js:420') ||
    errorStack.includes('async.js:3') ||
    errorStack.includes('bluebird/js/release') ||
    errorStack.includes('bluebird\\js\\release')

  if (isBluebirdError) {
    // bluebird 模块在加载时会故意抛出错误来捕获堆栈信息，这是正常行为
    // 但如果错误没有被正确捕获，我们在这里忽略它
    console.warn('⚠️  Bluebird module loading warning (non-fatal, ignoring)')
    // 不退出进程，继续运行
    return
  }

  // 其他错误正常处理
  console.error('❌ Uncaught Exception:', error)
  log.error('Uncaught exception', { error: errorMsg, stack: errorStack })
  // 可以选择是否退出
  // process.exit(1)
})

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  const reasonMsg = String(reason)
  const reasonStack = reason?.stack || ''

  // 检查是否是 bluebird 相关的错误
  const isBluebirdError =
    reasonMsg.includes('bluebird') ||
    reasonStack.includes('bluebird') ||
    reasonStack.includes('util.js:420') ||
    reasonStack.includes('async.js:3') ||
    reasonStack.includes('bluebird/js/release') ||
    reasonStack.includes('bluebird\\js\\release')

  if (isBluebirdError) {
    console.warn('⚠️  Bluebird unhandled rejection (non-fatal, ignoring)')
    return
  }

  console.error('❌ Unhandled Rejection:', reason)
  log.error('Unhandled rejection', { reason: reasonMsg, stack: reasonStack })
})

const log = createLogger('main')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
let squirrelStartup: any
try {
  squirrelStartup = require('electron-squirrel-startup')
} catch { }
if (squirrelStartup) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let sqlite: any | null = null
let useSimpleDB = process.env.USE_SIMPLE_DB === '1'
let updateCheckInterval: NodeJS.Timeout | null = null
// electron-updater 配置
let autoUpdaterInitialized = false

// 初始化 electron-updater
function initializeAutoUpdater() {
  if (autoUpdaterInitialized) {
    return
  }

  const updateServerUrl = getUpdateServerUrl()
  if (!updateServerUrl || !updateServerUrl.trim()) {
    log.info('未配置更新服务器，跳过初始化 electron-updater')
    return
  }

  // 配置更新服务器 URL
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: updateServerUrl.replace(/\/$/, '')
  })

  // 配置自动下载
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  // 监听更新检查中
  autoUpdater.on('checking-for-update', () => {
    log.info('electron-updater: 检查更新中...')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking')
    }
  })

  // 监听发现更新
  autoUpdater.on('update-available', (info) => {
    log.info('electron-updater: 发现新版本', { version: info.version })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || '',
        releaseDate: info.releaseDate
      })
    }
  })

  // 监听无更新
  autoUpdater.on('update-not-available', (info) => {
    log.info('electron-updater: 当前已是最新版本', { version: info.version })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version
      })
    }
  })

  // 监听下载进度
  autoUpdater.on('download-progress', (progress) => {
    log.info('electron-updater: 下载进度', { 
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total
    })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total
      })
    }
  })

  // 监听下载完成
  autoUpdater.on('update-downloaded', (info) => {
    log.info('electron-updater: 更新下载完成', { version: info.version })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes || ''
      })
    }
  })

  // 监听错误
  autoUpdater.on('error', (error) => {
    log.error('electron-updater: 更新错误', { error: error.message, stack: error.stack })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        error: error.message || '更新检查失败'
      })
    }
  })

  autoUpdaterInitialized = true
  log.info('electron-updater 初始化完成', { updateServerUrl })
}

function loadBetterSqlite3(): any | null {
  // 优先从 app.asar.unpacked 加载（打包后的应用）
  try {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')
    if (fs.existsSync(unpackedPath)) {
      log.info('Attempting to load better-sqlite3 from app.asar.unpacked', { unpackedPath })

      // 确保 bindings 及其依赖模块也能被找到
      const unpackedModulesPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
      const requiredModules = ['bindings', 'file-uri-to-path']

      for (const moduleName of requiredModules) {
        const modulePath = path.join(unpackedModulesPath, moduleName)
        if (fs.existsSync(modulePath)) {
          // 将模块路径添加到 NODE_PATH
          if (!process.env.NODE_PATH) {
            process.env.NODE_PATH = unpackedModulesPath
          } else if (!process.env.NODE_PATH.includes(unpackedModulesPath)) {
            process.env.NODE_PATH = unpackedModulesPath + path.delimiter + process.env.NODE_PATH
          }
          log.info(`Found ${moduleName} module in app.asar.unpacked`, { modulePath })
        } else {
          log.warn(`${moduleName} module not found in app.asar.unpacked`, { modulePath })
        }
      }

      // 重新初始化模块路径
      if (process.env.NODE_PATH) {
        ; (Module as any)._initPaths()
        log.info('Updated NODE_PATH', { nodePath: process.env.NODE_PATH })
      }

      // 在 require 之前，先设置 .node 文件路径
      if (!process.env.BETTER_SQLITE3_BINARY_PATH) {
        const possibleNodePaths = [
          path.join(unpackedPath, 'build', 'Release', 'better_sqlite3.node'),
          path.join(unpackedPath, 'build', 'Debug', 'better_sqlite3.node'),
          path.join(unpackedPath, 'build', 'better_sqlite3.node'),
        ]
        for (const nodePath of possibleNodePaths) {
          if (fs.existsSync(nodePath)) {
            process.env.BETTER_SQLITE3_BINARY_PATH = nodePath
            log.info('Set BETTER_SQLITE3_BINARY_PATH before require', { nodePath })
            break
          }
        }
      }

      // 尝试直接 require
      try {
        const sqlite3 = require(unpackedPath)
        log.info('Successfully loaded better-sqlite3 from app.asar.unpacked')
        return sqlite3
      } catch (e2) {
        log.warn('Direct require failed', { error: String(e2), stack: (e2 as Error).stack })
        // 如果直接 require 失败，尝试从 lib/index.js 加载
        const indexPath = path.join(unpackedPath, 'lib', 'index.js')
        if (fs.existsSync(indexPath)) {
          try {
            const sqlite3 = require(indexPath)
            log.info('Successfully loaded better-sqlite3 from lib/index.js')
            return sqlite3
          } catch (e3) {
            log.warn('Failed to load from lib/index.js', { error: String(e3), stack: (e3 as Error).stack })
          }
        }
      }
    } else {
      // 开发模式下 app.asar.unpacked 不存在是正常的，静默跳过
      if (process.env.NODE_ENV === 'production' || process.resourcesPath.includes('app.asar')) {
        log.warn('app.asar.unpacked path does not exist', { unpackedPath, resourcesPath: process.resourcesPath })
      }
    }
  } catch (e) {
    log.warn('Failed to load better-sqlite3 from app.asar.unpacked', { error: String(e), stack: (e as Error).stack })
  }

  // 开发模式下从 node_modules 加载
  try {
    // 使用 try-catch 包装，即使 bluebird 出错也继续加载 better-sqlite3
    const sqlite3 = require('better-sqlite3')
    log.info('数据库模块加载成功')
    return sqlite3
  } catch (e: any) {
    // 检查是否是 bluebird 相关的错误
    const errorMsg = String(e)
    const errorStack = e.stack || ''

    if (errorMsg.includes('bluebird') || errorStack.includes('bluebird')) {
      log.warn('Bluebird error detected during better-sqlite3 load, attempting to ignore', {
        error: errorMsg,
        note: 'This is likely a non-fatal warning from a dependency'
      })

      // 尝试直接加载 better-sqlite3，忽略 bluebird 错误
      try {
        // 清除模块缓存中的 bluebird（如果存在）
        const bluebirdPath = require.resolve('bluebird')
        delete (require.cache as any)[bluebirdPath]
      } catch { }

      // 再次尝试加载 better-sqlite3
      try {
        const sqlite3 = require('better-sqlite3')
        log.info('Loaded better-sqlite3 after ignoring bluebird error')
        return sqlite3
      } catch (e2) {
        log.warn('Failed to load better-sqlite3 after bluebird error', { error: String(e2) })
      }
    } else {
      log.warn('Failed to load better-sqlite3 from node_modules', { error: errorMsg })
    }
  }

  log.error('better-sqlite3 not available in any location', {
    resourcesPath: process.resourcesPath,
    unpackedPath: path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')
  })
  return null
}

function getDbPath() {
  // 数据库必须存储在安装目录下的 data 文件夹
  // 如果安装目录不可写（如 Program Files），直接报错提示用户，不回退
  let dataDir: string

  try {
    // 获取安装目录（exe 所在目录）
    let baseDir: string
    if (app && app.isReady()) {
      baseDir = path.dirname(app.getPath('exe'))
    } else {
      baseDir = path.dirname(process.execPath)
    }
    
    // 使用安装目录下的 data 文件夹
    const installDataDir = path.join(path.resolve(baseDir), 'data')
    
    // 测试目录是否可写
    try {
      if (!fs.existsSync(installDataDir)) {
        fs.mkdirSync(installDataDir, { recursive: true })
      }
      // 写入测试文件验证权限
      const testFile = path.join(installDataDir, '.write-test')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      
      // 可写，使用安装目录
      dataDir = installDataDir
      log.info('使用安装目录存储数据库', { dataDir })
    } catch (writeError: any) {
      // 不可写（如 Program Files），直接报错退出
      log.error('安装目录不可写', { installDir: installDataDir, error: String(writeError) })
      
      const isPermissionError = writeError.code === 'EPERM' || writeError.code === 'EACCES'
      const errorMessage = `无法在安装目录创建数据库文件夹：${installDataDir}\n\n` +
        `原因：${isPermissionError ? '权限不足（如安装在 Program Files 等系统目录）' : String(writeError.message || writeError)}\n\n` +
        `解决方案：\n` +
        `1. 将程序安装到用户有写权限的目录（如 D:\\仓库管理系统）\n` +
        `2. 或以管理员身份运行程序`
      
      // 同步显示错误对话框（确保用户能看到）
      try {
        if (app && app.isReady()) {
          dialog.showErrorBox('数据库初始化失败', errorMessage)
        } else {
          // app 未就绪时，使用控制台输出并延迟退出
          console.error('数据库初始化失败:', errorMessage)
        }
      } catch (dialogError) {
        console.error('数据库初始化失败:', errorMessage)
      }
      
      // 抛出错误阻止程序继续启动
      throw new Error(errorMessage)
    }
  } catch (e: any) {
    // 如果是我们已经处理过的错误（带有解决方案的），直接抛出
    if (e.message && e.message.includes('解决方案')) {
      throw e
    }
    
    // 其他错误（如获取安装目录失败）
    log.error('获取安装目录失败', { error: String(e) })
    throw new Error(`无法确定安装目录：${String(e.message || e)}`)
  }

  // 确保 dataDir 是绝对路径且规范化
  dataDir = path.resolve(dataDir)

  // 不再迁移旧数据库 - 如果安装目录没有数据库，就创建新的
  // 旧数据库保留在 userData 目录，用户可手动迁移

  const dbPath = path.join(dataDir, 'inventory.db')
  log.info('数据库路径已确定', { dbPath })
  return dbPath
}

function ensureLogWritable() {
  const baseDir = path.dirname(process.execPath)
  const logDir = path.join(baseDir, 'logs')
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    fs.accessSync(logDir, fs.constants.W_OK)
  } catch (e) {
    require('electron').dialog.showErrorBox('日志目录不可写', `无法写入: ${logDir}\n请将程序放在具有写权限的目录后重试。`)
    app.quit()
  }
}

function ensureDatabase() {
  if (useSimpleDB) {
    log.warn('Using SimpleDB mode, SQLite database will not be created')
    return null
  }
  if (sqlite) return sqlite

  const dbPath = getDbPath()
  const dir = path.dirname(dbPath)

  // 确保目录存在且可写（getDbPath 已经验证过，这里再次确认）
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      // 数据目录已创建（静默）
    }
    // 再次验证目录可写
    const testFile = path.join(dir, '.write-test')
    fs.writeFileSync(testFile, 'test')
    fs.unlinkSync(testFile)
  } catch (dirError) {
    log.error('Data directory is not writable', { dir, error: String(dirError) })
    const errorMsg = `数据目录不可写: ${dir}\n请确保程序安装在具有写权限的目录，或以管理员权限运行。`
    require('electron').dialog.showErrorBox('数据库初始化失败', errorMsg)
    throw new Error(errorMsg)
  }

  const BetterSqlite3 = loadBetterSqlite3()
  if (!BetterSqlite3) {
    log.error('better-sqlite3 unavailable, switching to simple DB', {
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      __dirname
    })
    useSimpleDB = true
    return null
  }

  try {
    sqlite = new BetterSqlite3(dbPath)
    log.info('数据库已打开')

    // 确保数据库文件已创建
    if (!fs.existsSync(dbPath)) {
      log.error('Database file was not created after opening', { dbPath })
      throw new Error(`数据库文件未创建: ${dbPath}`)
    }

    sqlite.pragma('foreign_keys = ON')

    // 执行一个简单查询来验证数据库可用
    sqlite.prepare('SELECT 1').get()
    // 数据库连接已验证（静默）

    return sqlite
  } catch (err: any) {
    log.error('Failed to open database', { dbPath, error: String(err), stack: err.stack })
    sqlite = null
    const errorMsg = `数据库初始化失败: ${String(err)}`
    require('electron').dialog.showErrorBox('数据库错误', errorMsg)
    throw new Error(errorMsg)
  }
}

function transformSchema(sql: string) {
  let s = sql
  s = s.replace(/CREATE\s+TABLE\s+/gi, 'CREATE TABLE IF NOT EXISTS ')
  s = s.replace(/CREATE\s+INDEX\s+/gi, 'CREATE INDEX IF NOT EXISTS ')
  return s
}

function transformSeed(sql: string) {
  return sql.replace(/INSERT\s+INTO\s+/gi, 'INSERT OR IGNORE INTO ')
}

function applySchema(db: any, candidates: string[]) {
  log.info('Looking for schema file', { candidates })
  const p = candidates.find((x) => {
    try {
      const exists = fs.existsSync(x)
      if (exists) {
        log.info('Found schema file', { path: x })
      }
      return exists
    } catch (e) {
      log.warn('Error checking schema file', { path: x, error: String(e) })
      return false
    }
  })
  if (!p) {
    const error = new Error(`Schema file not found in any candidate path: ${candidates.join(', ')}`)
    log.error('Schema file not found', { candidates })
    throw error
  }
  try {
    const sql = fs.readFileSync(p, 'utf8')
    log.info('Reading schema file', { path: p, size: sql.length })
    const transformedSql = transformSchema(sql)
    log.info('Executing schema SQL', { statements: transformedSql.split(';').filter(s => s.trim()).length })
    db.exec(transformedSql)
    log.info('Schema applied successfully', { path: p })

    // 验证表是否创建成功
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    log.info('Database tables after schema application', { tables: tables.map((t: any) => t.name) })
  } catch (err: any) {
    log.error('Failed to apply schema', { path: p, error: String(err), stack: err.stack })
    throw err
  }
}

function applySeed(db: any, candidates: string[]) {
  log.info('Looking for seed file', { candidates })
  const p = candidates.find((x) => {
    try {
      const exists = fs.existsSync(x)
      if (exists) {
        log.info('Found seed file', { path: x })
      }
      return exists
    } catch (e) {
      log.warn('Error checking seed file', { path: x, error: String(e) })
      return false
    }
  })
  if (!p) {
    log.warn('Seed file not found in any candidate path (this is optional)', { candidates })
    return
  }
  try {
    const sql = fs.readFileSync(p, 'utf8')
    log.info('Reading seed file', { path: p, size: sql.length })
    const transformedSql = transformSeed(sql)
    db.exec(transformedSql)
    log.info('Seed data applied successfully', { path: p })
  } catch (err: any) {
    log.error('Failed to apply seed data', { path: p, error: String(err), stack: err.stack })
    // Seed 数据失败不应该阻止应用启动
    log.warn('Continuing despite seed data failure')
  }
}

function applySqlFile(db: any, candidates: string[]) {
  const p = candidates.find((x) => { try { return fs.existsSync(x) } catch { return false } })
  if (!p) return
  const sql = fs.readFileSync(p, 'utf8')
  db.exec(sql)
  log.info('sql file applied')
}

const createWindow = () => {
  // Create the browser window.
  // 从数据库读取显示模式设置
  // displayMode: 'windowed' | 'fullscreen' | 'windowed-fullscreen'
  // 默认使用窗口化全屏
  let displayMode: 'windowed' | 'fullscreen' | 'windowed-fullscreen' = 'windowed-fullscreen'
  try {
    const db = ensureDatabase()
    if (db) {
      const result = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('displayMode') as { value: string } | undefined
      if (result?.value) {
        displayMode = result.value as 'windowed' | 'fullscreen' | 'windowed-fullscreen'
      }
      log.info('读取显示模式设置:', { displayMode })
    }
  } catch (error) {
    log.warn('读取显示模式设置失败，使用默认值(窗口化全屏):', error)
  }

  // 根据显示模式设置窗口参数
  const isFullscreen = displayMode === 'fullscreen'
  const isWindowedFullscreen = displayMode === 'windowed-fullscreen'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    fullscreen: isFullscreen,
    // 窗口化全屏：最大化窗口但不进入全屏模式
    ...(isWindowedFullscreen && {
      width: 1920,
      height: 1080,
    }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 开发模式：禁用 webSecurity 以便调试（打包后会自动启用）
      // 注意：这些设置仅在开发模式下使用，生产环境会自动应用更严格的安全策略
      webSecurity: !app.isPackaged && process.env.NODE_ENV === 'development' ? false : true,
      // 禁用后台节流，防止程序无响应
      backgroundThrottling: false,
    },
    icon: path.join(__dirname, '../assets/icon.ico'),
    titleBarStyle: 'default',
    // 生产模式下自动隐藏菜单栏
    autoHideMenuBar: app.isPackaged && process.env.NODE_ENV !== 'development',
    // 先不显示窗口，等加载完成后再显示，避免加载时卡顿
    show: false,
  })

  // 禁用程序无响应对话框
  mainWindow.webContents.on('unresponsive', () => {
    log.warn('窗口无响应，但继续运行', {
      isDestroyed: mainWindow?.isDestroyed(),
      isVisible: mainWindow?.isVisible()
    })
  })

  mainWindow.webContents.on('responsive', () => {
    log.info('窗口已恢复响应', {
      isDestroyed: mainWindow?.isDestroyed(),
      isVisible: mainWindow?.isVisible()
    })
  })

  // 监听渲染进程崩溃
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('渲染进程崩溃', {
      reason: details.reason,
      exitCode: details.exitCode,
      killed: details.reason === 'killed',
      isDestroyed: mainWindow?.isDestroyed()
    })
  })

  // 监听页面崩溃
  mainWindow.webContents.on('crashed', (_event, killed) => {
    log.error('页面崩溃', {
      killed,
      isDestroyed: mainWindow?.isDestroyed()
    })
  })

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      // 如果是窗口化全屏模式，最大化窗口
      if (displayMode === 'windowed-fullscreen') {
        mainWindow.maximize()
        log.info('窗口化全屏模式：最大化窗口')
      }
      
      mainWindow.show()
      log.info('主窗口已显示', {
        isVisible: mainWindow.isVisible(),
        isFocused: mainWindow.isFocused(),
        isDestroyed: mainWindow.isDestroyed(),
        displayMode
      })
      // 开发模式下自动打开开发者工具，方便调试页面问题
      if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
        mainWindow.webContents.openDevTools()
      }
    }
  })

  // 监听窗口关闭事件
  mainWindow.on('close', (event) => {
    log.info('窗口关闭事件触发', {
      isDestroyed: mainWindow?.isDestroyed(),
      isVisible: mainWindow?.isVisible(),
      isFocused: mainWindow?.isFocused()
    })
    
    // 清理可能阻止退出的资源
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval)
      updateCheckInterval = null
    }
  })

  // 监听窗口关闭后事件
  mainWindow.on('closed', () => {
    log.warn('窗口已关闭', { timestamp: new Date().toISOString() })
    mainWindow = null
    
    // 在非 macOS 平台上，窗口关闭后立即退出应用
    if (process.platform !== 'darwin') {
      // 关闭数据库连接
      if (sqlite && typeof sqlite.close === 'function') {
        try {
          sqlite.close()
        } catch { }
        sqlite = null
      }
      
      // 关闭所有日志流
      try { Logger.closeAll() } catch { }
      
      // 强制退出
      app.exit(0)
    }
  })

  // 监听窗口可见性变化
  mainWindow.on('show', () => {
    log.info('窗口显示事件', { isVisible: mainWindow?.isVisible(), isFocused: mainWindow?.isFocused() })
  })

  mainWindow.on('hide', () => {
    log.warn('窗口隐藏事件', { isVisible: mainWindow?.isVisible() })
  })

  // 监听窗口焦点变化（已移除日志输出以减少日志噪音）

  // 添加超时机制：如果 5 秒后窗口还没有显示，强制显示
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        log.warn('窗口超时未显示，强制显示窗口', {
          isDestroyed: mainWindow.isDestroyed(),
          isVisible: mainWindow.isVisible()
        })
        mainWindow.show()
      } else {
        log.info('窗口状态正常', {
          isVisible: mainWindow.isVisible(),
          isFocused: mainWindow.isFocused()
        })
      }
    }
  }, 5000)

  // 监听页面加载失败（只记录主框架失败，忽略子资源失败）
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      log.error('页面加载失败', { 错误代码: errorCode, 描述: errorDescription, URL: validatedURL })
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
      }
    } else {
      // 子资源加载失败（如 JS、CSS 文件）- 记录关键资源失败
      if (validatedURL && (validatedURL.includes('.js') || validatedURL.includes('.css'))) {
        log.error('资源加载失败', { 资源: validatedURL, 错误代码: errorCode, 描述: errorDescription })
      }
    }
  })

  // 监听页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('页面加载完成')
    // 检查页面内容
    mainWindow?.webContents.executeJavaScript(`
      (function() {
        const root = document.getElementById('root');
        const scripts = document.querySelectorAll('script');
        const errors = [];
        
        // 检查 root 元素
        if (!root) {
          errors.push('未找到 root 元素');
        } else {
          errors.push('root 元素存在，内容长度: ' + root.innerHTML.length);
        }
        
        // 检查脚本标签
        errors.push('脚本标签数量: ' + scripts.length);
        
        // 检查是否有错误
        const errorElements = document.querySelectorAll('.error, [class*="error"]');
        errors.push('错误元素数量: ' + errorElements.length);
        
        return errors.join(' | ');
      })()
    `).then((result) => {
      log.info('页面内容检查', { 结果: result })
      if (result.includes('内容长度: 0') || result.includes('未找到 root')) {
        log.warn('页面内容为空，可能资源加载失败，请查看开发者工具中的错误信息')
        // 确保开发者工具已打开
        if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
          mainWindow?.webContents.openDevTools()
        }
      }
    }).catch((err) => {
      log.warn('无法检查页面内容', { 错误: String(err) })
    })
  })

  // and load the index.html of the app.
  // 优先从运行时环境变量读取（开发服务器模式）
  // 如果运行时没有，则使用构建时注入的值（打包模式）
  const devServerUrl = process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL ||
    (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : undefined)

  // 调试信息：检查环境变量
  log.info('检查开发服务器配置', {
    hasDevServerUrl: !!devServerUrl,
    fromEnv: !!process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL,
    fromBuild: typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined',
    devServerUrl: devServerUrl || '未设置'
  })

  if (devServerUrl) {
    log.info('正在从开发服务器加载', { URL: devServerUrl })
    mainWindow.loadURL(devServerUrl).catch((err) => {
      log.error('加载开发服务器 URL 失败', { error: String(err), url: devServerUrl })
      log.error('请确保 Vite 开发服务器正在运行')
      // 加载失败时也显示窗口
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
      }
    })
  } else {
    log.warn('未检测到开发服务器 URL，将使用构建文件模式')
    // 生产模式：查找打包后的 HTML 文件
    const WIN_NAME = (typeof MAIN_WINDOW_VITE_NAME !== 'undefined' && MAIN_WINDOW_VITE_NAME) ? MAIN_WINDOW_VITE_NAME : 'main_window'

    const candidates = [
      // 优先使用 app.getAppPath() 的路径（最可靠）
      path.join(app.getAppPath(), 'dist', 'index.html'),
      // 相对于主进程文件的路径
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(__dirname, '..', '..', 'dist', 'index.html'),
      // electron-builder 打包后的路径（app.asar 内）
      path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
      // electron-forge 打包后的路径
      path.join(process.resourcesPath, 'app.asar', '.vite', 'renderer', WIN_NAME, 'index.html'),
      path.join(process.resourcesPath, 'app', '.vite', 'renderer', WIN_NAME, 'index.html'),
    ]

    // 查找存在的 HTML 文件
    const target = candidates.find(p => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    })

    if (target) {
      // 使用 loadFile 加载 HTML 文件
      const absoluteTarget = path.resolve(target)
      log.info('正在加载页面', { 文件路径: absoluteTarget })

      mainWindow.loadFile(absoluteTarget).catch((err) => {
        log.error('页面加载失败', { 错误: String(err) })
        if (mainWindow && !mainWindow.isVisible()) {
          mainWindow.show()
        }
      })
    } else {
      log.error('未找到页面文件', { 项目路径: app.getAppPath() })
      require('electron').dialog.showErrorBox('启动错误', '未找到页面文件，请确保已构建渲染进程')
    }
  }

  // Open the DevTools in development mode (only if explicitly requested).
  // 不自动打开 DevTools，避免影响启动性能
  // 用户可以通过 Ctrl+Shift+I 或 F12 手动打开
  if (process.env.NODE_ENV === 'development' && process.env.AUTO_OPEN_DEVTOOLS === '1' && mainWindow) {
    mainWindow.webContents.openDevTools()
  }

  // Set up application menu
  const isDevelopment = !app.isPackaged && process.env.NODE_ENV === 'development'

  if (isDevelopment) {
    // 开发模式：显示完整菜单栏
    const template = [
      {
        label: '文件',
        submenu: [
          {
            label: '退出',
            accelerator: 'Ctrl+Q',
            click: () => {
              app.quit()
            }
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' }
        ]
      },
      {
        label: '查看',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              require('electron').dialog.showMessageBox({
                type: 'info',
                title: '关于',
                message: '仓库管理系统 v    ',
                detail: '开发者小白'
              })
            }
          }
        ]
      }
    ]

    const menu = Menu.buildFromTemplate(template as any)
    Menu.setApplicationMenu(menu)
  } else {
    // 生产模式：隐藏菜单栏
    Menu.setApplicationMenu(null)
  }
}

// 开发模式：禁用某些安全限制以便调试
// 注意：这些设置仅在开发模式下生效，生产环境会自动应用更严格的安全策略
if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
  // 允许不安全的私有网络请求（开发模式需要）
  app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')
  // 抑制安全警告（仅在开发模式下）
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
}
// 禁用硬件加速可能导致的无响应问题（可选，如果遇到问题可以取消注释）
// app.disableHardwareAcceleration()

// 单实例锁：确保程序只能同时运行一个实例
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果无法获取锁，说明已有实例在运行，直接退出
  console.log('程序已在运行，禁止打开多个实例')
  app.quit()
} else {
  // 获取到锁，监听第二个实例的启动请求
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 当运行第二个实例时，聚焦到第一个实例的窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })
}

// 在应用启动前设置错误处理
app.on('ready', () => {
  // 确保错误处理已设置
  // 应用准备就绪（静默）
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  try {
    ensureLogWritable()
    setupNodePath()
    log.info('应用启动成功', { 版本: app.getVersion() })

    // Initialize database schema & seed
    try {
      if (!useSimpleDB) {
        const db = ensureDatabase()
        if (!db) {
          log.error('Database initialization failed: ensureDatabase returned null')
          // 即使数据库失败，也继续创建窗口
        } else {
          // 检查数据库文件是否存在
          const dbPath = getDbPath()
          if (!fs.existsSync(dbPath)) {
            log.error('Database file does not exist after ensureDatabase', { dbPath })
          }
          // 检查数据库是否已初始化（检查 users 表是否存在）
          const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
          log.info('Checking database initialization', { hasUsers: !!hasUsers, dbPath })

          if (!hasUsers) {
            log.info('正在初始化数据库')
            log.info('Path information', {
              __dirname,
              cwd: process.cwd(),
              resourcesPath: process.resourcesPath,
              execPath: process.execPath
            })
            const schemaCandidates = [
              path.join(process.cwd(), 'database', 'schema.sql'), // 开发环境优先
              path.resolve(process.cwd(), 'database', 'schema.sql'),
              path.join(__dirname, '..', 'database', 'schema.sql'),
              path.resolve(__dirname, '..', 'database', 'schema.sql'),
              path.join(process.resourcesPath, 'app', 'database', 'schema.sql'),
              path.join(process.resourcesPath, 'app.asar', 'database', 'schema.sql'),
              path.join(process.resourcesPath, 'database', 'schema.sql'),
            ]
            const seedCandidates = [
              path.join(process.cwd(), 'database', 'seed.sql'), // 开发环境优先
              path.resolve(process.cwd(), 'database', 'seed.sql'),
              path.join(__dirname, '..', 'database', 'seed.sql'),
              path.resolve(__dirname, '..', 'database', 'seed.sql'),
              path.join(process.resourcesPath, 'app', 'database', 'seed.sql'),
              path.join(process.resourcesPath, 'app.asar', 'database', 'seed.sql'),
              path.join(process.resourcesPath, 'database', 'seed.sql'),
            ]

            try {
              applySchema(db, schemaCandidates)
              applySeed(db, seedCandidates)

              // 迁移：检查并添加 balance 字段到 inventory_transactions 表
              try {
                const tableInfo = db.prepare("PRAGMA table_info(inventory_transactions)").all() as any[]
                const hasBalanceColumn = tableInfo.some((col: any) => col.name === 'balance')
                if (!hasBalanceColumn) {
                  log.info('Adding balance column to inventory_transactions table')
                  db.prepare('ALTER TABLE inventory_transactions ADD COLUMN balance INTEGER NOT NULL DEFAULT 0').run()
                  // 更新现有记录的 balance 值（基于当前库存）
                  db.prepare(`
                UPDATE inventory_transactions 
                SET balance = (
                  SELECT COALESCE(i.quantity, 0) 
                  FROM inventory i 
                  WHERE i.product_id = inventory_transactions.product_id
                )
              `).run()
                  log.info('Migration completed: balance column added to inventory_transactions')
                }
              } catch (migrationErr: any) {
                log.warn('Migration failed (table may not exist yet):', migrationErr)
              }
            } catch (schemaError: any) {
              log.error('Failed to initialize database schema', {
                error: String(schemaError),
                stack: schemaError.stack
              })
              throw schemaError
            }
          } else {
            // 数据库已存在，也需要检查迁移
            try {
              const tableInfo = db.prepare("PRAGMA table_info(inventory_transactions)").all() as any[]
              const hasBalanceColumn = tableInfo.some((col: any) => col.name === 'balance')
              if (!hasBalanceColumn) {
                log.info('Database exists but missing balance column, adding it now')
                db.prepare('ALTER TABLE inventory_transactions ADD COLUMN balance INTEGER NOT NULL DEFAULT 0').run()
                // 更新现有记录的 balance 值（基于当前库存）
                db.prepare(`
              UPDATE inventory_transactions 
              SET balance = (
                SELECT COALESCE(i.quantity, 0) 
                FROM inventory i 
                WHERE i.product_id = inventory_transactions.product_id
              )
            `).run()
                log.info('Migration completed: balance column added to inventory_transactions')
              }
            } catch (migrationErr: any) {
              log.warn('Migration failed:', migrationErr)
            }
          }

          try {
            // 再次验证表是否创建成功
            const tablesAfterInit = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
            log.info('数据库初始化成功')

            // 如果 users 表仍然不存在，抛出错误
            const hasUsersAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
            if (!hasUsersAfter) {
              throw new Error('users table was not created after schema application')
            }
          } catch (schemaError: any) {
            log.error('Failed to initialize database schema', {
              error: String(schemaError),
              stack: schemaError.stack,
              dbPath
            })
            throw schemaError
          }
        }
      } else {
        log.warn('Using SimpleDB mode, SQLite database will not be created')
      }
    } catch (e) {
      log.error('db init failed', { error: String(e), stack: (e as Error).stack })
      // 即使数据库初始化失败，也继续创建窗口
    }

    // 创建窗口（即使数据库初始化失败也创建）
    createWindow()

    // 初始化 electron-updater
    initializeAutoUpdater()

    // 检查并执行自动备份（每天第一次启动时）
    // 延迟执行，确保数据库已完全初始化
    setTimeout(() => {
      checkAndPerformAutoBackup()
    }, 2000)

    // 应用启动后延迟 5 秒检查更新（避免影响启动速度）
    setTimeout(() => {
      checkForUpdates()
    }, 5000)

    // 每 4 小时自动检查一次更新
    updateCheckInterval = setInterval(() => {
      checkForUpdates()
    }, 4 * 60 * 60 * 1000)
  } catch (e) {
    log.error('Failed during app initialization', { error: String(e), stack: (e as Error).stack })
    // 即使初始化失败，也尝试创建窗口
    try {
      createWindow()
      // 检查并执行自动备份（每天第一次启动时）
      setTimeout(() => {
        checkAndPerformAutoBackup()
      }, 2000)

      // 应用启动后延迟 5 秒检查更新（避免影响启动速度）
      setTimeout(() => {
        checkForUpdates()
      }, 5000)

      // 每 4 小时自动检查一次更新
      updateCheckInterval = setInterval(() => {
        checkForUpdates()
      }, 4 * 60 * 60 * 1000)
    } catch (windowError) {
      log.error('Failed to create window', { error: String(windowError), stack: (windowError as Error).stack })
      app.quit()
    }
  }

  // On macOS, re-create a window when the dock icon is clicked.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Enable DevTools shortcut in production
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow
    if (w) w.webContents.openDevTools({ mode: 'detach' })
  })
  globalShortcut.register('F12', () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow
    if (w) w.webContents.openDevTools({ mode: 'detach' })
  })

  // Auto-reconnect DevTools and reload on renderer failures
  if (mainWindow) {
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      log.error('渲染进程退出', {
        reason: details.reason,
        exitCode: details.exitCode,
        killed: details.reason === 'killed'
      })
      console.error('Renderer process gone:', details)
      // 不要立即重载，先记录错误
      if (mainWindow && !mainWindow.isDestroyed()) {
        log.info('尝试重新加载页面')
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload()
          }
        }, 1000)
      }
    })
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      log.error('页面加载失败', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
        isDestroyed: mainWindow?.isDestroyed()
      })
      console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL })
      // 只有主框架失败时才重载
      if (isMainFrame && mainWindow && !mainWindow.isDestroyed()) {
        log.info('主框架加载失败，尝试重新加载')
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.reload()
          }
        }, 1000)
      }
    })
  }

  // 开发模式：监听主进程和 preload 的构建文件变化
  // 注意：如果使用开发服务器模式，渲染进程的热更新由 Vite HMR 处理，无需文件监听
  if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
    try {
      // 检查是否使用开发服务器（优先从运行时环境变量读取）
      const hasDevServer = !!(process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL ||
        (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL))

      // 监听主进程和 preload 的构建文件
      const mainBuildPath = path.join(__dirname, 'index.js')
      const preloadBuildPath = path.join(__dirname, '../preload/index.js')

      const mainWatcher = fs.watch(path.dirname(mainBuildPath), (eventType, filename) => {
        if (filename === 'index.js') {
          log.info('检测到主进程变化，需要重启应用')
          app.relaunch()
          app.exit(0)
        }
      })

      const preloadWatcher = fs.watch(path.dirname(preloadBuildPath), (eventType, filename) => {
        if (filename === 'index.js') {
          log.info('检测到 Preload 变化，正在重新加载')
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.reload()
            }
          }, 500)
        }
      })

      if (hasDevServer) {
        log.info('开发服务器模式已启用，渲染进程支持 HMR 热更新')
      } else {
        // 如果没有开发服务器，监听 dist 目录的变化
        const appPath = app.getAppPath()
        const distPath = path.join(appPath, 'dist')

        if (fs.existsSync(distPath)) {
          let reloadTimer: NodeJS.Timeout | null = null
          const debounceReload = () => {
            if (reloadTimer) {
              clearTimeout(reloadTimer)
            }
            reloadTimer = setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                log.info('正在重新加载页面')
                mainWindow.reload()
              }
              reloadTimer = null
            }, 500)
          }

          const watcher = fs.watch(distPath, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith('.html') || filename.endsWith('.js') || filename.endsWith('.css'))) {
              if (filename.includes('.map') || filename.includes('~')) {
                return
              }
              log.info('检测到文件变化', { 文件: filename })
              debounceReload()
            }
          })

          app.on('before-quit', () => {
            try {
              watcher.close()
            } catch (e) {
              // 忽略关闭错误
            }
          })
        }
        log.info('文件监听已启动，代码修改将自动生效')
      }

      // 清理函数
      app.on('before-quit', () => {
        try {
          mainWatcher.close()
          preloadWatcher.close()
        } catch (e) {
          // 忽略关闭错误
        }
      })
    } catch (err: any) {
      log.warn('无法启动文件监听', { 错误: String(err) })
    }
  }
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  log.info('所有窗口已关闭', {
    platform: process.platform,
    isPackaged: app.isPackaged,
    nodeEnv: process.env.NODE_ENV
  })

  // 在非 macOS 平台上，强制退出应用
  if (process.platform !== 'darwin') {
    // 清理更新检查定时器
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval)
      updateCheckInterval = null
    }
    
    // 关闭数据库连接
    if (sqlite && typeof sqlite.close === 'function') {
      try {
        sqlite.close()
      } catch { }
      sqlite = null
    }
    
    // 关闭所有日志流
    try { Logger.closeAll() } catch { }
    
    // 强制退出应用
    app.exit(0)
  }
})

app.on('will-quit', () => {
  log.info('应用即将退出，清理资源...')
  
  // 清理所有快捷键
  globalShortcut.unregisterAll()
  
  // 清理更新检查定时器
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
  }
  
  // 关闭数据库连接
  if (sqlite && typeof sqlite.close === 'function') {
    try {
      sqlite.close()
      log.info('数据库连接已关闭')
    } catch (err) {
      log.error('关闭数据库连接失败:', err)
    }
    sqlite = null
  }
  
  log.info('资源清理完成')
  
  // 关闭所有日志流（必须在最后）
  try {
    Logger.closeAll()
  } catch { }
})

// IPC通信处理

// 选择文件夹对话框
ipcMain.handle('show-folder-dialog', async () => {
  try {
    const window = BrowserWindow.getFocusedWindow() || mainWindow
    if (!window) {
      return { success: false, error: '窗口未准备好' }
    }

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: '选择备份文件夹'
    })

    if (result.canceled) {
      return { success: false, canceled: true }
    }

    return { success: true, path: result.filePaths[0] }
  } catch (err: any) {
    log.error('显示文件夹对话框失败', { error: String(err) })
    return { success: false, error: String(err) }
  }
})

// 选择备份文件对话框
ipcMain.handle('show-backup-file-dialog', async () => {
  try {
    const window = BrowserWindow.getFocusedWindow() || mainWindow
    if (!window) {
      return { success: false, error: '窗口未准备好' }
    }

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      title: '选择备份文件',
      filters: [
        { name: '数据库文件', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'JSON文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (result.canceled) {
      return { success: false, canceled: true }
    }

    return { success: true, path: result.filePaths[0] }
  } catch (err: any) {
    log.error('显示备份文件对话框失败', { error: String(err) })
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// 退出应用
ipcMain.handle('quit-app', () => {
  log.info('用户通过菜单退出应用')
  app.quit()
})

// ==================== electron-updater IPC 处理器 ====================

// 手动检查更新
ipcMain.handle('check-for-updates', async () => {
  try {
    checkForUpdates()
    return { success: true }
  } catch (error: any) {
    log.error('手动检查更新失败', { error: String(error) })
    throw error
  }
})

// 下载更新
ipcMain.handle('download-update', async () => {
  try {
    if (!autoUpdaterInitialized) {
      initializeAutoUpdater()
    }
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error: any) {
    log.error('下载更新失败', { error: String(error) })
    return {
      success: false,
      error: error.message || '下载更新失败'
    }
  }
})

// 安装更新并退出
ipcMain.handle('install-update', async () => {
  try {
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  } catch (error: any) {
    log.error('安装更新失败', { error: String(error) })
    return {
      success: false,
      error: error.message || '安装更新失败'
    }
  }
})

// 测试更新服务器连接
ipcMain.handle('test-update-server', async (_e, url: string) => {
  return await testUpdateServerConnection(url)
})

// 获取更新服务器地址
ipcMain.handle('get-update-server-url', () => {
  return getUpdateServerUrl()
})

// 设置更新服务器地址
ipcMain.handle('set-update-server-url', (_e, url: string) => {
  setUpdateServerUrl(url)
  // 如果已初始化，更新 electron-updater 的 URL
  if (autoUpdaterInitialized) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: url.replace(/\/$/, '')
    })
  }
  return { success: true }
})

// 修复数据库（结构修复，不删除数据）
ipcMain.handle('db-repair', async () => {
  try {
    if (useSimpleDB) {
      return { success: false, error: 'SimpleDB 模式不支持修复数据库' }
    }

    const db = ensureDatabase()

    log.info('开始修复数据库结构（不删除数据）...')

    // 1. 应用 schema（使用 IF NOT EXISTS，只创建缺失的表）
    const schemaCandidates = [
      path.join(process.cwd(), 'database', 'schema.sql'),
      path.resolve(process.cwd(), 'database', 'schema.sql'),
      path.join(__dirname, '..', 'database', 'schema.sql'),
      path.resolve(__dirname, '..', 'database', 'schema.sql'),
      path.join(process.resourcesPath, 'app', 'database', 'schema.sql'),
      path.join(process.resourcesPath, 'app.asar', 'database', 'schema.sql'),
      path.join(process.resourcesPath, 'database', 'schema.sql'),
    ]

    try {
      applySchema(db, schemaCandidates)
      log.info('Schema 应用完成（已存在的表不会被删除）')
    } catch (schemaErr: any) {
      log.warn('应用 schema 时出现警告（可能部分表已存在）', { error: String(schemaErr) })
      // 继续执行，因为表可能已存在
    }

    // 在应用 schema 后重新获取表名列表（确保包含新创建的表）
    const allTablesAfterSchema = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      AND name != 'sqlite_sequence'
    `).all() as { name: string }[]

    const allTableNamesAfterSchema = allTablesAfterSchema.map(t => t.name)
    log.info('应用 schema 后的表', { tables: allTableNamesAfterSchema, count: allTableNamesAfterSchema.length })

    // 2. 检查并添加缺失的字段
    const fieldsToCheck: Array<{ table: string; column: string; definition: string }> = [
      { table: 'inventory_transactions', column: 'batch_number', definition: 'TEXT' },
      { table: 'inventory_transactions', column: 'balance', definition: 'INTEGER NOT NULL DEFAULT 0' },
      { table: 'sn_status', column: 'sku', definition: 'TEXT NOT NULL' },
    ]

    // 验证表名安全性（只允许字母、数字、下划线）
    const isValidTableName = (name: string): boolean => {
      return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
    }

    let addedFields = 0
    const fieldErrors: string[] = []

    for (const field of fieldsToCheck) {
      try {
        // 验证表名安全性
        if (!isValidTableName(field.table)) {
          fieldErrors.push(`表名不安全: ${field.table}`)
          continue
        }
        1
        // 检查表是否存在
        if (!allTableNamesAfterSchema.includes(field.table)) {
          log.info(`表 ${field.table} 不存在，跳过字段检查`)
          continue
        }

        // 检查字段是否存在
        const tableInfo = db.prepare(`PRAGMA table_info(${field.table})`).all() as Array<{ name: string }>
        const hasColumn = tableInfo.some(col => col.name === field.column)

        if (!hasColumn) {
          try {
            // 验证字段定义中不包含危险字符
            if (!/^[a-zA-Z0-9_()\s,]+$/.test(field.definition)) {
              fieldErrors.push(`字段定义不安全: ${field.table}.${field.column}`)
              continue
            }

            db.prepare(`ALTER TABLE ${field.table} ADD COLUMN ${field.column} ${field.definition}`).run()
            log.info(`已添加字段: ${field.table}.${field.column}`)
            addedFields++

            // 如果是 sku 字段，需要更新现有数据（只在字段真正被添加后才执行）
            if (field.table === 'sn_status' && field.column === 'sku') {
              try {
                // 再次确认字段已存在
                const verifyTableInfo = db.prepare(`PRAGMA table_info(${field.table})`).all() as Array<{ name: string }>
                const verifyHasColumn = verifyTableInfo.some(col => col.name === field.column)

                if (verifyHasColumn) {
                  db.prepare(`
                    UPDATE sn_status 
                    SET sku = (SELECT sku FROM products WHERE products.id = sn_status.product_id)
                    WHERE sku IS NULL OR sku = ''
                  `).run()
                  log.info('已更新 sn_status 表的 sku 字段数据')
                } else {
                  log.warn('字段添加后验证失败，跳过数据更新')
                }
              } catch (updateErr: any) {
                const errorMsg = `更新 sn_status.sku 数据失败: ${String(updateErr)}`
                log.warn(errorMsg)
                fieldErrors.push(errorMsg)
              }
            }
          } catch (addErr: any) {
            const errorMsg = `添加字段 ${field.table}.${field.column} 失败: ${String(addErr)}`
            log.warn(errorMsg)
            fieldErrors.push(errorMsg)
          }
        } else {
          log.info(`字段 ${field.table}.${field.column} 已存在，跳过`)
        }
      } catch (checkErr: any) {
        const errorMsg = `检查字段 ${field.table}.${field.column} 失败: ${String(checkErr)}`
        log.warn(errorMsg)
        fieldErrors.push(errorMsg)
      }
    }

    // 3. 执行所有迁移脚本（确保所有迁移都已应用）
    const migrations = [
      {
        name: 'add_customer_stores',
        candidates: [
          path.join(process.cwd(), 'src', 'database', 'migrations', 'add_customer_stores.sql'),
          path.join(__dirname, '..', 'src', 'database', 'migrations', 'add_customer_stores.sql'),
          path.join(process.resourcesPath, 'app', 'src', 'database', 'migrations', 'add_customer_stores.sql'),
          path.join(process.resourcesPath, 'app.asar', 'src', 'database', 'migrations', 'add_customer_stores.sql'),
        ],
        description: '客户门店表'
      },
      {
        name: 'add_batch_and_outbound',
        candidates: [
          path.join(process.cwd(), 'src', 'database', 'migrations', 'add_batch_and_outbound.sql'),
          path.join(__dirname, '..', 'src', 'database', 'migrations', 'add_batch_and_outbound.sql'),
          path.join(process.resourcesPath, 'app', 'src', 'database', 'migrations', 'add_batch_and_outbound.sql'),
          path.join(process.resourcesPath, 'app.asar', 'src', 'database', 'migrations', 'add_batch_and_outbound.sql'),
        ],
        description: '批次和出库相关表'
      },
      {
        name: 'add_composite_indexes',
        candidates: [
          path.join(process.cwd(), 'database', 'migrations', 'add_composite_indexes.sql'),
          path.join(__dirname, '..', 'database', 'migrations', 'add_composite_indexes.sql'),
          path.join(process.resourcesPath, 'app', 'database', 'migrations', 'add_composite_indexes.sql'),
          path.join(process.resourcesPath, 'app.asar', 'database', 'migrations', 'add_composite_indexes.sql'),
          path.join(process.resourcesPath, 'database', 'migrations', 'add_composite_indexes.sql'),
        ],
        description: '组合索引'
      }
    ]

    let appliedMigrations = 0
    const migrationErrors: string[] = []

    for (const migration of migrations) {
      try {
        // 查找迁移脚本文件
        const migrationPath = migration.candidates.find(candidate => fs.existsSync(candidate))

        if (migrationPath) {
          const migrationScript = fs.readFileSync(migrationPath, 'utf-8')
          db.exec(migrationScript)
          log.info(`迁移脚本已执行: ${migration.description}`)
          appliedMigrations++
        } else {
          const errorMsg = `迁移脚本不存在: ${migration.name}`
          log.warn(errorMsg, { candidates: migration.candidates })
          migrationErrors.push(errorMsg)
        }
      } catch (migrationErr: any) {
        const errorMessage = migrationErr?.message || String(migrationErr)
        if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
          log.info(`迁移脚本跳过（已存在）: ${migration.description}`)
        } else {
          const errorMsg = `执行迁移脚本失败 (${migration.name}): ${errorMessage}`
          log.warn(errorMsg)
          migrationErrors.push(errorMsg)
        }
      }
    }

    // 4. 验证关键表是否存在
    const requiredTables = [
      'users',
      'products',
      'inventory',
      'inventory_transactions',
      'customers',
      'customer_stores',
      'inventory_batches',
      'outbound_records',
      'outbound_sn_items',
      'sn_status',
      'system_logs',
      'system_settings'
    ]

    const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    const allTableNames = allTables.map((t: any) => t.name)

    const missingTables: string[] = []
    for (const requiredTable of requiredTables) {
      if (!allTableNames.includes(requiredTable)) {
        missingTables.push(requiredTable)
      }
    }

    if (missingTables.length > 0) {
      const errorMsg = `数据库修复完成，但以下关键表缺失: ${missingTables.join(', ')}`
      log.error('关键表缺失', { missingTables, allTables: allTableNames })
      return { success: false, error: errorMsg }
    }

    // 5. 验证索引
    try {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
      log.info('数据库索引', { indexes: indexes.map((i: any) => i.name), count: indexes.length })
    } catch (indexErr: any) {
      log.warn('检查索引时出错', { error: String(indexErr) })
    }

    // 收集所有错误
    const allErrors = [...fieldErrors, ...migrationErrors]

    // 构建摘要信息
    const summary = []
    if (addedFields > 0) {
      summary.push(`添加了 ${addedFields} 个缺失字段`)
    }
    if (appliedMigrations > 0) {
      summary.push(`执行了 ${appliedMigrations} 个迁移脚本`)
    }
    if (summary.length === 0) {
      summary.push('数据库结构完整，无需修复')
    }

    // 如果有错误，添加到摘要中
    if (allErrors.length > 0) {
      summary.push(`遇到 ${allErrors.length} 个警告（不影响数据完整性）`)
    }

    log.info('数据库修复完成（数据已保留）', {
      tables: allTableNames.length,
      addedFields,
      appliedMigrations,
      errors: allErrors.length
    })

    // 构建返回消息
    let message = `数据库修复成功！${summary.join('，')}。所有数据已保留。`
    if (allErrors.length > 0) {
      message += `\n\n警告：${allErrors.slice(0, 3).join('；')}${allErrors.length > 3 ? `（还有 ${allErrors.length - 3} 个警告）` : ''}`
    }

    return {
      success: true,
      message: message
    }
  } catch (err: any) {
    log.error('数据库修复失败', { error: String(err), stack: err.stack })
    return { success: false, error: String(err) }
  }
})

// 用户认证
ipcMain.handle('auth-login', async (_e, username: string, password: string) => {
  try {
    if (useSimpleDB) {
      const user = simpleDB.get('users', { username })
      if (user && user.status === 1) {
        // 检查密码是否已哈希
        const isHashed = user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))
        let passwordMatch = false
        if (isHashed) {
          passwordMatch = await bcrypt.compare(password, user.password)
        } else {
          // 兼容旧的明文密码
          passwordMatch = user.password === password
        }
        if (passwordMatch) {
          const { password: _, ...userWithoutPassword } = user
          return { success: true, data: userWithoutPassword }
        }
      }
      return { success: false, error: '用户名或密码错误' }
    }
    const db = ensureDatabase()
    const userWithPassword = db.prepare('SELECT * FROM users WHERE username = ? AND status = 1').get(username) as any
    if (!userWithPassword) {
      return { success: false, error: '用户名或密码错误' }
    }
    // 使用 bcrypt 验证密码
    const isHashed = userWithPassword.password && (userWithPassword.password.startsWith('$2a$') || userWithPassword.password.startsWith('$2b$'))
    let passwordMatch = false
    if (isHashed) {
      passwordMatch = await bcrypt.compare(password, userWithPassword.password)
    } else {
      // 兼容旧的明文密码，验证成功后自动升级为哈希密码
      passwordMatch = userWithPassword.password === password
      if (passwordMatch) {
        const hashedPassword = await bcrypt.hash(password, 10)
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userWithPassword.id)
        log.info('用户密码已自动升级为哈希存储', { userId: userWithPassword.id })
      }
    }
    if (!passwordMatch) {
      return { success: false, error: '用户名或密码错误' }
    }
    const { password: _, ...userWithoutPassword } = userWithPassword
    return { success: true, data: userWithoutPassword }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 获取所有用户
ipcMain.handle('get-users', async (_e, page = 1, pageSize = 20) => {
  try {
    if (useSimpleDB) {
      const users = simpleDB.query('users', { status: 1 })
      const offset = (page - 1) * pageSize
      const paginated = users.slice(offset, offset + pageSize)
      return { success: true, data: { data: paginated, total: users.length, page, pageSize } }
    }
    const db = ensureDatabase()
    const total = db.prepare('SELECT COUNT(*) as count FROM users WHERE status = 1').get() as { count: number }
    const offset = (page - 1) * pageSize
    const users = db.prepare('SELECT id, username, name, email, phone, status, created_at, updated_at FROM users WHERE status = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?').all(pageSize, offset)
    return { success: true, data: { data: users, total: total.count, page, pageSize } }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 创建用户
ipcMain.handle('create-user', async (_e, userData: any) => {
  try {
    // 使用 bcrypt 哈希密码
    const hashedPassword = await bcrypt.hash(userData.password, 10)
    
    if (useSimpleDB) {
      const exists = simpleDB.get('users', { username: userData.username })
      if (exists) {
        return { success: false, error: '用户名已存在' }
      }
      const id = simpleDB.insert('users', { ...userData, password: hashedPassword, status: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return { success: true, data: { id, ...userData } }
    }
    const db = ensureDatabase()
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(userData.username)
    if (exists) {
      return { success: false, error: '用户名已存在' }
    }
    const result = db.prepare('INSERT INTO users (username, password, name, email, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run(
      userData.username, hashedPassword, userData.name, userData.email || null, userData.phone || null
    )
    const newUser = db.prepare('SELECT id, username, name, email, phone, status, created_at, updated_at FROM users WHERE id = ?').get(result.lastInsertRowid)
    return { success: true, data: newUser }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 更新用户
ipcMain.handle('update-user', async (_e, id: number, userData: any) => {
  try {
    if (useSimpleDB) {
      const success = simpleDB.update('users', id, { ...userData, updated_at: new Date().toISOString() })
      if (!success) {
        return { success: false, error: '用户不存在' }
      }
      return { success: true, data: simpleDB.get('users', { id }) }
    }
    const db = ensureDatabase()
    const fields: string[] = []
    const values: any[] = []
    if (userData.name !== undefined) { fields.push('name = ?'); values.push(userData.name) }
    if (userData.email !== undefined) { fields.push('email = ?'); values.push(userData.email) }
    if (userData.phone !== undefined) { fields.push('phone = ?'); values.push(userData.phone) }
    if (userData.status !== undefined) { fields.push('status = ?'); values.push(userData.status) }
    if (fields.length === 0) {
      return { success: false, error: '没有要更新的字段' }
    }
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    const result = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    if (result.changes === 0) {
      return { success: false, error: '用户不存在' }
    }
    const updatedUser = db.prepare('SELECT id, username, name, email, phone, status, created_at, updated_at FROM users WHERE id = ?').get(id)
    return { success: true, data: updatedUser }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 删除用户
ipcMain.handle('delete-user', async (_e, id: number) => {
  try {
    if (useSimpleDB) {
      const success = simpleDB.update('users', id, { status: 0, updated_at: new Date().toISOString() })
      return { success: success, message: success ? '用户删除成功' : '用户不存在' }
    }
    const db = ensureDatabase()
    const result = db.prepare('UPDATE users SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    return { success: result.changes > 0, message: result.changes > 0 ? '用户删除成功' : '用户不存在' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 产品相关IPC处理
ipcMain.handle('get-products', async () => {
  return { success: true, data: { data: [], total: 0, page: 1, pageSize: 10 } }
})

ipcMain.handle('get-product', async (_e, id: number) => {
  try {
    if (useSimpleDB) {
      const product = simpleDB.get('products', { id, status: 1 })
      return { success: !!product, data: product || null }
    }
    const db = ensureDatabase()
    const product = db.prepare(`
      SELECT p.*, c.name as category_name, COALESCE(i.quantity, 0) as current_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = ? AND p.status = 1
    `).get(id)
    return { success: true, data: product || null }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('create-product', async (_e, productData: any) => {
  try {
    if (useSimpleDB) {
      const id = simpleDB.insert('products', { ...productData, status: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      return { success: true, data: { id, ...productData } }
    }
    const db = ensureDatabase()
    const result = db.prepare(`
      INSERT INTO products (name, category_id, sku, barcode, description, unit, cost_price, selling_price, min_stock, max_stock, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      productData.name, productData.category_id || null, productData.sku, productData.barcode || null,
      productData.description || null, productData.unit, productData.cost_price, productData.selling_price,
      productData.min_stock, productData.max_stock
    )
    // 创建库存记录
    db.prepare('INSERT INTO inventory (product_id, quantity, created_at, updated_at) VALUES (?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run(result.lastInsertRowid)
    const newProduct = db.prepare(`
      SELECT p.*, c.name as category_name, COALESCE(i.quantity, 0) as current_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = ?
    `).get(result.lastInsertRowid)
    return { success: true, data: newProduct }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('update-product', async (_e, id: number, productData: any) => {
  try {
    if (useSimpleDB) {
      const success = simpleDB.update('products', id, { ...productData, updated_at: new Date().toISOString() })
      if (!success) {
        return { success: false, error: '产品不存在' }
      }
      return { success: true, data: simpleDB.get('products', { id }) }
    }
    const db = ensureDatabase()
    const fields: string[] = []
    const values: any[] = []
    if (productData.name !== undefined) { fields.push('name = ?'); values.push(productData.name) }
    if (productData.category_id !== undefined) { fields.push('category_id = ?'); values.push(productData.category_id) }
    if (productData.barcode !== undefined) { fields.push('barcode = ?'); values.push(productData.barcode) }
    if (productData.description !== undefined) { fields.push('description = ?'); values.push(productData.description) }
    if (productData.unit !== undefined) { fields.push('unit = ?'); values.push(productData.unit) }
    if (productData.cost_price !== undefined) { fields.push('cost_price = ?'); values.push(productData.cost_price) }
    if (productData.selling_price !== undefined) { fields.push('selling_price = ?'); values.push(productData.selling_price) }
    if (productData.min_stock !== undefined) { fields.push('min_stock = ?'); values.push(productData.min_stock) }
    if (productData.max_stock !== undefined) { fields.push('max_stock = ?'); values.push(productData.max_stock) }
    if (productData.status !== undefined) { fields.push('status = ?'); values.push(productData.status) }
    if (fields.length === 0) {
      return { success: false, error: '没有要更新的字段' }
    }
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    const result = db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    if (result.changes === 0) {
      return { success: false, error: '产品不存在' }
    }
    const updatedProduct = db.prepare(`
      SELECT p.*, c.name as category_name, COALESCE(i.quantity, 0) as current_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = ?
    `).get(id)
    return { success: true, data: updatedProduct }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('delete-product', async (_e, id: number) => {
  try {
    if (useSimpleDB) {
      const success = simpleDB.update('products', id, { status: 0, updated_at: new Date().toISOString() })
      return { success: success, message: success ? '产品删除成功' : '产品不存在' }
    }
    const db = ensureDatabase()
    const result = db.prepare('UPDATE products SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    return { success: result.changes > 0, message: result.changes > 0 ? '产品删除成功' : '产品不存在' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 库存相关IPC处理
ipcMain.handle('get-inventory', async () => {
  return { success: true, data: { data: [], total: 0, page: 1, pageSize: 10 } }
})

ipcMain.handle('get-inventory-transactions', async () => {
  return { success: true, data: { data: [], total: 0, page: 1, pageSize: 10 } }
})

ipcMain.handle('stock-in', async (_e, data: { product_id: number; quantity: number; location?: string; batch_number?: string; production_date?: string; expiry_date?: string; notes?: string; created_by?: number }) => {
  try {
    if (useSimpleDB) {
      const inventory = simpleDB.get('inventory', { product_id: data.product_id })
      if (inventory) {
        simpleDB.update('inventory', inventory.id, { quantity: inventory.quantity + data.quantity, updated_at: new Date().toISOString() })
      } else {
        simpleDB.insert('inventory', { product_id: data.product_id, quantity: data.quantity, location: data.location || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      }
      return { success: true, message: '入库成功' }
    }
    const db = ensureDatabase()
    db.transaction(() => {
      const current = db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(data.product_id) as { quantity: number } | undefined
      const newQuantity = (current?.quantity || 0) + data.quantity
      if (current) {
        db.prepare('UPDATE inventory SET quantity = ?, location = ?, batch_number = ?, production_date = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(
          newQuantity, data.location || null, data.batch_number || null, data.production_date || null, data.expiry_date || null, data.product_id
        )
      } else {
        db.prepare('INSERT INTO inventory (product_id, quantity, location, batch_number, production_date, expiry_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run(
          data.product_id, newQuantity, data.location || null, data.batch_number || null, data.production_date || null, data.expiry_date || null
        )
      }
      const product = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(data.product_id) as { cost_price: number } | undefined
      const unitCost = product?.cost_price || 0
      db.prepare('INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, total_cost, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
        data.product_id, 'in', data.quantity, unitCost, unitCost * data.quantity, data.notes || null, data.created_by || null
      )
    })()
    return { success: true, message: '入库成功' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('stock-out', async (_e, data: { product_id: number; quantity: number; notes?: string; created_by?: number }) => {
  try {
    if (useSimpleDB) {
      const inventory = simpleDB.get('inventory', { product_id: data.product_id })
      if (!inventory || inventory.quantity < data.quantity) {
        return { success: false, error: '库存不足' }
      }
      simpleDB.update('inventory', inventory.id, { quantity: inventory.quantity - data.quantity, updated_at: new Date().toISOString() })
      return { success: true, message: '出库成功' }
    }
    const db = ensureDatabase()
    db.transaction(() => {
      const current = db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(data.product_id) as { quantity: number } | undefined
      if (!current || current.quantity < data.quantity) {
        throw new Error('库存不足')
      }
      const newQuantity = current.quantity - data.quantity
      db.prepare('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(newQuantity, data.product_id)
      const product = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(data.product_id) as { cost_price: number } | undefined
      const unitCost = product?.cost_price || 0
      db.prepare('INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, total_cost, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
        data.product_id, 'out', data.quantity, unitCost, unitCost * data.quantity, data.notes || null, data.created_by || null
      )
    })()
    return { success: true, message: '出库成功' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('adjust-inventory', async (_e, data: { product_id: number; quantity: number; location?: string; batch_number?: string; production_date?: string; expiry_date?: string; notes?: string; created_by?: number }) => {
  try {
    if (useSimpleDB) {
      const inventory = simpleDB.get('inventory', { product_id: data.product_id })
      if (inventory) {
        simpleDB.update('inventory', inventory.id, { quantity: data.quantity, location: data.location || null, updated_at: new Date().toISOString() })
      } else {
        simpleDB.insert('inventory', { product_id: data.product_id, quantity: data.quantity, location: data.location || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      }
      return { success: true, message: '库存调整成功' }
    }
    const db = ensureDatabase()
    db.transaction(() => {
      const current = db.prepare('SELECT quantity FROM inventory WHERE product_id = ?').get(data.product_id) as { quantity: number } | undefined
      if (current) {
        db.prepare('UPDATE inventory SET quantity = ?, location = ?, batch_number = ?, production_date = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(
          data.quantity, data.location || null, data.batch_number || null, data.production_date || null, data.expiry_date || null, data.product_id
        )
      } else {
        db.prepare('INSERT INTO inventory (product_id, quantity, location, batch_number, production_date, expiry_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)').run(
          data.product_id, data.quantity, data.location || null, data.batch_number || null, data.production_date || null, data.expiry_date || null
        )
      }
      const diff = data.quantity - (current?.quantity || 0)
      if (diff !== 0) {
        const product = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(data.product_id) as { cost_price: number } | undefined
        const unitCost = product?.cost_price || 0
        db.prepare('INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, total_cost, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(
          data.product_id, 'adjust', diff, unitCost, unitCost * Math.abs(diff), data.notes || null, data.created_by || null
        )
      }
    })()
    return { success: true, message: '库存调整成功' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('get-inventory-stats', async () => {
  return { success: true, data: { total_quantity: 0, total_value: 0 } }
})

ipcMain.handle('get-low-stock-products', async () => {
  return { success: true, data: [] }
})

// 数据库状态检查
ipcMain.handle('db-status', async () => {
  return { success: true, data: { status: 'unknown' } }
})

// 生成友好的时间戳格式：YYYY-MM-DD_HH-mm-ss
function formatTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

// 数据库备份
ipcMain.handle('db-backup', async (_e, backupDir?: string) => {
  try {
    if (useSimpleDB) {
      const timestamp = formatTimestamp()
      const backupFileName = `backup_${timestamp}.json`
      const backupPath = backupDir
        ? path.join(backupDir, backupFileName)
        : simpleDB.backup()

      // 如果指定了目录，需要手动复制文件
      if (backupDir) {
        const dataPath = path.join(path.dirname(process.execPath), 'data', 'inventory-data.json')
        if (fs.existsSync(dataPath)) {
          // 确保目录存在
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true })
          }
          fs.copyFileSync(dataPath, backupPath)

          // 手动备份后也清理旧备份（使用系统设置中的保留天数）
          const retentionDays = parseInt(getSystemSetting('backupRetentionDays', '10'), 10)
          cleanupOldBackups(backupDir, retentionDays)
        } else {
          throw new Error('数据文件不存在')
        }
      }

      return { success: true, message: '备份成功', path: backupPath }
    }
    const db = ensureDatabase()
    const dbPath = getDbPath()
    const timestamp = formatTimestamp()
    const backupFileName = `inventory_backup_${timestamp}.db`
    const targetPath = backupDir
      ? path.join(backupDir, backupFileName)
      : `${dbPath}.backup.${timestamp}`

    // 确保目录存在
    const targetDir = path.dirname(targetPath)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const BetterSqlite3 = loadBetterSqlite3()
    if (!BetterSqlite3) {
      throw new Error('better-sqlite3 不可用')
    }

    // 使用文件复制方式备份，确保数据完整
    // 先关闭当前数据库连接以确保数据已写入磁盘
    if (sqlite && typeof sqlite.close === 'function') {
      // 不关闭，因为后续还需要使用
      // 但确保数据已写入
      db.prepare('PRAGMA wal_checkpoint(FULL)').run()
    }

    // 直接复制数据库文件
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, targetPath)
      log.info('数据库备份成功（文件复制方式）', { dbPath, targetPath, size: fs.statSync(targetPath).size })
    } else {
      throw new Error('数据库文件不存在')
    }

    // 验证备份文件
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
      throw new Error('备份文件创建失败或文件为空')
    }

    // 手动备份后也清理旧备份（使用系统设置中的保留天数）
    if (backupDir) {
      const retentionDays = parseInt(getSystemSetting('backupRetentionDays', '10'), 10)
      cleanupOldBackups(backupDir, retentionDays)
    }

    return { success: true, message: '备份成功', path: targetPath }
  } catch (err: any) {
    log.error('数据库备份失败', { error: String(err), stack: err.stack })
    return { success: false, error: String(err) }
  }
})

// 清理过期备份文件
ipcMain.handle('db-cleanup-backups', async () => {
  try {
    // 获取备份保留天数设置
    const retentionDays = parseInt(getSystemSetting('backupRetentionDays', '10'), 10)

    // 自动备份固定使用数据库目录下的 backups 文件夹
    const dbPath = getDbPath()
    const backupDir = path.join(path.dirname(dbPath), 'backups')

    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      log.info('备份目录不存在，跳过清理', { backupDir })
      return { success: true, message: '备份目录不存在，无需清理' }
    }

    // 执行清理
    cleanupOldBackups(backupDir, retentionDays)

    return { success: true, message: `已清理超过 ${retentionDays} 天的备份文件` }
  } catch (err: any) {
    log.error('清理备份文件失败', { error: String(err), stack: err.stack })
    return { success: false, error: String(err) }
  }
})

// 测试备份功能
ipcMain.handle('db-backup-test', async () => {
  try {
    // 执行一次测试备份
    await performAutoBackup()
    return { success: true, message: '备份测试完成，请查看日志确认结果' }
  } catch (err: any) {
    log.error('备份测试失败', { error: String(err) })
    return { success: false, error: String(err) }
  }
})

// 数据库恢复
ipcMain.handle('db-restore', async (_e, backupPath: string) => {
  try {
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: '备份文件不存在' }
    }
    if (useSimpleDB) {
      // SimpleDB 恢复逻辑 - 通过备份方法实现
      // 注意：simpleDB 的恢复需要直接操作文件，这里暂时返回错误提示
      return { success: false, error: 'SimpleDB 模式下请手动恢复数据文件' }
    }
    const db = ensureDatabase()
    const dbPath = getDbPath()
    // 关闭当前数据库连接
    if (sqlite && typeof sqlite.close === 'function') {
      sqlite.close()
    }
    // 复制备份文件到数据库路径
    fs.copyFileSync(backupPath, dbPath)
    // 重新打开数据库
    sqlite = null
    ensureDatabase()
    return { success: true, message: '恢复成功' }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 获取系统设置
function getSystemSetting(key: string, defaultValue: string = ''): string {
  try {
    if (useSimpleDB) {
      return defaultValue
    }
    const db = ensureDatabase()
    const result = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined
    return result?.value || defaultValue
  } catch (err: any) {
    log.warn(`获取系统设置失败: ${key}`, { error: String(err) })
    return defaultValue
  }
}

// 清理旧备份文件（只保留设置的天数，超过的自动删除）
function cleanupOldBackups(backupDir: string, maxDays: number = 10) {
  try {
    if (!fs.existsSync(backupDir)) {
      log.info('备份目录不存在，跳过清理', { backupDir })
      return
    }

    const files = fs.readdirSync(backupDir)
    const now = Date.now()
    const maxAge = maxDays * 24 * 60 * 60 * 1000 // 转换为毫秒
    let deletedCount = 0
    let keptCount = 0
    const backupFiles: Array<{ file: string; path: string; mtime: number; birthtime: number }> = []

    log.info('开始清理旧备份文件', { backupDir, maxDays, maxAge: `${maxAge / (24 * 60 * 60 * 1000)}天` })

    // 先收集所有备份文件及其时间信息
    for (const file of files) {
      const filePath = path.join(backupDir, file)
      try {
        // 只处理备份文件（匹配备份文件命名模式）
        const isBackupFile = file.includes('inventory_backup_') || file.includes('backup_')

        if (isBackupFile) {
          const stats = fs.statSync(filePath)

          // 尝试从文件名中提取时间戳（格式：YYYY-MM-DD_HH-mm-ss）
          let fileTimeFromName: number | null = null
          const timestampMatch = file.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/)
          if (timestampMatch && timestampMatch[1]) {
            try {
              // 将文件名中的时间戳转换为 Date 对象
              // 格式：2025-12-19_16-30-41 -> 2025-12-19T16:30:41
              const timestampStr = timestampMatch[1]
              // 修复时间部分的分隔符：将日期和时间之间的 _ 替换为 T，将时间部分的 - 替换为 :
              const fixedTimestamp = timestampStr.replace('_', 'T').replace(/(\d{2})-(\d{2})-(\d{2})$/, '$1:$2:$3')
              fileTimeFromName = new Date(fixedTimestamp).getTime()
              if (isNaN(fileTimeFromName)) {
                fileTimeFromName = null
              }
            } catch (e) {
              // 解析失败，忽略
              fileTimeFromName = null
            }
          }

          // 优先使用文件名中的时间戳，如果不可用则使用文件系统时间
          // 文件名时间戳更可靠，因为它不会因为文件被复制或修改而改变
          const fileTime = fileTimeFromName || stats.mtimeMs || stats.birthtimeMs || stats.ctimeMs

          backupFiles.push({
            file,
            path: filePath,
            mtime: fileTime,
            birthtime: stats.birthtimeMs || stats.ctimeMs
          })

          if (fileTimeFromName && timestampMatch && timestampMatch[1]) {
            log.info('从文件名提取时间戳', {
              file,
              timestamp: timestampMatch[1],
              fileTime: new Date(fileTime).toISOString(),
              fileSystemTime: new Date(stats.mtimeMs).toISOString()
            })
          }
        }
      } catch (err: any) {
        log.warn('读取备份文件信息时出错', { file, error: String(err) })
      }
    }

    if (backupFiles.length === 0) {
      log.info('没有找到备份文件，跳过清理')
      return
    }

    // 按修改时间排序（最新的在前）
    backupFiles.sort((a, b) => b.mtime - a.mtime)

    log.info(`找到 ${backupFiles.length} 个备份文件，开始检查清理条件`)

    // 删除超过保留天数的备份文件
    for (const backupFile of backupFiles) {
      const age = now - backupFile.mtime
      const ageInDays = Math.floor(age / (24 * 60 * 60 * 1000))
      const ageInHours = Math.floor(age / (60 * 60 * 1000))

      // 记录文件信息
      log.info('检查备份文件', {
        file: backupFile.file,
        ageInDays: `${ageInDays}天`,
        ageInHours: `${ageInHours}小时`,
        maxDays: `${maxDays}天`,
        fileTime: new Date(backupFile.mtime).toISOString(),
        now: new Date(now).toISOString()
      })

      // 如果文件年龄超过设置的天数，删除它
      if (age > maxAge) {
        try {
          fs.unlinkSync(backupFile.path)
          deletedCount++
          log.info('✅ 删除超过保留天数的备份文件', {
            file: backupFile.file,
            ageInDays: `${ageInDays}天`,
            maxDays: `${maxDays}天`,
            fileTime: new Date(backupFile.mtime).toISOString()
          })
        } catch (err: any) {
          log.error('❌ 删除备份文件失败', { file: backupFile.file, error: String(err) })
        }
      } else {
        keptCount++
        log.info('✓ 保留备份文件（在保留天数内）', {
          file: backupFile.file,
          ageInDays: `${ageInDays}天`,
          maxDays: `${maxDays}天`
        })
      }
    }

    if (deletedCount > 0) {
      log.info(`备份清理完成，删除了 ${deletedCount} 个超过保留天数（${maxDays}天）的备份文件，保留了 ${keptCount} 个文件`)
    } else {
      log.info(`备份清理完成，所有 ${keptCount} 个备份文件都在保留天数（${maxDays}天）内`)
    }
  } catch (err: any) {
    log.error('清理旧备份文件失败', { error: String(err), stack: err.stack })
  }
}

// 执行自动备份
async function performAutoBackup() {
  try {
    // 检查是否启用自动备份
    const autoBackupEnabled = getSystemSetting('autoBackup', 'true') === 'true'
    if (!autoBackupEnabled) {
      log.info('自动备份已禁用，跳过备份')
      return false
    }

    // 自动备份固定使用数据库目录下的 backups 文件夹
    const dbPath = getDbPath()
    const backupDir = path.join(path.dirname(dbPath), 'backups')

    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
      log.info('创建备份目录', { backupDir })
    }

    // 执行备份（直接调用备份逻辑）
    log.info('开始自动备份', { backupDir })

    if (useSimpleDB) {
      const timestamp = formatTimestamp()
      const backupFileName = `backup_${timestamp}.json`
      const backupPath = path.join(backupDir, backupFileName)

      const dataPath = path.join(path.dirname(process.execPath), 'data', 'inventory-data.json')
      if (fs.existsSync(dataPath)) {
        fs.copyFileSync(dataPath, backupPath)
        log.info('自动备份成功（SimpleDB）', { path: backupPath })
        // 获取备份保留天数设置
        const retentionDays = parseInt(getSystemSetting('backupRetentionDays', '10'), 10)
        cleanupOldBackups(backupDir, retentionDays)
        // 记录备份日期
        setSystemSetting('lastBackupDate', new Date().toISOString().split('T')[0])
        return true
      } else {
        log.error('自动备份失败：数据文件不存在')
        return false
      }
    }

    // SQLite 备份
    const db = ensureDatabase()
    const timestamp = formatTimestamp()
    const backupFileName = `inventory_backup_${timestamp}.db`
    const targetPath = path.join(backupDir, backupFileName)

    const BetterSqlite3 = loadBetterSqlite3()
    if (!BetterSqlite3) {
      log.error('自动备份失败：better-sqlite3 不可用')
      return false
    }

    // 确保数据已写入磁盘
    if (sqlite && typeof sqlite.close === 'function') {
      db.prepare('PRAGMA wal_checkpoint(FULL)').run()
    }

    // 直接复制数据库文件
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, targetPath)
      log.info('自动备份成功', { path: targetPath, size: fs.statSync(targetPath).size })

      // 验证备份文件
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
        // 获取备份保留天数设置
        const retentionDays = parseInt(getSystemSetting('backupRetentionDays', '10'), 10)
        cleanupOldBackups(backupDir, retentionDays)
        // 记录备份日期
        setSystemSetting('lastBackupDate', new Date().toISOString().split('T')[0])
        return true
      } else {
        log.error('自动备份失败：备份文件创建失败或文件为空')
        return false
      }
    } else {
      log.error('自动备份失败：数据库文件不存在')
      return false
    }
  } catch (err: any) {
    log.error('执行自动备份时出错', { error: String(err), stack: err.stack })
    return false
  }
}

// 设置系统设置
function setSystemSetting(key: string, value: string) {
  try {
    if (useSimpleDB) {
      return
    }
    const db = ensureDatabase()
    // 先检查是否存在
    const existing = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined
    if (existing) {
      db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(value, key)
    } else {
      db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?)').run(key, value)
    }
  } catch (err: any) {
    log.warn(`设置系统设置失败: ${key}`, { error: String(err) })
  }
}

// 检查并执行自动备份（每天第一次启动时）
async function checkAndPerformAutoBackup() {
  try {
    // 检查是否启用自动备份
    const autoBackupEnabled = getSystemSetting('autoBackup', 'true') === 'true'
    if (!autoBackupEnabled) {
      log.info('自动备份已禁用，跳过检查')
      return
    }

    // 获取上次备份日期
    const lastBackupDate = getSystemSetting('lastBackupDate', '')
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // 如果今天已经备份过，跳过
    if (lastBackupDate === today) {
      log.info('今天已经备份过，跳过自动备份', { lastBackupDate, today })
      return
    }

    // 执行备份
    log.info('检测到今天是第一次启动，执行自动备份', { lastBackupDate, today })
    const success = await performAutoBackup()
    if (success) {
      log.info('自动备份完成')
    } else {
      log.warn('自动备份失败，但继续运行应用')
    }
  } catch (err: any) {
    log.error('检查自动备份时出错', { error: String(err), stack: err.stack })
  }
}

// ==================== electron-updater 自动更新功能 ====================

// ==================== 自动更新功能 ====================

// 获取更新服务器地址
function getUpdateServerUrl(): string {
  const url = getSystemSetting('updateServerUrl', '')
  log.info('获取更新服务器地址', { url, isEmpty: !url || !url.trim() })
  return url
}

// 设置更新服务器地址
function setUpdateServerUrl(url: string): void {
  setSystemSetting('updateServerUrl', url)
}


// 测试更新服务器连接（检查 latest.yml 文件）
async function testUpdateServerConnection(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!url || !url.trim()) {
      return { success: false, error: '更新服务器地址不能为空' }
    }

    const trimmedUrl = url.trim()

    // 验证 URL 格式
    let urlObj: URL
    try {
      let urlToValidate = trimmedUrl
      if (!trimmedUrl.match(/^https?:\/\//i)) {
        urlToValidate = 'http://' + trimmedUrl
      }
      urlObj = new URL(urlToValidate)

      if (!trimmedUrl.match(/^https?:\/\//i)) {
        url = urlToValidate
      }

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { success: false, error: '更新服务器地址必须是 http 或 https 协议' }
      }
    } catch (e: any) {
      return { success: false, error: `更新服务器地址格式不正确: ${e.message || '无效的 URL 格式'}` }
    }

    // 测试 latest.yml 文件（electron-updater 需要的文件）
    const normalizedUrl = url.trim().replace(/\/+$/, '')
    const testUrl = `${normalizedUrl}/latest.yml`

    try {
      const response = await fetch(testUrl, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' }
      })

      // 200 表示文件存在，404 表示文件不存在但服务器可访问
      if (response.status === 200 || response.status === 404) {
        return { success: true }
      } else {
        return { success: false, error: `服务器返回状态码: ${response.status}` }
      }
    } catch (fetchError: any) {
      return { success: false, error: fetchError.message || '连接失败' }
    }
  } catch (err: any) {
    return { success: false, error: err.message || '测试连接失败' }
  }
}


// 检查更新（使用 electron-updater）
function checkForUpdates() {
  if (!app.isPackaged) {
    log.info('开发模式，跳过检查更新')
    return
  }

  const updateServerUrl = getUpdateServerUrl()
  if (!updateServerUrl || !updateServerUrl.trim()) {
    log.info('未配置更新服务器地址，跳过检查更新')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        error: '未配置更新服务器地址，请先在设置中保存更新服务器地址'
      })
    }
    return
  }

  // 初始化或更新 electron-updater 配置
  if (!autoUpdaterInitialized) {
    initializeAutoUpdater()
  } else {
    // 如果已初始化，更新 URL（如果服务器地址改变了）
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: updateServerUrl.replace(/\/$/, '')
    })
  }

  // 检查更新
  log.info('使用 electron-updater 检查更新')
  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    log.error('检查更新失败', { error: String(error) })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        error: error.message || '检查更新失败'
      })
    }
  })
}




// ==================== 自动更新功能结束 ====================


// 数据库统计信息
ipcMain.handle('db-stats', async () => {
  return { success: true, data: { userCount: 0, productCount: 0, inventoryCount: 0 } }
})
ipcMain.handle('db-init', async (_e, opts: { reset?: boolean; seed?: boolean } = {}) => {
  try {
    const dbPath = getDbPath()
    if (opts.reset) {
      try { if (sqlite && typeof sqlite.close === 'function') sqlite.close() } catch { }
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath) } catch { }
      sqlite = null
    }
    if (!useSimpleDB) {
      const db = ensureDatabase()
      const schemaCandidates = [
        path.join(process.resourcesPath, 'app', 'database', 'schema.sql'),
        path.join(process.resourcesPath, 'app.asar', 'database', 'schema.sql'),
        path.join(process.resourcesPath, 'database', 'schema.sql'),
        path.join(__dirname, '..', 'database', 'schema.sql'),
      ]
      const seedCandidates = [
        path.join(process.resourcesPath, 'app', 'database', 'seed.sql'),
        path.join(process.resourcesPath, 'app.asar', 'database', 'seed.sql'),
        path.join(process.resourcesPath, 'database', 'seed.sql'),
        path.join(__dirname, '..', 'database', 'seed.sql'),
      ]
      applySchema(db, schemaCandidates)
      if (opts.seed !== false) applySeed(db, seedCandidates)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      return { success: true, data: tables }
    }
    return { success: true, data: [] }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})
// Avoid accessing webContents if window creation fails
ipcMain.handle('db-query', async (_e, sql: string, params: any[] = []) => {
  try {
    if (useSimpleDB) {
      const rows = simple.run(sql, params)
      return { success: true, data: Array.isArray(rows) ? rows : [rows] }
    }
    const db = ensureDatabase()
    const stmt = db.prepare(sql)
    const rows = stmt.all(...params)
    return { success: true, data: rows }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-query-one', async (_e, sql: string, params: any[] = []) => {
  try {
    if (useSimpleDB) {
      const rows = simple.run(sql, params)
      const row = Array.isArray(rows) ? rows[0] : rows
      return { success: true, data: row }
    }
    const db = ensureDatabase()
    const stmt = db.prepare(sql)
    const row = stmt.get(...params)
    return { success: true, data: row }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-insert', async (_e, sql: string, params: any[] = []) => {
  try {
    if (useSimpleDB) {
      const res = simple.run(sql, params)
      return { success: true, lastId: Number(res.lastInsertRowid || 0) }
    }
    const db = ensureDatabase()
    const stmt = db.prepare(sql)
    const res = stmt.run(...params)
    return { success: true, lastId: Number(res.lastInsertRowid) }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-update', async (_e, sql: string, params: any[] = []) => {
  try {
    if (useSimpleDB) {
      const res = simple.run(sql, params)
      return { success: true, changes: Number(res.changes || 0) }
    }
    const db = ensureDatabase()
    const stmt = db.prepare(sql)
    const res = stmt.run(...params)
    return { success: true, changes: res.changes }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-exec', async (_e, sql: string) => {
  try {
    if (useSimpleDB) {
      // SimpleDB 不支持 exec，尝试解析并执行
      const statements = sql.split(';').filter(s => s.trim())
      for (const stmt of statements) {
        if (stmt.trim()) {
          simple.run(stmt.trim(), [])
        }
      }
      return { success: true }
    }
    const db = ensureDatabase()

    // 检查是否是 CREATE TABLE system_logs 语句
    const isCreateSystemLogsTable = sql.toUpperCase().includes('CREATE TABLE') &&
      sql.toUpperCase().includes('SYSTEM_LOGS')

    db.exec(sql)

    // 如果执行的是 CREATE TABLE system_logs 语句，立即验证表是否存在
    if (isCreateSystemLogsTable) {
      // 等待一小段时间确保表创建完成
      await new Promise(resolve => setTimeout(resolve, 50))

      // 尝试直接查询表来验证表是否存在（这会强制刷新 schema 缓存）
      try {
        db.prepare("SELECT COUNT(*) FROM system_logs").get()
        log.info('system_logs表创建并验证成功')
      } catch (verifyErr: any) {
        // 如果直接查询失败，尝试查询 sqlite_master
        try {
          const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_logs'").get()
          if (result) {
            log.info('system_logs表在sqlite_master中存在，但直接查询失败（可能是schema缓存问题）')
            // 强制刷新 schema 缓存
            db.prepare("PRAGMA schema_version").get()
          } else {
            log.warn('system_logs表创建后验证失败，表在sqlite_master中不存在')
          }
        } catch (masterErr) {
          log.warn('验证system_logs表时出错:', masterErr)
        }
      }
    } else if (sql.toUpperCase().includes('CREATE TABLE')) {
      // 对于其他 CREATE TABLE 语句，也刷新一下 schema 缓存
      try {
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get()
      } catch (e) {
        // 忽略刷新错误
      }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-batch', async (_e, statements: { sql: string; params: any[] }[]) => {
  try {
    if (useSimpleDB) {
      for (const s of statements) {
        simple.run(s.sql, s.params || [])
      }
      return { success: true }
    }
    const db = ensureDatabase()
    db.transaction(() => {
      for (const s of statements) {
        const stmt = db.prepare(s.sql)
        stmt.run(...(s.params || []))
      }
    })()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 事务执行处理器
ipcMain.handle('db-transaction', async (_e, operations: { type: 'query' | 'queryOne' | 'insert' | 'update' | 'exec'; sql: string; params?: any[] }[]) => {
  try {
    if (useSimpleDB) {
      const results: any[] = []
      for (const op of operations) {
        const res = simple.run(op.sql, op.params || [])
        if (op.type === 'query') {
          results.push(Array.isArray(res) ? res : [res])
        } else if (op.type === 'queryOne') {
          results.push(Array.isArray(res) ? res[0] : res)
        } else if (op.type === 'insert') {
          results.push({ lastId: Number(res.lastInsertRowid || 0) })
        } else if (op.type === 'update') {
          results.push({ changes: Number(res.changes || 0) })
        } else {
          results.push(null)
        }
      }
      return { success: true, data: results }
    }
    const db = ensureDatabase()
    const results: any[] = []
    const transaction = db.transaction(() => {
      for (const op of operations) {
        if (op.type === 'exec') {
          db.exec(op.sql)
          results.push(null)
        } else {
          const stmt = db.prepare(op.sql)
          if (op.type === 'query') {
            results.push(stmt.all(...(op.params || [])))
          } else if (op.type === 'queryOne') {
            results.push(stmt.get(...(op.params || [])))
          } else if (op.type === 'insert') {
            const res = stmt.run(...(op.params || []))
            results.push({ lastId: Number(res.lastInsertRowid) })
          } else if (op.type === 'update') {
            const res = stmt.run(...(op.params || []))
            results.push({ changes: res.changes })
          }
        }
      }
    })
    transaction()
    return { success: true, data: results }
  } catch (err: any) {
    return { success: false, error: String(err) }
  }
})

// 清除所有数据
// 数据库迁移
ipcMain.handle('db-migrate', async () => {
  try {
    if (useSimpleDB) {
      return { success: true, message: 'SimpleDB 不需要迁移' }
    }

    const db = ensureDatabase()

    // 迁移：检查并添加 balance 字段到 inventory_transactions 表（如果不存在）
    try {
      const tableInfo = db.prepare("PRAGMA table_info(inventory_transactions)").all() as any[]
      const hasBalanceColumn = tableInfo.some((col: any) => col.name === 'balance')
      if (!hasBalanceColumn) {
        log.info('Adding balance column to inventory_transactions table')
        db.prepare('ALTER TABLE inventory_transactions ADD COLUMN balance INTEGER NOT NULL DEFAULT 0').run()
        // 更新现有记录的 balance 值（基于当前库存）
        db.prepare(`
          UPDATE inventory_transactions 
          SET balance = (
            SELECT COALESCE(i.quantity, 0) 
            FROM inventory i 
            WHERE i.product_id = inventory_transactions.product_id
          )
        `).run()
        log.info('Migration completed: balance column added to inventory_transactions')
        return { success: true, message: '迁移成功：已添加 balance 字段' }
      } else {
        return { success: true, message: '迁移已完成：balance 字段已存在' }
      }
    } catch (migrationErr: any) {
      log.error('Migration failed:', migrationErr)
      return { success: false, error: String(migrationErr) }
    }
  } catch (err: any) {
    log.error('数据库迁移失败:', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('db-clear-all-data', async () => {
  try {
    if (useSimpleDB) {
      // SimpleDB 清除所有数据
      simpleDB.clearAll()
      return { success: true }
    }

    const db = ensureDatabase()

    // 获取所有表名（排除 sqlite_master 等系统表和 users 表）
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      AND name != 'sqlite_sequence'
      AND name != 'users'
    `).all() as { name: string }[]

    // 定义表删除顺序（先删除子表，再删除父表，排除 users 表）
    const tableOrder = [
      'inventory_transactions',
      'purchase_return_items',
      'purchase_returns',
      'purchase_order_items',
      'purchase_orders',
      'sales_order_items',
      'sales_orders',
      'system_logs',
      'inventory',
      'products',
      'suppliers',
      'customers',
      'categories'
    ]

    // 在事务中删除所有表的数据（排除 users 表），并禁用/启用外键约束
    db.transaction(() => {
      // 在事务内禁用外键约束
      db.prepare('PRAGMA foreign_keys = OFF').run()

      // 按顺序删除表数据
      for (const tableName of tableOrder) {
        const table = tables.find(t => t.name === tableName)
        if (table) {
          try {
            db.prepare(`DELETE FROM ${table.name}`).run()
            log.info(`已清除表 ${table.name} 的数据`)
          } catch (err: any) {
            log.warn(`清除表 ${table.name} 数据失败:`, err)
          }
        }
      }

      // 删除其他未在顺序列表中的表（排除 users 表）
      for (const table of tables) {
        if (!tableOrder.includes(table.name) && table.name !== 'users') {
          try {
            db.prepare(`DELETE FROM ${table.name}`).run()
            log.info(`已清除表 ${table.name} 的数据`)
          } catch (err: any) {
            log.warn(`清除表 ${table.name} 数据失败:`, err)
          }
        }
      }

      // 在事务内重新启用外键约束
      db.prepare('PRAGMA foreign_keys = ON').run()
    })()

    // 重置自增ID（在事务外执行，排除 users 表）
    for (const table of tables) {
      try {
        // 重置所有已清除表的自增ID（users 表不在 tables 列表中，所以不会被处理）
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table.name)
      } catch {
        // 忽略错误，某些表可能没有自增ID
      }
    }

    // 确保外键约束已启用（在事务外再次确认）
    db.prepare('PRAGMA foreign_keys = ON').run()

    // 迁移：检查并添加 balance 字段到 inventory_transactions 表（如果不存在）
    try {
      const tableInfo = db.prepare("PRAGMA table_info(inventory_transactions)").all() as any[]
      const hasBalanceColumn = tableInfo.some((col: any) => col.name === 'balance')
      if (!hasBalanceColumn) {
        log.info('Adding balance column to inventory_transactions table after data clear')
        db.prepare('ALTER TABLE inventory_transactions ADD COLUMN balance INTEGER NOT NULL DEFAULT 0').run()
        log.info('Migration completed: balance column added to inventory_transactions')
      }
    } catch (migrationErr: any) {
      log.warn('Migration failed after data clear:', migrationErr)
    }

    log.info('所有数据清除成功')
    return { success: true }
  } catch (err: any) {
    log.error('清除所有数据失败:', err)
    return { success: false, error: String(err) }
  }
})
function setupNodePath() {
  const extraPaths = [
    process.resourcesPath,
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    path.join(process.resourcesPath, 'app', 'node_modules'),
  ]
  const current = process.env.NODE_PATH || ''
  process.env.NODE_PATH = [...extraPaths, current].filter(Boolean).join(path.delimiter)
    ; (Module as any)._initPaths()

  // 确保 bindings 模块能被找到
  if (process.resourcesPath) {
    const bindingsPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'bindings')
    if (fs.existsSync(bindingsPath)) {
      log.info('bindings module found in app.asar.unpacked', { bindingsPath })
    } else {
      log.warn('bindings module not found in app.asar.unpacked', { bindingsPath })
    }

    const betterSqlite3Path = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')
    if (fs.existsSync(betterSqlite3Path)) {
      log.info('better-sqlite3 found in app.asar.unpacked', { betterSqlite3Path })

      // 尝试找到 .node 文件并设置环境变量
      const possibleNodePaths = [
        path.join(betterSqlite3Path, 'build', 'Release', 'better_sqlite3.node'),
        path.join(betterSqlite3Path, 'build', 'Debug', 'better_sqlite3.node'),
        path.join(betterSqlite3Path, 'build', 'better_sqlite3.node'),
        path.join(betterSqlite3Path, 'lib', 'binding', `node-v${process.versions.modules}-${process.platform}-${process.arch}`, 'better_sqlite3.node'),
      ]

      for (const nodePath of possibleNodePaths) {
        if (fs.existsSync(nodePath)) {
          process.env.BETTER_SQLITE3_BINARY_PATH = nodePath
          log.info('Found better-sqlite3.node file', { nodePath })
          break
        }
      }

      // 如果没找到，尝试搜索所有 .node 文件
      if (!process.env.BETTER_SQLITE3_BINARY_PATH) {
        try {
          const allNodeFiles: string[] = []
          const searchDir = (dir: string) => {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true })
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name)
                if (entry.isDirectory()) {
                  searchDir(fullPath)
                } else if (entry.name.endsWith('.node')) {
                  allNodeFiles.push(fullPath)
                }
              }
            } catch (e) {
              // 忽略错误
            }
          }
          searchDir(betterSqlite3Path)
          if (allNodeFiles.length > 0) {
            process.env.BETTER_SQLITE3_BINARY_PATH = allNodeFiles[0]
            log.info('Found better-sqlite3.node file by searching', { nodePath: allNodeFiles[0], allFound: allNodeFiles })
          } else {
            log.warn('No .node file found in better-sqlite3 directory', { betterSqlite3Path })
          }
        } catch (e) {
          log.warn('Failed to search for .node files', { error: String(e) })
        }
      }
    }
  }
}
