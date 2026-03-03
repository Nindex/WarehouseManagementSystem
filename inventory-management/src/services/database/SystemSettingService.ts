import databaseService from '@/database/DatabaseService'

class SystemSettingService {
  /**
   * 确保system_settings表存在
   */
  async ensureTableExists(): Promise<void> {
    let tableExists = false
    
    // 首先尝试检查表是否存在
    try {
      const result = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'`
      )
      tableExists = !!result
    } catch (checkError: any) {
      // 如果检查失败（可能是表不存在），继续尝试创建
      console.log('检查system_settings表时出错，将尝试创建表:', checkError?.message)
      tableExists = false
    }
    
    // 如果表不存在，创建表
    if (!tableExists) {
      console.log('system_settings表不存在，开始创建...')
      
      const createTableSql = `CREATE TABLE system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
      
      try {
        // 优先使用 exec 方法（支持多语句）
        if (databaseService.exec) {
          await databaseService.exec(createTableSql)
          console.log('system_settings表创建成功（使用exec方法）')
        } else {
          // 使用 update 方法
          await databaseService.update(createTableSql, [])
          console.log('system_settings表创建成功（使用update方法）')
        }
        
        // 等待一下确保表创建完成
        await new Promise(resolve => setTimeout(resolve, 150))
        
        // 立即尝试查询表，这会强制刷新 schema 缓存
        try {
          await databaseService.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM system_settings`
          )
          console.log('system_settings表创建后立即验证成功')
        } catch (verifyErr: any) {
          console.warn('system_settings表创建后立即验证失败（将在后续查询时重试）:', verifyErr?.message)
        }
        
        console.log('system_settings表创建完成')
      } catch (createError: any) {
        console.error('创建system_settings表失败:', createError)
        throw new Error(`创建system_settings表失败: ${createError?.message || String(createError)}`)
      }
    } else {
      console.log('system_settings表已存在')
    }
  }

  /**
   * 获取系统设置
   */
  async getSettings(): Promise<Record<string, string>> {
    try {
      // 确保表存在
      await this.ensureTableExists()
      
      const rows = await databaseService.query<any>(
        'SELECT key, value FROM system_settings'
      )
      const settings: Record<string, string> = {}
      rows.forEach((row: any) => {
        settings[row.key] = row.value || ''
      })
      return settings
    } catch (error: any) {
      console.error('获取系统设置失败:', error)
      // 如果表不存在，返回默认值
      if (error?.message?.includes('no such table: system_settings')) {
        try {
          await this.ensureTableExists()
          // 重试一次
          const rows = await databaseService.query<any>(
            'SELECT key, value FROM system_settings'
          )
          const settings: Record<string, string> = {}
          rows.forEach((row: any) => {
            settings[row.key] = row.value || ''
          })
          return settings
        } catch (retryError) {
          console.error('重试获取系统设置失败:', retryError)
          return this.getDefaultSettings()
        }
      }
      return this.getDefaultSettings()
    }
  }

  /**
   * 获取单个设置值
   */
  async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    try {
      // 确保表存在
      await this.ensureTableExists()
      
      const row = await databaseService.queryOne<{ value: string }>(
        'SELECT value FROM system_settings WHERE key = ?',
        [key]
      )
      return row?.value || defaultValue
    } catch (error: any) {
      console.error(`获取设置 ${key} 失败:`, error)
      // 如果表不存在，尝试创建后重试
      if (error?.message?.includes('no such table: system_settings')) {
        try {
          await this.ensureTableExists()
          const row = await databaseService.queryOne<{ value: string }>(
            'SELECT value FROM system_settings WHERE key = ?',
            [key]
          )
          return row?.value || defaultValue
        } catch (retryError) {
          console.error(`重试获取设置 ${key} 失败:`, retryError)
          return defaultValue
        }
      }
      return defaultValue
    }
  }

  /**
   * 设置系统设置
   */
  async setSetting(key: string, value: string, description?: string): Promise<void> {
    try {
      // 确保表存在
      await this.ensureTableExists()
      
      const exists = await databaseService.queryOne<{ id: number }>(
        'SELECT id FROM system_settings WHERE key = ?',
        [key]
      )
      
      if (exists) {
        await databaseService.update(
          'UPDATE system_settings SET value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
          [value, description || null, key]
        )
      } else {
        await databaseService.insert(
          'INSERT INTO system_settings (key, value, description, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [key, value, description || null]
        )
      }
    } catch (error: any) {
      console.error(`设置 ${key} 失败:`, error)
      // 如果表不存在，尝试创建后重试
      if (error?.message?.includes('no such table: system_settings')) {
        try {
          await this.ensureTableExists()
          // 重试设置
          const exists = await databaseService.queryOne<{ id: number }>(
            'SELECT id FROM system_settings WHERE key = ?',
            [key]
          )
          
          if (exists) {
            await databaseService.update(
              'UPDATE system_settings SET value = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
              [value, description || null, key]
            )
          } else {
            await databaseService.insert(
              'INSERT INTO system_settings (key, value, description, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
              [key, value, description || null]
            )
          }
        } catch (retryError) {
          console.error(`重试设置 ${key} 失败:`, retryError)
          throw retryError
        }
      } else {
        throw error
      }
    }
  }

  /**
   * 批量设置系统设置
   */
  async setSettings(settings: Record<string, string>): Promise<void> {
    try {
      for (const [key, value] of Object.entries(settings)) {
        await this.setSetting(key, value)
      }
    } catch (error) {
      console.error('批量设置失败:', error)
      throw error
    }
  }

  /**
   * 获取默认设置
   */
  private getDefaultSettings(): Record<string, string> {
    return {
      lowStockThreshold: '10',
      autoBackup: 'true',
      backupInterval: '7',
      language: 'zh-CN'
    }
  }
}

export default new SystemSettingService()

