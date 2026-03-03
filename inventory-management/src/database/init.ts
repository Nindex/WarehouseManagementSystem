import path from 'path'
import fs from 'fs'
import databaseService from './DatabaseService'

export interface DatabaseInitOptions {
  forceInit?: boolean
  backupExisting?: boolean
}

/**
 * 执行所有数据库迁移脚本（按顺序）
 */
async function executeMigrations(): Promise<void> {
  // 定义迁移脚本执行顺序（按依赖关系排序）
  const migrations = [
    {
      name: 'add_customer_stores',
      path: path.join(__dirname, 'migrations/add_customer_stores.sql'),
      description: '客户门店表'
    },
    {
      name: 'add_batch_and_outbound',
      path: path.join(__dirname, 'migrations/add_batch_and_outbound.sql'),
      description: '批次和出库相关表'
    },
    {
      name: 'add_composite_indexes',
      path: path.join(__dirname, '../database/migrations/add_composite_indexes.sql'),
      description: '组合索引'
    }
  ]

  for (const migration of migrations) {
    try {
      if (fs.existsSync(migration.path)) {
        const migrationScript = fs.readFileSync(migration.path, 'utf-8')
        await databaseService.executeScript(migrationScript)
        console.log(`✓ 迁移脚本已执行: ${migration.description} (${migration.name})`)
      } else {
        console.warn(`⚠ 迁移脚本不存在: ${migration.path}`)
      }
    } catch (migrationError: any) {
      // 如果是"表已存在"或"索引已存在"的错误，可以忽略（使用IF NOT EXISTS）
      const errorMessage = migrationError?.message || String(migrationError)
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        console.log(`ℹ 迁移脚本跳过（已存在）: ${migration.description} (${migration.name})`)
      } else {
        console.warn(`⚠ 执行迁移脚本时出现警告 (${migration.name}):`, errorMessage)
        // 不抛出错误，允许继续执行其他迁移
      }
    }
  }
}

/**
 * 初始化数据库
 * @param options 初始化选项
 */
export async function initializeDatabase(options: DatabaseInitOptions = {}): Promise<void> {
  const { forceInit = false, backupExisting = true } = options
  
  try {
    // 检查数据库文件是否存在
    const dbPath = path.join(__dirname, '../../data/inventory.db')
    const dbExists = fs.existsSync(dbPath)
    
    if (dbExists && !forceInit) {
      console.log('数据库已存在，跳过初始化')
      
      // 初始化数据库连接
      await databaseService.initialize()
      
      // 性能优化：应用SQLite性能配置（即使数据库已存在也要应用）
      try {
        await databaseService.exec('PRAGMA journal_mode = WAL')
        await databaseService.exec('PRAGMA synchronous = NORMAL')
        await databaseService.exec('PRAGMA cache_size = -64000')
        await databaseService.exec('PRAGMA temp_store = MEMORY')
        await databaseService.exec('PRAGMA mmap_size = 268435456')
        await databaseService.exec('PRAGMA foreign_keys = ON')
        console.log('SQLite性能配置已应用')
      } catch (configError) {
        console.warn('应用SQLite性能配置时出现警告:', configError)
      }
      
      // 执行所有迁移脚本（按顺序执行）
      await executeMigrations()
      
      return
    }
    
    if (dbExists && forceInit && backupExisting) {
      // 备份现有数据库
      const backupPath = `${dbPath}.backup.${Date.now()}`
      fs.copyFileSync(dbPath, backupPath)
      console.log(`已备份现有数据库到: ${backupPath}`)
    }
    
    // 确保数据目录存在
    const dataDir = path.dirname(dbPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
      console.log('创建数据目录:', dataDir)
    }
    
    // 初始化数据库连接
    await databaseService.initialize()
    
    // 性能优化：配置SQLite性能参数
    try {
      await databaseService.exec('PRAGMA journal_mode = WAL') // 写前日志，提高并发性能
      await databaseService.exec('PRAGMA synchronous = NORMAL') // 平衡性能和数据安全
      await databaseService.exec('PRAGMA cache_size = -64000') // 64MB缓存（-64000表示64MB，负值表示KB）
      await databaseService.exec('PRAGMA temp_store = MEMORY') // 临时表存储在内存中
      await databaseService.exec('PRAGMA mmap_size = 268435456') // 256MB内存映射
      await databaseService.exec('PRAGMA foreign_keys = ON') // 启用外键约束
      console.log('SQLite性能配置已应用')
    } catch (configError) {
      console.warn('应用SQLite性能配置时出现警告:', configError)
      // 不抛出错误，允许继续执行
    }
    
    // 读取SQL脚本
    const schemaPath = path.join(__dirname, 'schema.sql')
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`数据库架构文件不存在: ${schemaPath}`)
    }
    
    const sqlScript = fs.readFileSync(schemaPath, 'utf-8')
    
    // 执行数据库初始化脚本
    await databaseService.executeScript(sqlScript)
    
    // 执行所有迁移脚本（按顺序执行）
    await executeMigrations()
    
    console.log('数据库初始化成功')
    
  } catch (error) {
    console.error('数据库初始化失败:', error)
    throw error
  }
}

