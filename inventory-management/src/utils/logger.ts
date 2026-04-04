import fs from 'fs'
import path from 'path'

type Level = 'debug' | 'info' | 'warn' | 'error'

// 日志级别图标
const LEVEL_ICONS: Record<Level, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌'
}

// 日志级别颜色（控制台输出）
const LEVEL_COLORS: Record<Level, string> = {
  debug: '\x1b[36m', // 青色
  info: '\x1b[32m',  // 绿色
  warn: '\x1b[33m',  // 黄色
  error: '\x1b[31m'  // 红色
}
const RESET_COLOR = '\x1b[0m'

function getLogDir() {
  const baseDir = path.dirname(process.execPath)
  const logDir = path.join(baseDir, 'logs')
  if (!fs.existsSync(logDir)) {
    try {
      fs.mkdirSync(logDir, { recursive: true })
    } catch (e) {
      const msg = `日志目录不可写: ${logDir}`
      throw new Error(msg)
    }
  }
  try {
    fs.accessSync(logDir, fs.constants.W_OK)
  } catch (e) {
    const msg = `日志目录不可写: ${logDir}`
    throw new Error(msg)
  }
  return logDir
}

// 清理旧日志文件（保留最近30天）
function cleanupOldLogs() {
  try {
    const logDir = getLogDir()
    const files = fs.readdirSync(logDir)
    const now = Date.now()
    const maxAge = 30 * 24 * 60 * 60 * 1000 // 30天
    
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file)
        try {
          const stats = fs.statSync(filePath)
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath)
            console.log(`已删除旧日志文件: ${file}`)
          }
        } catch (e) {
          // 忽略错误
        }
      }
    }
  } catch (e) {
    // 忽略清理错误
  }
}

// 格式化时间戳
function formatTimestamp(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toTimeString().slice(0, 8)
  return `${date} ${time}`
}

// 格式化元数据
function formatMeta(meta?: any): string {
  if (meta === undefined || meta === null) {
    return ''
  }
  
  try {
    // 如果是简单对象，格式化得更易读
    if (typeof meta === 'object' && !Array.isArray(meta)) {
      const entries = Object.entries(meta)
      if (entries.length === 0) return ''
      
      // 格式化每个字段，一行一个
      const formatted = entries.map(([key, value]) => {
        let valStr = String(value)
        if (typeof value === 'object' && value !== null) {
          try {
            valStr = JSON.stringify(value, null, 2)
          } catch {
            valStr = String(value)
          }
        }
        return `    ${key}: ${valStr}`
      }).join('\n')
      
      return `\n${formatted}`
    }
    
    // 其他情况使用 JSON 格式化
    return `\n    ${JSON.stringify(meta, null, 2).split('\n').join('\n    ')}`
  } catch {
    return ` ${String(meta)}`
  }
}

// 格式化日志行
function formatLine(level: Level, scope: string, msg: string, meta?: any): string {
  const timestamp = formatTimestamp()
  const icon = LEVEL_ICONS[level]
  const levelUpper = level.toUpperCase().padEnd(5)
  const scopePadded = scope.padEnd(12)
  const metaStr = formatMeta(meta)
  const separator = '─'.repeat(80)
  
  // 文件日志格式（纯文本，无颜色）
  const fileLine = `${separator}\n${timestamp} | ${levelUpper} | ${scopePadded} | ${icon} ${msg}${metaStr}\n`
  
  return fileLine
}

// 格式化控制台输出（带颜色）
function formatConsoleLine(level: Level, scope: string, msg: string, meta?: any): string {
  const timestamp = formatTimestamp()
  const icon = LEVEL_ICONS[level]
  const color = LEVEL_COLORS[level]
  const levelUpper = level.toUpperCase().padEnd(5)
  const scopePadded = scope.padEnd(12)
  const metaStr = formatMeta(meta)
  
  return `${color}${timestamp} | ${levelUpper} | ${scopePadded} | ${icon} ${msg}${metaStr}${RESET_COLOR}`
}

export class Logger {
  private scope: string
  private stream: fs.WriteStream
  private static cleanupDone = false
  private static instances: Logger[] = []
  
  constructor(scope: string) {
    this.scope = scope
    
    // 首次创建日志时清理旧日志
    if (!Logger.cleanupDone) {
      cleanupOldLogs()
      Logger.cleanupDone = true
    }
    
    const file = path.join(getLogDir(), `${new Date().toISOString().slice(0, 10)}.log`)
    this.stream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' })
    
    // 记录实例用于退出时清理
    Logger.instances.push(this)
    
    // 写入日志文件头（如果是新文件）
    try {
      const stats = fs.statSync(file)
      if (stats.size === 0) {
        const header = `\n${'='.repeat(80)}\n日志文件创建时间: ${new Date().toLocaleString('zh-CN')}\n${'='.repeat(80)}\n\n`
        this.stream.write(header)
      }
    } catch {
      // 忽略错误
    }
  }
  
  private write(level: Level, msg: string, meta?: any) {
    const fileLine = formatLine(level, this.scope, msg, meta)
    const consoleLine = formatConsoleLine(level, this.scope, msg, meta)
    
    // 写入文件
    try {
      this.stream.write(fileLine)
    } catch (e) {
      // 如果写入失败，尝试输出到控制台
      console.error('日志写入失败:', e)
    }
    
    // 输出到控制台（带颜色）
    if (level === 'error') {
      console.error(consoleLine)
    } else if (level === 'warn') {
      console.warn(consoleLine)
    } else if (level === 'debug') {
      console.debug(consoleLine)
    } else {
      console.log(consoleLine)
    }
  }
  
  debug(msg: string, meta?: any) { this.write('debug', msg, meta) }
  info(msg: string, meta?: any) { this.write('info', msg, meta) }
  warn(msg: string, meta?: any) { this.write('warn', msg, meta) }
  error(msg: string, meta?: any) { this.write('error', msg, meta) }
  
  // 关闭日志流
  close() {
    try {
      this.stream.end()
    } catch { }
  }
  
  // 静态方法：关闭所有日志实例
  static closeAll() {
    for (const instance of Logger.instances) {
      instance.close()
    }
    Logger.instances = []
  }
}

export function createLogger(scope: string) { return new Logger(scope) }
