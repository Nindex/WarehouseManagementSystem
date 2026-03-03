import databaseService from '@/database/DatabaseService'

export interface SystemLog {
  id: number
  user_id: number | null
  operation_type: string
  table_name: string | null
  record_id: number | null
  old_values: string | null
  new_values: string | null
  description: string | null
  ip_address: string | null
  created_at: string
  user_name?: string
  document_number?: string
}

export interface CreateSystemLogData {
  user_id?: number | null
  operation_type: string
  table_name?: string | null
  record_id?: number | null
  old_values?: any
  new_values?: any
  description?: string | null
  ip_address?: string | null
}

class SystemLogService {
  /**
   * 确保system_logs表存在（迁移函数）
   */
  async ensureTableExists(): Promise<void> {
    let tableExists = false
    
    // 首先尝试检查表是否存在
    try {
      const result = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='system_logs'`
      )
      tableExists = !!result
    } catch (checkError: any) {
      // 如果检查失败（可能是表不存在），继续尝试创建
      console.log('检查system_logs表时出错，将尝试创建表:', checkError?.message)
      tableExists = false
    }
    
    // 如果表不存在，创建表
    if (!tableExists) {
      console.log('system_logs表不存在，开始创建...')
      
      // 使用 CREATE TABLE IF NOT EXISTS 避免并发创建时的错误
      const createTableSql = `CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        operation_type TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        description TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
      
      try {
        // 优先使用 exec 方法（支持多语句）
        if (databaseService.exec) {
          await databaseService.exec(createTableSql)
          console.log('system_logs表创建成功（使用exec方法）')
          // 等待一下确保表创建完成，然后立即验证表是否存在
          await new Promise(resolve => setTimeout(resolve, 150))
          
          // 立即尝试查询表，这会强制刷新 schema 缓存
          try {
            await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count FROM system_logs`
            )
            console.log('system_logs表创建后立即验证成功')
          } catch (verifyErr: any) {
            console.warn('system_logs表创建后立即验证失败（将在后续查询时重试）:', verifyErr?.message)
            // 不抛出错误，允许继续（表可能已经创建，只是 schema 缓存还没更新）
          }
        } else {
          // 使用 update 方法
          await databaseService.update(createTableSql, [])
          console.log('system_logs表创建成功（使用update方法）')
          // 等待一下确保表创建完成
          await new Promise(resolve => setTimeout(resolve, 150))
          
          // 立即尝试查询表，这会强制刷新 schema 缓存
          try {
            await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count FROM system_logs`
            )
            console.log('system_logs表创建后立即验证成功')
          } catch (verifyErr: any) {
            console.warn('system_logs表创建后立即验证失败（将在后续查询时重试）:', verifyErr?.message)
            // 不抛出错误，允许继续（表可能已经创建，只是 schema 缓存还没更新）
          }
        }
        
        // 创建索引（分别执行，避免错误影响表创建）
        const indexes = [
          'CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(user_id)',
          'CREATE INDEX IF NOT EXISTS idx_system_logs_operation ON system_logs(operation_type)',
          'CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)'
        ]
        
        for (const indexSql of indexes) {
          try {
            if (databaseService.exec) {
              await databaseService.exec(indexSql)
            } else {
              await databaseService.update(indexSql, [])
            }
          } catch (err: any) {
            console.warn('创建索引时出现警告（可忽略）:', indexSql, err?.message)
            // 继续创建其他索引，索引创建失败不影响表的使用
          }
        }
        
        console.log('system_logs表及索引创建完成')
        
        // 不进行严格验证，因为表创建后可能还需要一点时间才能在所有查询中可见
        // 如果表创建失败，会在后续查询时自动重试创建
        console.log('system_logs表创建完成（将在首次使用时验证）')
      } catch (createError: any) {
        console.error('创建system_logs表失败:', createError)
        // 如果创建失败，尝试使用更简单的方式
        try {
          // 尝试直接执行，不检查是否存在，使用 IF NOT EXISTS 避免重复创建错误
          const simpleCreateSql = `CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            operation_type TEXT NOT NULL,
            table_name TEXT,
            record_id INTEGER,
            old_values TEXT,
            new_values TEXT,
            description TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`
          
          if (databaseService.exec) {
            await databaseService.exec(simpleCreateSql)
            console.log('system_logs表创建成功（使用简化SQL + exec）')
          } else {
            await databaseService.update(simpleCreateSql, [])
            console.log('system_logs表创建成功（使用简化SQL + update）')
          }
          // 等待一下确保表创建完成
          await new Promise(resolve => setTimeout(resolve, 200))
          
          // 不进行严格验证，因为表创建后可能还需要一点时间才能在所有查询中可见
          // 如果表创建失败，会在后续查询时自动重试创建
          console.log('system_logs表创建完成（使用简化SQL，将在首次使用时验证）')
        } catch (retryError: any) {
          const errorMsg = `创建system_logs表失败: ${retryError?.message || String(retryError)}`
          console.error(errorMsg)
          throw new Error(errorMsg)
        }
      }
    }
  }

  /**
   * 创建操作日志
   */
  async createLog(data: CreateSystemLogData): Promise<SystemLog> {
    try {
      // 确保表存在
      await this.ensureTableExists()
      
      // 将对象转换为JSON字符串存储
      const oldValuesStr = data.old_values ? JSON.stringify(data.old_values) : null
      const newValuesStr = data.new_values ? JSON.stringify(data.new_values) : null
      
      // 获取当前系统时间（包含时分秒）- 使用本地时间
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      let logId: number = 0
      try {
        logId = await databaseService.insert(
          `INSERT INTO system_logs 
           (user_id, operation_type, table_name, record_id, old_values, new_values, description, ip_address, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.user_id || null,
            data.operation_type,
            data.table_name || null,
            data.record_id || null,
            oldValuesStr,
            newValuesStr,
            data.description || null,
            data.ip_address || null,
            currentTimestamp
          ]
        )
      } catch (insertError: any) {
        // 如果插入失败是因为表不存在，尝试再次创建表
        if (insertError?.message?.includes('no such table: system_logs')) {
          console.log('插入日志时发现表不存在，重新创建表...')
          await this.ensureTableExists()
          // 重试插入
          logId = await databaseService.insert(
            `INSERT INTO system_logs 
             (user_id, operation_type, table_name, record_id, old_values, new_values, description, ip_address, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              data.user_id || null,
              data.operation_type,
              data.table_name || null,
              data.record_id || null,
              oldValuesStr,
              newValuesStr,
              data.description || null,
              data.ip_address || null,
              currentTimestamp
            ]
          )
        } else {
          throw insertError
        }
      }

      const log = await this.getLogById(logId)
      if (!log) {
        throw new Error('创建日志失败')
      }

      return log
    } catch (error) {
      console.error('创建操作日志失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取日志
   */
  async getLogById(id: number): Promise<SystemLog | null> {
    try {
      await this.ensureTableExists()
      
      let log: SystemLog | null = null
      try {
        log = await databaseService.queryOne<SystemLog>(
          `SELECT 
             sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
             sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
             u.name as user_name
           FROM system_logs sl
           LEFT JOIN users u ON sl.user_id = u.id
           WHERE sl.id = ?`,
          [id]
        )
      } catch (queryError: any) {
        // 如果查询失败是因为表不存在，尝试再次创建表
        if (queryError?.message?.includes('no such table: system_logs')) {
          console.log('查询日志详情时发现表不存在，重新创建表...')
          await this.ensureTableExists()
          // 等待一下确保表创建完成
          await new Promise(resolve => setTimeout(resolve, 200))
          // 重试查询（表刚创建，应该返回 null）
          try {
            log = await databaseService.queryOne<SystemLog>(
              `SELECT 
                 sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
                 sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
                 u.name as user_name
               FROM system_logs sl
               LEFT JOIN users u ON sl.user_id = u.id
               WHERE sl.id = ?`,
              [id]
            )
          } catch (retryError: any) {
            // 如果重试仍然失败，返回 null 而不是抛出错误
            console.error('重试查询日志详情仍然失败:', retryError)
            log = null
          }
        } else {
          throw queryError
        }
      }

      if (log) {
        // 解析JSON字符串
        if (log.old_values) {
          try {
            log.old_values = JSON.parse(log.old_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
        if (log.new_values) {
          try {
            log.new_values = JSON.parse(log.new_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
      }

      return log
    } catch (error) {
      console.error('获取日志失败:', error)
      throw error
    }
  }

  /**
   * 获取操作日志列表
   */
  async getLogs(
    page = 1,
    pageSize = 20,
    filters?: {
      user_id?: number
      operation_type?: string
      table_name?: string
      record_id?: number
      start_date?: string
      end_date?: string
      document_number?: string
    }
  ): Promise<{ data: SystemLog[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureTableExists()
      // 等待一下确保表创建完成（如果刚创建的话）
      await new Promise(resolve => setTimeout(resolve, 100))
      
      let whereConditions = '1=1'
      const params: any[] = []

      if (filters?.user_id) {
        whereConditions += ' AND sl.user_id = ?'
        params.push(filters.user_id)
      }

      if (filters?.operation_type) {
        whereConditions += ' AND sl.operation_type = ?'
        params.push(filters.operation_type)
      }

      if (filters?.table_name) {
        whereConditions += ' AND sl.table_name = ?'
        params.push(filters.table_name)
      }

      if (filters?.record_id) {
        whereConditions += ' AND sl.record_id = ?'
        params.push(filters.record_id)
      }

      if (filters?.start_date) {
        whereConditions += ' AND sl.created_at >= ?'
        params.push(filters.start_date)
      }

      if (filters?.end_date) {
        whereConditions += ' AND sl.created_at <= ?'
        params.push(filters.end_date)
      }

      // 如果提供了单据号搜索，需要关联查询
      let documentNumberJoin = ''
      if (filters?.document_number) {
        // 通过LEFT JOIN关联查询单据号
        documentNumberJoin = `
          LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
          LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
        `
        whereConditions += ` AND (po.order_number LIKE ? OR pr.return_number LIKE ?)`
        const searchPattern = `%${filters.document_number}%`
        params.push(searchPattern, searchPattern)
      }

      // 获取总数
      let countResult: { count: number } | null = null
      try {
        countResult = await databaseService.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count 
           FROM system_logs sl 
           ${documentNumberJoin}
           WHERE ${whereConditions}`,
          params
        )
      } catch (queryError: any) {
        // 如果查询失败是因为表不存在，尝试再次创建表
        if (queryError?.message?.includes('no such table: system_logs')) {
          console.log('查询时发现表不存在，重新创建表...')
          await this.ensureTableExists()
          // 等待一下确保表创建完成
          await new Promise(resolve => setTimeout(resolve, 200))
          // 重试查询
          try {
            countResult = await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count 
               FROM system_logs sl 
               ${documentNumberJoin}
               WHERE ${whereConditions}`,
              params
            )
          } catch (retryError: any) {
            // 如果重试仍然失败，返回空结果而不是抛出错误
            console.error('重试查询仍然失败:', retryError)
            countResult = { count: 0 }
          }
        } else {
          throw queryError
        }
      }

      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      let logs: SystemLog[] = []
      try {
        // 先检查 users 表是否存在
        let usersTableExists = false
        try {
          const usersCheck = await databaseService.queryOne<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
          )
          usersTableExists = !!usersCheck
        } catch {
          usersTableExists = false
        }
        
        // 根据 users 表是否存在，使用不同的查询
        let querySql: string
        if (usersTableExists) {
          querySql = `SELECT 
             sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
             sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
             u.name as user_name,
             COALESCE(po.order_number, pr.return_number, '') as document_number
           FROM system_logs sl
           LEFT JOIN users u ON sl.user_id = u.id
           LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
           LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
           WHERE ${whereConditions}
           ORDER BY sl.created_at DESC 
           LIMIT ? OFFSET ?`
        } else {
          // 如果 users 表不存在，不使用 JOIN
          querySql = `SELECT 
             sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
             sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
             NULL as user_name,
             COALESCE(po.order_number, pr.return_number, '') as document_number
           FROM system_logs sl
           LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
           LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
           WHERE ${whereConditions}
           ORDER BY sl.created_at DESC 
           LIMIT ? OFFSET ?`
        }
        
        logs = await databaseService.query<any>(querySql, [...params, pageSize, offset])
      } catch (queryError: any) {
        // 如果查询失败是因为表不存在，尝试再次创建表
        if (queryError?.message?.includes('no such table: system_logs')) {
          console.log('查询数据时发现表不存在，重新创建表...')
          await this.ensureTableExists()
          // 等待更长时间确保表创建完成并刷新 schema 缓存
          await new Promise(resolve => setTimeout(resolve, 300))
          
          // 重试查询（表刚创建，应该返回空数组）
          try {
            // 检查 users 表是否存在
            const usersTableExists = await databaseService.queryOne<{ name: string }>(
              `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
            )
            
            let retryQuerySql: string
            if (usersTableExists) {
              retryQuerySql = `SELECT 
                 sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
                 sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
                 u.name as user_name,
                 COALESCE(po.order_number, pr.return_number, '') as document_number
               FROM system_logs sl
               LEFT JOIN users u ON sl.user_id = u.id
               LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
               LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
               WHERE ${whereConditions}
               ORDER BY sl.created_at DESC 
               LIMIT ? OFFSET ?`
            } else {
              retryQuerySql = `SELECT 
                 sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
                 sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
                 NULL as user_name,
                 COALESCE(po.order_number, pr.return_number, '') as document_number
               FROM system_logs sl
               LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
               LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
               WHERE ${whereConditions}
               ORDER BY sl.created_at DESC 
               LIMIT ? OFFSET ?`
            }
            
            logs = await databaseService.query<any>(retryQuerySql, [...params, pageSize, offset])
            console.log('重试查询数据成功，返回', logs.length, '条记录')
          } catch (retryError: any) {
            // 如果重试仍然失败，返回空数组而不是抛出错误
            console.error('重试查询数据失败:', retryError)
            logs = []
          }
        } else if (queryError?.message?.includes('no such table: users')) {
          // 如果 users 表不存在，使用不包含 users JOIN 的查询
          console.log('users表不存在，使用简化查询...')
          try {
            logs = await databaseService.query<any>(
              `SELECT 
                 sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
                 sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
                 NULL as user_name,
                 COALESCE(po.order_number, pr.return_number, '') as document_number
               FROM system_logs sl
               LEFT JOIN purchase_orders po ON sl.table_name = 'purchase_orders' AND sl.record_id = po.id
               LEFT JOIN purchase_returns pr ON sl.table_name = 'purchase_returns' AND sl.record_id = pr.id
               WHERE ${whereConditions}
               ORDER BY sl.created_at DESC 
               LIMIT ? OFFSET ?`,
              [...params, pageSize, offset]
            )
            console.log('使用简化查询成功，返回', logs.length, '条记录')
          } catch (simplifiedError: any) {
            console.error('简化查询也失败:', simplifiedError)
            logs = []
          }
        } else {
          throw queryError
        }
      }

      // 解析JSON字符串
      logs.forEach((log) => {
        if (log.old_values) {
          try {
            log.old_values = JSON.parse(log.old_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
        if (log.new_values) {
          try {
            log.new_values = JSON.parse(log.new_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
      })

      return {
        data: logs,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取操作日志列表失败:', error)
      throw error
    }
  }

  /**
   * 获取最近的操作日志
   */
  async getRecentLogs(limit = 10, userId?: number): Promise<SystemLog[]> {
    try {
      await this.ensureTableExists()
      
      let whereCondition = '1=1'
      const params: any[] = []

      if (userId) {
        whereCondition += ' AND sl.user_id = ?'
        params.push(userId)
      }

      let logs: SystemLog[] = []
      try {
        logs = await databaseService.query<SystemLog>(
          `SELECT 
             sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
             sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
             u.name as user_name
           FROM system_logs sl
           LEFT JOIN users u ON sl.user_id = u.id
           WHERE ${whereCondition}
           ORDER BY sl.created_at DESC 
           LIMIT ?`,
          [...params, limit]
        )
      } catch (queryError: any) {
        // 如果查询失败是因为表不存在，尝试再次创建表
        if (queryError?.message?.includes('no such table: system_logs')) {
          console.log('查询最近日志时发现表不存在，重新创建表...')
          await this.ensureTableExists()
          // 等待一下确保表创建完成
          await new Promise(resolve => setTimeout(resolve, 200))
          // 重试查询（表刚创建，应该返回空数组）
          try {
            logs = await databaseService.query<SystemLog>(
              `SELECT 
                 sl.id, sl.user_id, sl.operation_type, sl.table_name, sl.record_id,
                 sl.old_values, sl.new_values, sl.description, sl.ip_address, sl.created_at,
                 u.name as user_name
               FROM system_logs sl
               LEFT JOIN users u ON sl.user_id = u.id
               WHERE ${whereCondition}
               ORDER BY sl.created_at DESC 
               LIMIT ?`,
              [...params, limit]
            )
          } catch (retryError: any) {
            // 如果重试仍然失败，返回空数组而不是抛出错误
            console.error('重试查询最近日志仍然失败:', retryError)
            logs = []
          }
        } else {
          throw queryError
        }
      }

      // 解析JSON字符串
      logs.forEach((log) => {
        if (log.old_values) {
          try {
            log.old_values = JSON.parse(log.old_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
        if (log.new_values) {
          try {
            log.new_values = JSON.parse(log.new_values as any)
          } catch {
            // 如果解析失败，保持原样
          }
        }
      })

      return logs
    } catch (error) {
      console.error('获取最近操作日志失败:', error)
      throw error
    }
  }
}

export default new SystemLogService()