/**
 * 检查数据库连接状态
 */
export function checkDatabaseStatus(): { connected: boolean; path: string } {
  return databaseService.getStatus()
}

/**
 * 备份数据库
 * @param backupPath 备份文件路径
 */
export async function backupDatabase(backupPath?: string): Promise<void> {
  try {
    const defaultBackupPath = path.join(__dirname, `../../backups/inventory_backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.db`)
    const finalBackupPath = backupPath || defaultBackupPath
    
    // 确保备份目录存在
    const backupDir = path.dirname(finalBackupPath)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    await databaseService.backup(finalBackupPath)
    console.log(`数据库备份成功: ${finalBackupPath}`)
    
  } catch (error) {
    console.error('数据库备份失败:', error)
    throw error
  }
}

/**
 * 恢复数据库
 * @param backupPath 备份文件路径
 */
export async function restoreDatabase(backupPath: string): Promise<void> {
  try {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份文件不存在: ${backupPath}`)
    }
    
    await databaseService.restore(backupPath)
    console.log(`数据库恢复成功: ${backupPath}`)
    
  } catch (error) {
    console.error('数据库恢复失败:', error)
    throw error
  }
}

/**
 * 获取数据库统计信息
 */
export async function getDatabaseStats(): Promise<{
  totalSize: number
  tableCount: number
  totalRecords: number
  lastBackup?: string
}> {
  try {
    // 获取数据库文件大小
    const dbPath = path.join(__dirname, '../../data/inventory.db')
    const stats = fs.statSync(dbPath)
    const totalSize = stats.size
    
    // 获取表数量和记录数
    const tables = await databaseService.query<{
      name: string
      records: number
    }>(`
      SELECT 
        name,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='table') as table_count,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%') as user_tables
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `)
    
    let totalRecords = 0
    for (const table of tables) {
      const count = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table.name}`
      )
      totalRecords += count?.count || 0
    }
    
    // 获取最近的备份文件
    const backupDir = path.join(__dirname, '../../backups')
    let lastBackup: string | undefined
    
    if (fs.existsSync(backupDir)) {
      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('inventory_backup_') && file.endsWith('.db'))
        .sort()
        .reverse()
      
      if (backupFiles.length > 0) {
        lastBackup = backupFiles[0]
      }
    }
    
    return {
      totalSize,
      tableCount: tables.length,
      totalRecords,
      lastBackup
    }
    
  } catch (error) {
    console.error('获取数据库统计信息失败:', error)
    throw error
  }
}

export default {
  initializeDatabase,
  checkDatabaseStatus,
  backupDatabase,
  restoreDatabase,
  getDatabaseStats
}