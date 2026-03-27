import databaseService from '@/database/DatabaseService'
import SystemLogService from './SystemLogService'

export interface InventoryTransaction {
  id: number
  product_id: number
  type: 'in' | 'out' | 'adjust' | 'transfer'
  quantity: number
  balance: number
  batch_number?: string
  reference_type?: string
  reference_id?: number
  notes?: string
  created_by?: number
  created_at: string
  product_name?: string
  product_sku?: string
  creator_name?: string
}

export interface StockAdjustmentData {
  product_id: number
  quantity: number
  type: 'in' | 'out' | 'adjust'
  location?: string
  batch_number?: string
  production_date?: string
  expiry_date?: string
  notes?: string
  // 本次操作涉及的 SN 码列表（主要用于出库时精确追踪）
  serial_numbers?: string[]
  reference_type?: string
  reference_id?: number
  created_by?: number
  customer_id?: number // 出库时的客户ID
  store_id?: number // 出库时的门店ID
  outbound_price?: number // 出库时的价格
}

export interface InventoryBatch {
  id: number
  product_id: number
  batch_number: string
  quantity: number
  location?: string
  production_date?: string
  expiry_date?: string
  inbound_date: string
  created_at: string
  updated_at: string
}

export interface OutboundRecord {
  id: number
  product_id: number
  batch_id: number
  batch_number: string
  customer_id: number
  store_id?: number
  quantity: number
  outbound_price?: number
  outbound_date: string
  location?: string
  notes?: string
  created_by?: number
  created_at: string
  product_name?: string
  customer_name?: string
  store_name?: string
}

export interface InventoryReport {
  product_id: number
  product_name: string
  product_sku: string
  category_name?: string
  current_stock: number
  total_value: number
  avg_price: number
  min_stock: number
  max_stock: number
  turnover_rate: number
}

class InventoryService {
  /**
   * 确保批次表和出库记录表存在
   */
  private async ensureBatchTables(): Promise<void> {
    try {
      // 检查并创建批次库存表
      const batchTableExists = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_batches'`
      )
      
      if (!batchTableExists) {
        await databaseService.exec(`
          CREATE TABLE inventory_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            batch_number TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            location TEXT,
            production_date DATE,
            expiry_date DATE,
            inbound_date DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id),
            UNIQUE(product_id, batch_number)
          )
        `)
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON inventory_batches(product_id)')
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_inventory_batches_batch ON inventory_batches(batch_number)')
        console.log('批次库存表创建成功')
      }

      // 检查并创建出库记录表
      const outboundTableExists = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='outbound_records'`
      )
      
      if (!outboundTableExists) {
        await databaseService.exec(`
          CREATE TABLE outbound_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            batch_number TEXT NOT NULL,
            customer_id INTEGER NOT NULL,
            store_id INTEGER,
            quantity INTEGER NOT NULL,
            outbound_price DECIMAL(10,2),
            outbound_date DATETIME NOT NULL,
            location TEXT,
            notes TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (store_id) REFERENCES customer_stores(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
          )
        `)
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_product ON outbound_records(product_id)')
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_customer ON outbound_records(customer_id)')
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_store ON outbound_records(store_id)')
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_batch ON outbound_records(batch_id)')
        await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_date ON outbound_records(outbound_date)')
        console.log('出库记录表创建成功')
      } else {
        // 检查并修复缺失的字段（自动迁移）
        try {
          const columns = await databaseService.query<{ name: string }>(
            "PRAGMA table_info('outbound_records')"
          )
          const columnNames = columns.map(col => col.name)
          
          // 检查并添加 store_id 字段
          if (!columnNames.includes('store_id')) {
            console.warn('检测到 outbound_records 表缺少 store_id 字段，正在添加...')
            await databaseService.exec('ALTER TABLE outbound_records ADD COLUMN store_id INTEGER')
            await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_records_store ON outbound_records(store_id)')
            console.log('自动迁移完成：已为 outbound_records 添加 store_id 字段')
          }
          
          // 检查并添加 outbound_price 字段
          if (!columnNames.includes('outbound_price')) {
            console.warn('检测到 outbound_records 表缺少 outbound_price 字段，正在添加...')
            await databaseService.exec('ALTER TABLE outbound_records ADD COLUMN outbound_price DECIMAL(10,2)')
            console.log('自动迁移完成：已为 outbound_records 添加 outbound_price 字段')
          }
        } catch (e: any) {
          console.warn('检查/添加 outbound_records 字段失败，请手动迁移:', e?.message || e)
        }
      }

      // 检查并创建 SN 出库明细表（按单个 SN 追踪出库去向）
      try {
        const snTableExists = await databaseService.queryOne<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='outbound_sn_items'`
        )

        if (!snTableExists) {
          console.log('outbound_sn_items 表不存在，开始创建...')
          await databaseService.exec(`
            CREATE TABLE outbound_sn_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              outbound_id INTEGER NOT NULL,
              product_id INTEGER NOT NULL,
              batch_id INTEGER,
              batch_number TEXT,
              customer_id INTEGER,
              store_id INTEGER,
              serial_number TEXT NOT NULL,
              quantity INTEGER NOT NULL DEFAULT 1,
              outbound_date DATETIME NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (outbound_id) REFERENCES outbound_records(id),
              FOREIGN KEY (product_id) REFERENCES products(id),
              FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
              FOREIGN KEY (customer_id) REFERENCES customers(id),
              FOREIGN KEY (store_id) REFERENCES customer_stores(id)
            )
          `)
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_outbound ON outbound_sn_items(outbound_id)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_store ON outbound_sn_items(store_id)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_serial ON outbound_sn_items(serial_number)')
          // 同一商品下 SN 不允许重复出库（同一 product_id + SN 组合唯一）
          await databaseService.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_sn_items_unique_sn ON outbound_sn_items(product_id, serial_number)')
          console.log('outbound_sn_items 表创建成功')
        }
      } catch (snErr: any) {
        console.warn('检查/创建 outbound_sn_items 表时出现警告:', snErr?.message || snErr)
      }

      // 检查并创建 SN 码状态表
      try {
        const snStatusTableExists = await databaseService.queryOne<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='sn_status'`
        )

        if (!snStatusTableExists) {
          console.log('sn_status 表不存在，开始创建...')
          await databaseService.exec(`
            CREATE TABLE sn_status (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              product_id INTEGER NOT NULL,
              sku TEXT NOT NULL,
              serial_number TEXT NOT NULL,
              batch_number TEXT,
              status INTEGER NOT NULL DEFAULT 0,
              inbound_date DATETIME,
              outbound_date DATETIME,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (product_id) REFERENCES products(id),
              UNIQUE(sku, serial_number)
            )
          `)
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_product ON sn_status(product_id)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_sku ON sn_status(sku)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_serial ON sn_status(serial_number)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_batch ON sn_status(batch_number)')
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_status ON sn_status(status)')
          // 创建组合索引以优化 (sku, serial_number) 查询
          await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_sku_serial ON sn_status(sku, serial_number)')
          console.log('sn_status 表创建成功')
        } else {
          // 表已存在，检查是否需要添加 sku 字段（数据迁移）
          try {
            const columns = await databaseService.query<{ name: string }>(
              "PRAGMA table_info('sn_status')"
            )
            const columnNames = columns.map(col => col.name)
            
            // 检查并添加 sku 字段
            if (!columnNames.includes('sku')) {
              console.warn('检测到 sn_status 表缺少 sku 字段，正在添加并迁移数据...')
              
              // 添加 sku 字段
              await databaseService.exec('ALTER TABLE sn_status ADD COLUMN sku TEXT')
              
              // 从 products 表更新 sku 字段
              await databaseService.exec(`
                UPDATE sn_status 
                SET sku = (SELECT sku FROM products WHERE products.id = sn_status.product_id)
                WHERE sku IS NULL
              `)
              
              // 删除旧的唯一约束（如果存在）
              try {
                await databaseService.exec('DROP INDEX IF EXISTS idx_sn_status_product_serial')
              } catch {}
              
              // 创建新的唯一约束（基于 sku, serial_number）
              await databaseService.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sn_status_sku_serial_unique ON sn_status(sku, serial_number)')
              
              // 创建 sku 索引
              await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_sku ON sn_status(sku)')
              
              // 创建组合索引以优化查询
              await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_sn_status_sku_serial ON sn_status(sku, serial_number)')
              
              console.log('自动迁移完成：已为 sn_status 添加 sku 字段并更新唯一约束')
            }
          } catch (migrationErr: any) {
            console.warn('检查/迁移 sn_status 字段失败:', migrationErr?.message || migrationErr)
          }
        }
      } catch (snStatusErr: any) {
        console.warn('检查/创建 sn_status 表时出现警告:', snStatusErr?.message || snStatusErr)
      }
    } catch (err: any) {
      console.warn('检查/创建批次表时出现警告:', err.message || err)
    }
  }

  /**
   * 确保 balance 字段存在（迁移检查）
   */
  private async ensureBalanceColumn(): Promise<void> {
    try {
      // 检查表是否有 balance 字段
      const tableInfo = await databaseService.query<any>(
        "PRAGMA table_info(inventory_transactions)"
      )
      const hasBalanceColumn = tableInfo && tableInfo.length > 0 && tableInfo.some((col: any) => col.name === 'balance')
      
      if (!hasBalanceColumn) {
        // 添加 balance 字段
        await databaseService.exec('ALTER TABLE inventory_transactions ADD COLUMN balance INTEGER NOT NULL DEFAULT 0')
        // 更新现有记录的 balance 值
        try {
          await databaseService.exec(`
            UPDATE inventory_transactions 
            SET balance = (
              SELECT COALESCE(i.quantity, 0) 
              FROM inventory i 
              WHERE i.product_id = inventory_transactions.product_id
            )
          `)
        } catch (updateErr: any) {
          // 如果更新失败，使用默认值 0，不影响后续操作
          console.warn('Failed to update balance values, using default 0:', updateErr)
        }
        console.log('Migration: balance column added to inventory_transactions')
      }
    } catch (err: any) {
      // 如果表不存在或其他错误，忽略（表会在首次使用时创建）
      // 这可能是正常的，因为表可能还没有创建
      console.warn('Migration check failed (may be expected if table does not exist):', err.message || err)
    }
  }

  /**
   * 确保 batch_number 字段存在（迁移检查）
   */
  private async ensureBatchNumberColumn(): Promise<void> {
    try {
      // 检查表是否有 batch_number 字段
      const tableInfo = await databaseService.query<any>(
        "PRAGMA table_info(inventory_transactions)"
      )
      const hasBatchNumberColumn = tableInfo && tableInfo.length > 0 && tableInfo.some((col: any) => col.name === 'batch_number')
      
      if (!hasBatchNumberColumn) {
        // 添加 batch_number 字段
        await databaseService.exec('ALTER TABLE inventory_transactions ADD COLUMN batch_number TEXT')
        console.log('Migration: batch_number column added to inventory_transactions')
      }
    } catch (err: any) {
      // 如果表不存在或其他错误，忽略（表会在首次使用时创建）
      console.warn('Migration check failed (may be expected if table does not exist):', err.message || err)
    }
  }

  /**
   * 生成批次号
   * 格式：YYMMDDHHMM + 自增数字（3位，从001开始）
   * 例如：2412171430000, 2412171430001, 2412171430002
   */
  async generateBatchNumber(): Promise<string> {
    try {
      await this.ensureBatchTables()
      
      const now = new Date()
      const year = String(now.getFullYear()).slice(-2) // 后两位年份
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      const prefix = `${year}${month}${day}${hour}${minute}`
      
      // 查询当天同一时间段（相同前缀）的所有批次号
      const batches = await databaseService.query<{ batch_number: string }>(
        `SELECT batch_number FROM inventory_batches 
         WHERE batch_number LIKE ? 
         ORDER BY batch_number DESC 
         LIMIT 100`,
        [`${prefix}%`]
      )
      
      // 找到最大的自增数字
      let maxIncrement = -1
      for (const batch of batches) {
        const batchNumber = batch.batch_number
        if (batchNumber.startsWith(prefix) && batchNumber.length === prefix.length + 3) {
          const incrementStr = batchNumber.slice(prefix.length)
          const increment = parseInt(incrementStr, 10)
          if (!isNaN(increment) && increment > maxIncrement) {
            maxIncrement = increment
          }
        }
      }
      
      // 生成新的自增数字（从0开始，如果找到最大值则+1）
      const nextIncrement = maxIncrement + 1
      const incrementStr = String(nextIncrement).padStart(3, '0') // 用0填充到3位
      
      return `${prefix}${incrementStr}`
    } catch (error) {
      console.error('生成批次号失败:', error)
      // 如果生成失败，返回带时间戳的批次号
      const now = new Date()
      const year = String(now.getFullYear()).slice(-2)
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hour = String(now.getHours()).padStart(2, '0')
      const minute = String(now.getMinutes()).padStart(2, '0')
      return `${year}${month}${day}${hour}${minute}000`
    }
  }

  /**
   * 调整库存
   */
  async adjustStock(data: StockAdjustmentData): Promise<void> {
    try {
      // 验证必填字段
      if (!data.product_id) {
        throw new Error('商品ID不能为空')
      }
      if (data.quantity === undefined || data.quantity === null) {
        throw new Error('库存数量不能为空')
      }
      if (data.quantity < 0) {
        throw new Error('库存数量不能为负数')
      }

      // 确保 balance 字段存在（迁移检查）
      await this.ensureBalanceColumn()
      // 确保 batch_number 字段存在（迁移检查）
      await this.ensureBatchNumberColumn()
      // 确保批次表存在
      await this.ensureBatchTables()

      return await databaseService.transaction(async () => {
        // 获取当前库存
        const currentInventory = await databaseService.queryOne<{ quantity: number }>(
          'SELECT quantity FROM inventory WHERE product_id = ?',
          [data.product_id]
        )

        const currentQuantity = currentInventory?.quantity || 0
        let newQuantity: number = currentQuantity
        
        // 批次号变量，在整个事务中可用
        let batchNumber: string | undefined = data.batch_number
        if (data.type === 'in') {
          // 入库时创建批次记录
          // 如果批次号为空，自动生成批次号
          if (!batchNumber || !batchNumber.trim()) {
            batchNumber = await this.generateBatchNumber()
          }
        }

        // 计算新库存数量
        if (data.type === 'in') {
          newQuantity = currentQuantity + (data.quantity || 0)
          
          // 入库时检查SN码是否重复（同一SKU下不允许重复SN码，不论批次）
          // SN码只从 serial_numbers 中获取，不从 notes 中提取
          const snCodesToCheck: string[] = data.serial_numbers && data.serial_numbers.length > 0
            ? data.serial_numbers.map(sn => sn.trim()).filter(sn => sn)
            : []
          
          if (snCodesToCheck.length > 0) {
            // 获取商品的 SKU
            const product = await databaseService.queryOne<{ sku: string; name: string }>(
              'SELECT sku, name FROM products WHERE id = ?',
              [data.product_id]
            )
            
            if (!product || !product.sku) {
              throw new Error('无法获取商品SKU信息')
            }
            
            // 查询该SKU下已存在的SN码（从 sn_status 表查询，性能优化）
            const existingSNs = await databaseService.query<{ serial_number: string }>(
              `SELECT serial_number 
               FROM sn_status 
               WHERE sku = ? AND serial_number IN (${snCodesToCheck.map(() => '?').join(',')})`,
              [product.sku, ...snCodesToCheck]
            )
            
            const existingSNSet = new Set<string>(
              existingSNs.map(row => row.serial_number.trim())
            )
            
            // 检查是否有重复的SN码
            const duplicateSNs: string[] = []
            snCodesToCheck.forEach(sn => {
              const trimmedSn = sn.trim()
              if (trimmedSn && existingSNSet.has(trimmedSn)) {
                duplicateSNs.push(trimmedSn)
              }
            })
            
            if (duplicateSNs.length > 0) {
              throw new Error(`SKU "${product.sku}" (${product.name}) 下已存在以下SN码，不允许重复录入：${duplicateSNs.join(', ')}`)
            }
          }
          
          if (batchNumber) {
            const now = new Date()
            const currentTimestamp = 
              now.getFullYear() + '-' +
              String(now.getMonth() + 1).padStart(2, '0') + '-' +
              String(now.getDate()).padStart(2, '0') + ' ' +
              String(now.getHours()).padStart(2, '0') + ':' +
              String(now.getMinutes()).padStart(2, '0') + ':' +
              String(now.getSeconds()).padStart(2, '0')
            
            // 检查批次是否已存在
            const existingBatch = await databaseService.queryOne<{ id: number; quantity: number }>(
              'SELECT id, quantity FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
              [data.product_id, batchNumber]
            )
            
            if (existingBatch) {
              // 更新现有批次数量
              await databaseService.update(
                `UPDATE inventory_batches 
                 SET quantity = quantity + ?, location = COALESCE(?, location), 
                     production_date = COALESCE(?, production_date),
                     expiry_date = COALESCE(?, expiry_date),
                     updated_at = ? 
                 WHERE id = ?`,
                [
                  data.quantity,
                  data.location || null,
                  data.production_date || null,
                  data.expiry_date || null,
                  currentTimestamp,
                  existingBatch.id
                ]
              )
            } else {
              // 创建新批次
              await databaseService.insert(
                `INSERT INTO inventory_batches 
                 (product_id, batch_number, quantity, location, production_date, expiry_date, inbound_date, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  data.product_id,
                  batchNumber,
                  data.quantity,
                  data.location || null,
                  data.production_date || null,
                  data.expiry_date || null,
                  currentTimestamp,
                  currentTimestamp,
                  currentTimestamp
                ]
              )
            }
          }
        } else if (data.type === 'out') {
          const outQuantity = data.quantity || 0
          if (currentQuantity < outQuantity) {
            throw new Error('库存不足')
          }
          newQuantity = currentQuantity - outQuantity
          
          // 出库时使用FIFO规则，记录客户和批次，并按 SN 维度记录出库明细
          if (data.customer_id) {
            await this.processOutboundWithFIFO(
              data.product_id,
              outQuantity,
              data.customer_id,
              data.store_id,
              data.location,
              data.notes,
              data.created_by,
              data.serial_numbers || [],
              data.outbound_price
            )
          }
        } else if (data.type === 'adjust') {
          newQuantity = data.quantity || 0
        }

        // 确保 newQuantity 不是 null 或 undefined，并转换为数字
        const finalQuantity = Number(newQuantity)
        if (isNaN(finalQuantity) || finalQuantity < 0) {
          throw new Error('计算后的库存数量无效')
        }

        // 更新库存表
        if (currentInventory) {
          await databaseService.update(
            `UPDATE inventory 
             SET quantity = ?, location = ?, batch_number = ?, 
                 production_date = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE product_id = ?`,
            [
              finalQuantity, 
              data.location || null, 
              data.batch_number || null,
              data.production_date || null, 
              data.expiry_date || null,
              data.product_id
            ]
          )
        } else {
          await databaseService.insert(
            `INSERT INTO inventory (product_id, quantity, location, batch_number, 
              production_date, expiry_date, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              data.product_id, 
              finalQuantity, 
              data.location || null, 
              data.batch_number || null,
              data.production_date || null, 
              data.expiry_date || null
            ]
          )
        }

        // 记录库存变动
        await databaseService.insert(
          `INSERT INTO inventory_transactions 
           (product_id, type, quantity, balance, batch_number, reference_type, reference_id, notes, created_by, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            data.product_id, 
            data.type, 
            data.quantity, 
            finalQuantity, // balance 是操作后的库存余额
            data.batch_number || null,
            data.reference_type || null, 
            data.reference_id || null,
            data.notes || null, 
            data.created_by || null
          ]
        )

        // 获取客户和门店名称用于日志记录
        let customerName: string | undefined
        let storeName: string | undefined
        if (data.customer_id) {
          const customer = await databaseService.queryOne<{ name: string }>(
            'SELECT name FROM customers WHERE id = ?',
            [data.customer_id]
          )
          customerName = customer?.name
        }
        if (data.store_id) {
          const store = await databaseService.queryOne<{ store_name: string }>(
            'SELECT store_name FROM customer_stores WHERE id = ?',
            [data.store_id]
          )
          storeName = store?.store_name
        }

        // 记录操作日志（异步，不阻塞主流程）
        const operationTypeMap: Record<string, string> = {
          'in': 'inbound',
          'out': 'outbound',
          'adjust': 'inventory_check'
        }
        const operationType = operationTypeMap[data.type] || 'inventory_adjust'
        const operationDescMap: Record<string, string> = {
          'in': '入库',
          'out': '出库',
          'adjust': '盘点调整'
        }
        const operationDesc = operationDescMap[data.type] || '库存调整'
        
        // SN码只通过 serial_numbers 传递，不填入notes
        const logNotes: string | undefined = data.notes || undefined
        const snCodesForLog: string[] | undefined = data.serial_numbers && data.serial_numbers.length > 0
          ? [...data.serial_numbers]
          : undefined

        SystemLogService.createLog({
          user_id: data.created_by || null,
          operation_type: operationType,
          table_name: 'inventory',
          record_id: data.product_id,
          new_values: { 
            type: data.type, 
            quantity: data.quantity, 
            new_quantity: finalQuantity,
            old_quantity: currentQuantity,
            customer_id: data.customer_id,
            customer_name: customerName,
            store_id: data.store_id,
            store_name: storeName,
            location: data.location,
            batch_number: data.batch_number,
            notes: logNotes,
            sn_codes: snCodesForLog
          },
          description: `${operationDesc}: 数量 ${data.quantity}, 库存从 ${currentQuantity} 变为 ${finalQuantity}${customerName ? `，客户：${customerName}` : ''}${storeName ? `，门店：${storeName}` : ''}`
        }).catch(err => console.error('记录操作日志失败:', err))

        // 入库时，为每个SN码创建状态记录（status=0，未出库）
        // 确保所有SN码都写入 sn_status 表，以便后续快速验证
        if (data.type === 'in' && snCodesForLog && snCodesForLog.length > 0) {
          // 获取商品的 SKU（用于唯一性约束）
          const productInfo = await databaseService.queryOne<{ sku: string }>(
            'SELECT sku FROM products WHERE id = ?',
            [data.product_id]
          )
          
          if (!productInfo || !productInfo.sku) {
            throw new Error('无法获取商品SKU信息，无法创建SN码状态记录')
          }
          
          // 确保有批次号
          const finalBatchNumber = batchNumber || data.batch_number || await this.generateBatchNumber()
          if (finalBatchNumber) {
            const now = new Date()
            const currentTimestamp = 
              now.getFullYear() + '-' +
              String(now.getMonth() + 1).padStart(2, '0') + '-' +
              String(now.getDate()).padStart(2, '0') + ' ' +
              String(now.getHours()).padStart(2, '0') + ':' +
              String(now.getMinutes()).padStart(2, '0') + ':' +
              String(now.getSeconds()).padStart(2, '0')
            
            for (const sn of snCodesForLog) {
              if (!sn || !sn.trim()) continue
              try {
                // 检查SN码状态是否已存在（基于 sku, serial_number）
                const existingStatus = await databaseService.queryOne<{ id: number }>(
                  'SELECT id FROM sn_status WHERE sku = ? AND serial_number = ?',
                  [productInfo.sku, sn.trim()]
                )
                
                if (!existingStatus) {
                  // 创建新的SN码状态记录（包含 sku 字段）
                  await databaseService.insert(
                    `INSERT INTO sn_status 
                     (product_id, sku, serial_number, batch_number, status, inbound_date, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
                    [
                      data.product_id,
                      productInfo.sku,
                      sn.trim(),
                      finalBatchNumber.trim(),
                      currentTimestamp,
                      currentTimestamp,
                      currentTimestamp
                    ]
                  )
                }
              } catch (snErr: any) {
                // 如果是唯一约束错误，说明SN码已存在，这是不应该发生的（因为入库前已检查）
                if (snErr?.message?.includes('UNIQUE constraint')) {
                  throw new Error(`SN码 "${sn.trim()}" 在SKU "${productInfo.sku}" 下已存在，无法重复入库`)
                }
                console.warn(`创建SN码状态记录失败 (${sn}):`, snErr?.message || snErr)
                throw snErr // 重新抛出错误，避免数据不一致
              }
            }
          }
        }

        // 出库时，更新SN码状态为已出库（status=1）
        // 注意：如果使用了processOutboundWithFIFO方法，SN码状态会在那里更新
        // 这里只处理没有客户ID的情况（通常不会发生，因为前端要求必须选择客户）
        if (data.type === 'out' && snCodesForLog && snCodesForLog.length > 0 && !data.customer_id) {
          // 获取商品的 SKU
          const productInfo = await databaseService.queryOne<{ sku: string }>(
            'SELECT sku FROM products WHERE id = ?',
            [data.product_id]
          )
          
          if (productInfo && productInfo.sku) {
            const now = new Date()
            const currentTimestamp = 
              now.getFullYear() + '-' +
              String(now.getMonth() + 1).padStart(2, '0') + '-' +
              String(now.getDate()).padStart(2, '0') + ' ' +
              String(now.getHours()).padStart(2, '0') + ':' +
              String(now.getMinutes()).padStart(2, '0') + ':' +
              String(now.getSeconds()).padStart(2, '0')
            
            for (const sn of snCodesForLog) {
              if (!sn || !sn.trim()) continue
              try {
                // 更新SN码状态为已出库（基于SKU）
                await databaseService.update(
                  `UPDATE sn_status 
                   SET status = 1, outbound_date = ?, updated_at = ? 
                   WHERE sku = ? AND serial_number = ? AND status = 0`,
                  [
                    currentTimestamp,
                    currentTimestamp,
                    productInfo.sku,
                    sn.trim()
                  ]
                )
              } catch (snErr: any) {
                console.warn(`更新SN码状态失败 (${sn}):`, snErr?.message || snErr)
              }
            }
          }
        }
      })
    } catch (error) {
      console.error('调整库存失败:', error)
      throw error
    }
  }

  /**
   * 批量入库（使用事务一次性处理多个商品的SN码入库）
   * @param items 批量入库的商品列表，每个商品包含SN码列表
   * @param commonData 公共数据（位置、批次号、备注、操作人等）
   * @returns 入库结果统计
   */
  async batchInbound(
    items: Array<{
      product_id: number
      serial_numbers: string[]
    }>,
    commonData: {
      location?: string
      batch_number?: string
      notes?: string
      created_by?: number
    }
  ): Promise<{ successCount: number; failCount: number; errors: string[] }> {
    try {
      // 确保表结构存在
      await this.ensureBalanceColumn()
      await this.ensureBatchNumberColumn()
      await this.ensureBatchTables()

      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      // 生成批次号（所有商品共用一个批次号）
      let batchNumber = commonData.batch_number
      if (!batchNumber || !batchNumber.trim()) {
        batchNumber = await this.generateBatchNumber()
      }

      // 获取当前时间戳
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      // 在事务中处理所有入库操作
      await databaseService.transaction(async () => {
        for (const item of items) {
          if (!item.serial_numbers || item.serial_numbers.length === 0) {
            continue
          }

          // 获取商品信息
          const product = await databaseService.queryOne<{ sku: string; name: string }>(
            'SELECT sku, name FROM products WHERE id = ?',
            [item.product_id]
          )

          if (!product || !product.sku) {
            failCount += item.serial_numbers.length
            errors.push(`商品ID ${item.product_id}: 无法获取商品信息`)
            continue
          }

          // 检查SN码是否已存在
          const existingSNs = await databaseService.query<{ serial_number: string }>(
            `SELECT serial_number 
             FROM sn_status 
             WHERE sku = ? AND serial_number IN (${item.serial_numbers.map(() => '?').join(',')})`,
            [product.sku, ...item.serial_numbers]
          )

          const existingSNSet = new Set(existingSNs.map(row => row.serial_number.trim()))

          // 处理每个SN码
          for (const sn of item.serial_numbers) {
            const trimmedSn = sn.trim()
            if (!trimmedSn) continue

            // 检查SN码是否重复
            if (existingSNSet.has(trimmedSn)) {
              failCount++
              errors.push(`${product.name} - ${trimmedSn}: SN码已存在`)
              continue
            }

            try {
              // 获取当前库存
              const currentInventory = await databaseService.queryOne<{ quantity: number }>(
                'SELECT quantity FROM inventory WHERE product_id = ?',
                [item.product_id]
              )

              const currentQuantity = currentInventory?.quantity || 0
              const newQuantity = currentQuantity + 1

              // 更新或插入库存记录
              if (currentInventory) {
                await databaseService.update(
                  `UPDATE inventory 
                   SET quantity = ?, location = COALESCE(?, location), 
                       batch_number = ?, updated_at = CURRENT_TIMESTAMP 
                   WHERE product_id = ?`,
                  [newQuantity, commonData.location || null, batchNumber, item.product_id]
                )
              } else {
                await databaseService.insert(
                  `INSERT INTO inventory (product_id, quantity, location, batch_number, created_at, updated_at) 
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                  [item.product_id, newQuantity, commonData.location || null, batchNumber]
                )
              }

              // 更新或插入批次记录
              const existingBatch = await databaseService.queryOne<{ id: number; quantity: number }>(
                'SELECT id, quantity FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
                [item.product_id, batchNumber]
              )

              if (existingBatch) {
                await databaseService.update(
                  `UPDATE inventory_batches 
                   SET quantity = quantity + 1, location = COALESCE(?, location),
                       updated_at = ? 
                   WHERE id = ?`,
                  [commonData.location || null, currentTimestamp, existingBatch.id]
                )
              } else {
                await databaseService.insert(
                  `INSERT INTO inventory_batches 
                   (product_id, batch_number, quantity, location, inbound_date, created_at, updated_at) 
                   VALUES (?, ?, 1, ?, ?, ?, ?)`,
                  [item.product_id, batchNumber, commonData.location || null, currentTimestamp, currentTimestamp, currentTimestamp]
                )
              }

              // 记录库存变动
              await databaseService.insert(
                `INSERT INTO inventory_transactions 
                 (product_id, type, quantity, balance, batch_number, notes, created_by, created_at) 
                 VALUES (?, 'in', 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [item.product_id, newQuantity, batchNumber, commonData.notes || null, commonData.created_by || null]
              )

              // 创建SN码状态记录
              await databaseService.insert(
                `INSERT INTO sn_status 
                 (product_id, sku, serial_number, batch_number, status, inbound_date, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
                [item.product_id, product.sku, trimmedSn, batchNumber, currentTimestamp, currentTimestamp, currentTimestamp]
              )

              successCount++
              // 添加到已存在集合，防止同一批次中重复
              existingSNSet.add(trimmedSn)

            } catch (snError: any) {
              failCount++
              if (snError?.message?.includes('UNIQUE constraint')) {
                errors.push(`${product.name} - ${trimmedSn}: SN码重复`)
              } else {
                errors.push(`${product.name} - ${trimmedSn}: ${snError?.message || '入库失败'}`)
              }
            }
          }
        }
      })

      // 记录操作日志（异步，不阻塞）
      if (successCount > 0) {
        SystemLogService.createLog({
          user_id: commonData.created_by || null,
          operation_type: 'batch_inbound',
          table_name: 'inventory',
          new_values: {
            batch_number: batchNumber,
            success_count: successCount,
            fail_count: failCount,
            location: commonData.location,
            notes: commonData.notes
          },
          description: `批量入库: 成功 ${successCount} 个，失败 ${failCount} 个，批次号 ${batchNumber}`
        }).catch(err => console.error('记录批量入库日志失败:', err))
      }

      return { successCount, failCount, errors }

    } catch (error) {
      console.error('批量入库失败:', error)
      throw error
    }
  }

  /**
   * 获取库存交易记录
   */
  async getInventoryTransactions(
    page = 1,
    pageSize = 20,
    productId?: number,
    type?: 'in' | 'out' | 'adjust' | 'transfer',
    startDate?: string,
    endDate?: string
  ): Promise<{ data: InventoryTransaction[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureBatchNumberColumn()
      let whereConditions = '1=1'
      const params: any[] = []

      if (productId) {
        whereConditions += ' AND it.product_id = ?'
        params.push(productId)
      }

      if (type) {
        whereConditions += ' AND it.type = ?'
        params.push(type)
      }

      if (startDate) {
        // 如果只包含日期（长度 <= 10），补全为 00:00:00
        const startDateTime = startDate.length <= 10 ? `${startDate} 00:00:00` : startDate
        whereConditions += ' AND it.created_at >= ?'
        params.push(startDateTime)
      }

      if (endDate) {
        // 如果只包含日期（长度 <= 10），补全为 23:59:59
        const endDateTime = endDate.length <= 10 ? `${endDate} 23:59:59` : endDate
        whereConditions += ' AND it.created_at <= ?'
        params.push(endDateTime)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM inventory_transactions it 
         WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据（包含 balance 和 batch_number 字段）
      const rawTransactions = await databaseService.query<any>(
        `SELECT 
           it.id, it.product_id, it.type, it.quantity, it.balance, it.batch_number,
           it.reference_type, it.reference_id, it.notes, it.created_by, it.created_at,
           p.name as product_name, p.sku as product_sku, u.name as creator_name
         FROM inventory_transactions it 
         LEFT JOIN products p ON it.product_id = p.id 
         LEFT JOIN users u ON it.created_by = u.id 
         WHERE ${whereConditions}
         ORDER BY it.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )
      
      // 如果 balance 字段不存在或为 null，需要计算累计余额
      // 对于SN码入库的情况，余额应该是总库存余额，而不是每个SN码的数量
      const transactions: InventoryTransaction[] = rawTransactions.map((t: any) => {
        // 如果数据库中有 balance 字段且不为 null，直接使用
        if (t.balance !== null && t.balance !== undefined) {
          return { ...t, balance: Number(t.balance) } as InventoryTransaction
        }
        
        // 如果没有 balance 字段，使用 quantity 作为占位符（向后兼容）
        // 但这不是正确的余额，应该显示总余额
        return { ...t, balance: t.quantity || 0 } as InventoryTransaction
      })

      return {
        data: transactions,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取库存交易记录失败:', error)
      throw error
    }
  }

  /**
   * 获取当前库存
   */
  async getCurrentInventory(productId?: number): Promise<any[]> {
    try {
      let whereConditions = 'p.status = 1'
      const params: any[] = []

      if (productId) {
        whereConditions += ' AND i.product_id = ?'
        params.push(productId)
      }

      const inventory = await databaseService.query(
        `SELECT 
           p.id, p.sku, p.name, p.unit, p.min_stock, p.max_stock,
           COALESCE(i.quantity, 0) as current_stock,
           i.location, i.batch_number, i.production_date, i.expiry_date,
           COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0) as cost_price,
           (COALESCE(i.quantity, 0) * COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0)) as total_value
         FROM products p 
         LEFT JOIN inventory i ON p.id = i.product_id 
         WHERE ${whereConditions}
         ORDER BY p.name ASC`,
        params
      )

      return inventory
    } catch (error) {
      console.error('获取当前库存失败:', error)
      throw error
    }
  }

  /**
   * 获取库存报表
   * 确保正确处理NULL值和分类名称
   * 性能优化：使用时间范围限制，避免全表扫描
   */
  async getInventoryReport(categoryId?: number, startDate?: string, endDate?: string): Promise<InventoryReport[]> {
    try {
      let whereClause = 'p.status = 1'
      const params: any[] = []
      
      // 如果指定了分类ID，添加分类过滤条件
      if (categoryId) {
        whereClause += ' AND p.category_id = ?'
        params.push(categoryId)
      }
      
      // 性能优化：如果没有指定时间范围，使用默认的最近30天，避免全表扫描
      const reportStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const reportEndDate = endDate || new Date().toISOString().split('T')[0]
      
      const reportStartDateTime = reportStartDate.length <= 10 ? `${reportStartDate} 00:00:00` : reportStartDate
      const reportEndDateTime = reportEndDate.length <= 10 ? `${reportEndDate} 23:59:59` : reportEndDate
      
      // 如果指定了时间范围，添加时间过滤条件（基于商品创建时间或库存更新时间）
      if (startDate) {
        whereClause += ' AND p.created_at >= ?'
        params.push(reportStartDateTime)
      }
      if (endDate) {
        whereClause += ' AND p.created_at <= ?'
        params.push(reportEndDateTime)
      }
      
      // 性能优化：周转率计算使用传入的时间范围，而不是固定的30天
      const turnoverParams: any[] = []
      const turnoverWhereClause = 'created_at >= ? AND created_at <= ?'
      turnoverParams.push(reportStartDateTime, reportEndDateTime)
      
      const report = await databaseService.query<InventoryReport & { category_id?: number }>(
        `SELECT 
           p.id as product_id, 
           p.name as product_name, 
           p.sku as product_sku,
           p.category_id,
           COALESCE(c.name, '未分类') as category_name, 
           COALESCE(i.quantity, 0) as current_stock,
           (COALESCE(i.quantity, 0) * COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0)) as total_value,
           COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0) as avg_price, 
           p.min_stock, 
           p.max_stock,
           COALESCE(turnover.turnover_rate, 0) as turnover_rate
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         LEFT JOIN inventory i ON p.id = i.product_id 
         LEFT JOIN (
           SELECT 
             product_id, 
             CASE 
               WHEN SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) = 0 THEN 0
               ELSE CAST(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END) AS REAL) / 
                    NULLIF(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0)
             END as turnover_rate
           FROM inventory_transactions 
           WHERE ${turnoverWhereClause}
           GROUP BY product_id
         ) turnover ON p.id = turnover.product_id
         WHERE ${whereClause}
         ORDER BY total_value DESC
         LIMIT 1000`,
        [...params, ...turnoverParams]
      )

      return report
    } catch (error) {
      console.error('获取库存报表失败:', error)
      throw error
    }
  }

  /**
   * 获取库存预警
   */
  async getStockAlerts(): Promise<any[]> {
    try {
      const alerts = await databaseService.query(
        `SELECT 
           p.id, p.id as product_id, p.sku, p.sku as product_sku, 
           p.name, p.name as product_name,
           p.min_stock, p.max_stock,
           COALESCE(i.quantity, 0) as current_stock,
           CASE 
             WHEN COALESCE(i.quantity, 0) = 0 THEN 'out_of_stock'
             WHEN COALESCE(i.quantity, 0) <= p.min_stock THEN 'low_stock'
             WHEN COALESCE(i.quantity, 0) >= p.max_stock THEN 'over_stock'
             ELSE 'normal'
           END as alert_type,
           CASE 
             WHEN COALESCE(i.quantity, 0) = 0 THEN '缺货'
             WHEN COALESCE(i.quantity, 0) <= p.min_stock THEN '低库存'
             WHEN COALESCE(i.quantity, 0) >= p.max_stock THEN '超储'
             ELSE '正常'
           END as alert_description
         FROM products p 
         LEFT JOIN inventory i ON p.id = i.product_id 
         WHERE p.status = 1 AND (
           COALESCE(i.quantity, 0) <= p.min_stock OR 
           COALESCE(i.quantity, 0) >= p.max_stock OR
           COALESCE(i.quantity, 0) = 0
         )
         ORDER BY current_stock ASC`
      )

      return alerts
    } catch (error) {
      console.error('获取库存预警失败:', error)
      throw error
    }
  }

  /**
   * 获取即将过期的商品
   */
  async getExpiringProducts(daysAhead = 30): Promise<any[]> {
    try {
      const expiringProducts = await databaseService.query(
        `SELECT 
           p.id, p.sku, p.name, i.quantity as current_stock,
           i.batch_number, i.expiry_date,
           CASE 
             WHEN DATE(i.expiry_date) <= DATE('now') THEN 'expired'
             WHEN DATE(i.expiry_date) <= DATE('now', '+' || ? || ' days') THEN 'expiring_soon'
             ELSE 'normal'
           END as status
         FROM products p 
         JOIN inventory i ON p.id = i.product_id 
         WHERE p.status = 1 AND i.expiry_date IS NOT NULL 
           AND DATE(i.expiry_date) <= DATE('now', '+' || ? || ' days')
         ORDER BY i.expiry_date ASC`,
        [daysAhead, daysAhead]
      )

      return expiringProducts
    } catch (error) {
      console.error('获取即将过期商品失败:', error)
      throw error
    }
  }

  /**
   * 更新库存位置
   */
  async updateInventoryLocation(productId: number, location: string): Promise<void> {
    try {
      const affectedRows = await databaseService.update(
        'UPDATE inventory SET location = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?',
        [location, productId]
      )
      
      if (affectedRows === 0) {
        // 如果不存在库存记录，则创建
        await databaseService.insert(
          'INSERT INTO inventory (product_id, quantity, location, created_at, updated_at) VALUES (?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [productId, location]
        )
      }
    } catch (error) {
      console.error('更新库存位置失败:', error)
      throw error
    }
  }

  /**
   * 获取库存总值
   * 优先使用成本价，如果成本价为0或NULL，则使用售价
   * 确保正确处理NULL值
   */
  async getInventoryValue(): Promise<{ totalValue: number; totalItems: number; categoryBreakdown: any[] }> {
    try {
      // 优先使用成本价，如果成本价为0或NULL，则使用售价
      const totalResult = await databaseService.queryOne<{ total_value: number; total_items: number }>(
        `SELECT 
           SUM(COALESCE(i.quantity, 0) * COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0)) as total_value,
           COUNT(DISTINCT p.id) as total_items
         FROM products p 
         LEFT JOIN inventory i ON p.id = i.product_id 
         WHERE p.status = 1
         AND COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0) > 0`
      )

      const categoryBreakdown = await databaseService.query(
        `SELECT 
           COALESCE(c.name, '未分类') as category_name,
           COUNT(DISTINCT p.id) as product_count,
           SUM(COALESCE(i.quantity, 0)) as total_quantity,
           SUM(COALESCE(i.quantity, 0) * COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0)) as total_value
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id 
         LEFT JOIN inventory i ON p.id = i.product_id 
         WHERE p.status = 1
         GROUP BY COALESCE(c.name, '未分类')
         HAVING SUM(COALESCE(i.quantity, 0) * COALESCE(NULLIF(p.cost_price, 0), p.selling_price, 0)) > 0
         ORDER BY total_value DESC`
      )

      return {
        totalValue: totalResult?.total_value || 0,
        totalItems: totalResult?.total_items || 0,
        categoryBreakdown: categoryBreakdown || []
      }
    } catch (error) {
      console.error('获取库存总值失败:', error)
      throw error
    }
  }

  /**
   * 使用FIFO规则处理出库
   */
  private async processOutboundWithFIFO(
    productId: number,
    quantity: number,
    customerId: number,
    storeId?: number,
    location?: string,
    notes?: string,
    createdBy?: number,
    serialNumbers: string[] = [],
    outboundPrice?: number
  ): Promise<void> {
    try {
      // 获取商品的 SKU（用于更新 sn_status）
      const product = await databaseService.queryOne<{ sku: string }>(
        'SELECT sku FROM products WHERE id = ?',
        [productId]
      )
      
      if (!product || !product.sku) {
        throw new Error('无法获取商品SKU信息')
      }

      // 获取当前系统时间
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      let batches: InventoryBatch[] = []
      
      // 如果提供了SN码，优先使用SN码对应的批次
      if (serialNumbers && serialNumbers.length > 0) {
        // 从sn_status表获取SN码对应的批次号
        const snBatchInfo = await databaseService.query<{ batch_number: string | null; serial_number: string }>(
          `SELECT batch_number, serial_number 
           FROM sn_status 
           WHERE sku = ? AND serial_number IN (${serialNumbers.map(() => '?').join(',')}) AND status = 0`,
          [product.sku, ...serialNumbers]
        )
        
        if (snBatchInfo.length > 0) {
          // 获取去重后的批次号列表
          const batchNumbers = [...new Set(snBatchInfo.map(s => s.batch_number).filter(bn => bn !== null))] as string[]
          
          if (batchNumbers.length > 0) {
            // 先查询这些批次号是否存在（不管quantity），用于诊断和修复数据不一致
            const allBatchesForSN = await databaseService.query<InventoryBatch>(
              `SELECT * FROM inventory_batches 
               WHERE product_id = ? AND batch_number IN (${batchNumbers.map(() => '?').join(',')})
               ORDER BY inbound_date ASC, id ASC`,
              [productId, ...batchNumbers]
            )
            
            // 检查数据不一致：如果批次存在但quantity=0，需要更新sn_status
            if (allBatchesForSN.length > 0) {
              const batchesWithStock = allBatchesForSN.filter(b => b.quantity > 0)
              const batchesWithoutStock = allBatchesForSN.filter(b => b.quantity <= 0)
              
              // 如果部分批次没有库存，更新这些批次对应的SN码状态为已出库
              if (batchesWithoutStock.length > 0) {
                const batchNumbersWithoutStock = batchesWithoutStock.map(b => b.batch_number)
                // 更新sn_status：将这些批次的所有SN码标记为已出库（如果状态还是未出库）
                await databaseService.update(
                  `UPDATE sn_status 
                   SET status = 1, outbound_date = ?, updated_at = ? 
                   WHERE sku = ? AND batch_number IN (${batchNumbersWithoutStock.map(() => '?').join(',')}) AND status = 0`,
                  [currentTimestamp, currentTimestamp, product.sku, ...batchNumbersWithoutStock]
                )
              }
              
              // 使用有库存的批次
              batches = batchesWithStock
            } else {
              // 批次不存在于inventory_batches，说明数据不一致
              // 这种情况下，应该使用FIFO查询所有批次，而不是失败
            }
          }
        }
      }
      
      // 如果没有找到批次（SN码路径未找到或未提供SN码），使用FIFO查询所有批次
      if (batches.length === 0) {
        // 获取所有有库存的批次，按入库时间升序排列（FIFO）
        batches = await databaseService.query<InventoryBatch>(
          `SELECT * FROM inventory_batches 
           WHERE product_id = ? AND quantity > 0 
           ORDER BY inbound_date ASC, id ASC`,
          [productId]
        )
      }

      if (batches.length === 0) {
        throw new Error('没有可用的批次库存')
      }

      let remainingQuantity = quantity
      // SN 游标：从传入的 SN 列表中，按出库顺序依次分配给每条出库记录
      let snIndex = 0
      // 收集所有已出库的SN码
      const alreadyOutboundSNs: string[] = []

      // 按FIFO顺序出库
      for (const batch of batches) {
        if (remainingQuantity <= 0) break

        const batchQuantity = Math.min(batch.quantity, remainingQuantity)
        
        // 更新批次库存
        await databaseService.update(
          'UPDATE inventory_batches SET quantity = quantity - ?, updated_at = ? WHERE id = ?',
          [batchQuantity, currentTimestamp, batch.id]
        )

        // 创建出库记录
        const outboundId = await databaseService.insert(
          `INSERT INTO outbound_records 
           (product_id, batch_id, batch_number, customer_id, store_id, quantity, outbound_price, outbound_date, location, notes, created_by, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            batch.id,
            batch.batch_number,
            customerId,
            storeId || null,
            batchQuantity,
            outboundPrice || null,
            currentTimestamp,
            location || null,
            notes || null,
            createdBy || null,
            currentTimestamp
          ]
        )

        // 如果提供了 SN 列表，为当前批次的这条出库记录写入 SN 明细
        if (serialNumbers.length > 0) {
          const snItemsForThisOutbound = serialNumbers.slice(snIndex, snIndex + batchQuantity)
          for (const sn of snItemsForThisOutbound) {
            if (!sn || !sn.trim()) continue
            const trimmedSn = sn.trim()
            
            // 检查该SN码是否已经出库（避免重复插入）
            const existingOutbound = await databaseService.queryOne<{ id: number }>(
              `SELECT id FROM outbound_sn_items 
               WHERE product_id = ? AND serial_number = ?`,
              [productId, trimmedSn]
            )
            
            if (existingOutbound) {
              // 收集已出库的SN码
              alreadyOutboundSNs.push(trimmedSn)
              console.warn(`SN码 ${trimmedSn} 已经出库，跳过插入 outbound_sn_items`)
              continue
            }
            
            // 写入出库SN明细表
            try {
              await databaseService.insert(
                `INSERT INTO outbound_sn_items 
                 (outbound_id, product_id, batch_id, batch_number, customer_id, store_id, serial_number, quantity, outbound_date, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                [
                  outboundId,
                  productId,
                  batch.id,
                  batch.batch_number,
                  customerId,
                  storeId || null,
                  trimmedSn,
                  currentTimestamp,
                  currentTimestamp
                ]
              )
            } catch (insertErr: any) {
              // 如果插入失败是因为唯一约束，记录警告并继续
              if (insertErr?.message?.includes('UNIQUE constraint')) {
                // 收集已出库的SN码
                alreadyOutboundSNs.push(trimmedSn)
                console.warn(`SN码 ${trimmedSn} 已存在出库记录，跳过插入`)
                continue
              }
              throw insertErr
            }
            
            // 更新SN码状态表为已出库（status=1，基于SKU）
            try {
              await databaseService.update(
                `UPDATE sn_status 
                 SET status = 1, outbound_date = ?, updated_at = ? 
                 WHERE sku = ? AND serial_number = ? AND status = 0`,
                [
                  currentTimestamp,
                  currentTimestamp,
                  product.sku,
                  trimmedSn
                ]
              )
            } catch (snStatusErr: any) {
              console.warn(`更新SN码状态失败 (${trimmedSn}):`, snStatusErr?.message || snStatusErr)
            }
          }
          snIndex += batchQuantity
        }

        remainingQuantity -= batchQuantity
      }

      // 如果有已出库的SN码，抛出明确的错误
      if (alreadyOutboundSNs.length > 0) {
        const uniqueAlreadyOutboundSNs = [...new Set(alreadyOutboundSNs)]
        throw new Error(`以下SN码已出库，不可重复出库：${uniqueAlreadyOutboundSNs.join(', ')}，请移除这些SN码后重新提交`)
      }

      if (remainingQuantity > 0) {
        throw new Error(`库存不足，还缺少 ${remainingQuantity} 个商品`)
      }
    } catch (error) {
      console.error('FIFO出库处理失败:', error)
      throw error
    }
  }

  /**
   * 获取出库记录
   */
  async getOutboundRecords(
    page = 1,
    pageSize = 20,
    filters?: {
      product_id?: number
      customer_id?: number
      store_id?: number
      batch_number?: string
      start_date?: string
      end_date?: string
    }
  ): Promise<{ data: OutboundRecord[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureBatchTables()

      let whereConditions = '1=1'
      const params: any[] = []

      if (filters?.product_id) {
        whereConditions += ' AND outbound.product_id = ?'
        params.push(filters.product_id)
      }

      if (filters?.customer_id) {
        whereConditions += ' AND outbound.customer_id = ?'
        params.push(filters.customer_id)
      }

      if (filters?.store_id) {
        whereConditions += ' AND outbound.store_id = ?'
        params.push(filters.store_id)
      }

      if (filters?.batch_number) {
        // 性能优化：批次号使用前缀匹配（可以使用索引）
        whereConditions += ' AND outbound.batch_number LIKE ?'
        params.push(`${filters.batch_number}%`)
      }

      if (filters?.start_date) {
        const startDateTime = filters.start_date.length <= 10 
          ? `${filters.start_date} 00:00:00` 
          : filters.start_date
        whereConditions += ' AND outbound.outbound_date >= ?'
        params.push(startDateTime)
      }

      if (filters?.end_date) {
        const endDateTime = filters.end_date.length <= 10 
          ? `${filters.end_date} 23:59:59` 
          : filters.end_date
        whereConditions += ' AND outbound.outbound_date <= ?'
        params.push(endDateTime)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM outbound_records outbound 
         WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      const records = await databaseService.query<OutboundRecord>(
        `SELECT 
           outbound.id, outbound.product_id, outbound.batch_id, outbound.batch_number, outbound.customer_id, outbound.store_id,
           outbound.quantity, outbound.outbound_price, outbound.outbound_date, outbound.location, outbound.notes, outbound.created_by, outbound.created_at,
           p.name as product_name, c.name as customer_name, cs.store_name
         FROM outbound_records outbound 
         LEFT JOIN products p ON outbound.product_id = p.id 
         LEFT JOIN customers c ON outbound.customer_id = c.id 
         LEFT JOIN customer_stores cs ON outbound.store_id = cs.id
         WHERE ${whereConditions}
         ORDER BY outbound.outbound_date DESC, outbound.id DESC 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      return {
        data: records,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取出库记录失败:', error)
      throw error
    }
  }

  /**
   * 获取出库记录总金额
   */
  async getOutboundRecordsTotalAmount(filters?: {
    product_id?: number
    customer_id?: number
    store_id?: number
    batch_number?: string
    start_date?: string
    end_date?: string
  }): Promise<number> {
    try {
      await this.ensureBatchTables()

      let whereConditions = '1=1'
      const params: any[] = []

      if (filters?.product_id) {
        whereConditions += ' AND outbound.product_id = ?'
        params.push(filters.product_id)
      }

      if (filters?.customer_id) {
        whereConditions += ' AND outbound.customer_id = ?'
        params.push(filters.customer_id)
      }

      if (filters?.store_id) {
        whereConditions += ' AND outbound.store_id = ?'
        params.push(filters.store_id)
      }

      if (filters?.batch_number) {
        // 性能优化：批次号使用前缀匹配（可以使用索引）
        whereConditions += ' AND outbound.batch_number LIKE ?'
        params.push(`${filters.batch_number}%`)
      }

      if (filters?.start_date) {
        const startDateTime = filters.start_date.length <= 10 
          ? `${filters.start_date} 00:00:00` 
          : filters.start_date
        whereConditions += ' AND outbound.outbound_date >= ?'
        params.push(startDateTime)
      }

      if (filters?.end_date) {
        const endDateTime = filters.end_date.length <= 10 
          ? `${filters.end_date} 23:59:59` 
          : filters.end_date
        whereConditions += ' AND outbound.outbound_date <= ?'
        params.push(endDateTime)
      }

      // 计算总金额
      const result = await databaseService.queryOne<{ total_amount: number }>(
        `SELECT COALESCE(SUM(outbound.quantity * COALESCE(outbound.outbound_price, 0)), 0) as total_amount
         FROM outbound_records outbound 
         WHERE ${whereConditions}`,
        params
      )

      return result?.total_amount || 0
    } catch (error) {
      console.error('获取出库记录总金额失败:', error)
      throw error
    }
  }

  /**
   * 获取商品的批次列表
   */
  async getProductBatches(productId: number): Promise<InventoryBatch[]> {
    try {
      await this.ensureBatchTables()

      const batches = await databaseService.query<InventoryBatch>(
        `SELECT * FROM inventory_batches 
         WHERE product_id = ? AND quantity > 0 
         ORDER BY inbound_date ASC, id ASC`,
        [productId]
      )

      return batches
    } catch (error) {
      console.error('获取商品批次列表失败:', error)
      throw error
    }
  }

  /**
   * 获取出入库报表数据（按客户、商品等维度统计）
   */
  async getOutboundReport(startDate?: string, endDate?: string, customerId?: number): Promise<any[]> {
    try {
      await this.ensureBatchTables()

      let whereConditions = '1=1'
      const params: any[] = []

      if (startDate) {
        whereConditions += ' AND DATE(outbound.outbound_date) >= ?'
        params.push(startDate)
      }

      if (endDate) {
        whereConditions += ' AND DATE(outbound.outbound_date) <= ?'
        params.push(endDate)
      }

      if (customerId) {
        whereConditions += ' AND outbound.customer_id = ?'
        params.push(customerId)
      }

      // 按客户、商品、门店分组统计
      const report = await databaseService.query<any>(
        `SELECT 
           outbound.customer_id,
           c.name as customer_name,
           outbound.store_id,
           cs.store_name,
           outbound.product_id,
           p.name as product_name,
           p.category_id,
           cat.name as category_name,
           SUM(outbound.quantity) as total_quantity,
           COUNT(DISTINCT outbound.id) as outbound_count,
           MIN(outbound.outbound_date) as first_outbound_date,
           MAX(outbound.outbound_date) as last_outbound_date
         FROM outbound_records outbound
         LEFT JOIN customers c ON outbound.customer_id = c.id
         LEFT JOIN customer_stores cs ON outbound.store_id = cs.id
         LEFT JOIN products p ON outbound.product_id = p.id
         LEFT JOIN categories cat ON p.category_id = cat.id
         WHERE ${whereConditions}
         GROUP BY outbound.customer_id, outbound.store_id, outbound.product_id
         ORDER BY total_quantity DESC, last_outbound_date DESC`,
        params
      )

      return report
    } catch (error) {
      console.error('获取出入库报表失败:', error)
      throw error
    }
  }

  /**
   * 获取出入库报表数据（按商品分组，显示入库、出库、剩余数量）
   */
  async getInboundOutboundReport(startDate?: string, endDate?: string, productId?: number): Promise<any[]> {
    try {
      let transactionWhereConditions = '1=1'
      const transactionParams: any[] = []

      if (startDate) {
        const startDateTime = startDate.length <= 10 
          ? `${startDate} 00:00:00` 
          : startDate
        transactionWhereConditions += ' AND it.created_at >= ?'
        transactionParams.push(startDateTime)
      }

      if (endDate) {
        const endDateTime = endDate.length <= 10 
          ? `${endDate} 23:59:59` 
          : endDate
        transactionWhereConditions += ' AND it.created_at <= ?'
        transactionParams.push(endDateTime)
      }

      let productWhereConditions = 'p.status = 1'
      const productParams: any[] = []

      if (productId) {
        productWhereConditions += ' AND p.id = ?'
        productParams.push(productId)
      }

      // 联合查询入库和出库数据，按商品分组
      const report = await databaseService.query<any>(
        `SELECT 
           p.id as product_id,
           p.name as product_name,
           p.sku as product_sku,
           p.category_id,
           COALESCE(c.name, '未分类') as category_name,
           COALESCE(SUM(CASE WHEN it.type = 'in' THEN it.quantity ELSE 0 END), 0) as inbound_quantity,
           COALESCE(SUM(CASE WHEN it.type = 'out' THEN it.quantity ELSE 0 END), 0) as outbound_quantity,
           COUNT(DISTINCT CASE WHEN it.type = 'in' THEN it.id ELSE NULL END) as inbound_count,
           COUNT(DISTINCT CASE WHEN it.type = 'out' THEN it.id ELSE NULL END) as outbound_count,
           COALESCE(i.quantity, 0) as remaining_quantity
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         LEFT JOIN inventory_transactions it ON p.id = it.product_id AND ${transactionWhereConditions}
         WHERE ${productWhereConditions}
         GROUP BY p.id, p.name, p.sku, p.category_id, c.name, i.quantity
         HAVING inbound_quantity > 0 OR outbound_quantity > 0
         ORDER BY outbound_quantity DESC, inbound_quantity DESC`,
        [...transactionParams, ...productParams]
      )

      return report
    } catch (error) {
      console.error('获取出入库报表失败:', error)
      throw error
    }
  }

  /**
   * 获取客户的历史批次号列表（去重）
   */
  async getCustomerBatchNumbers(customerId: number): Promise<{ batch_number: string; product_id: number; product_name: string; product_sku: string }[]> {
    try {
      await this.ensureBatchTables()

      const batches = await databaseService.query<{ batch_number: string; product_id: number; product_name: string; product_sku: string }>(
        `SELECT DISTINCT 
           outbound.batch_number,
           outbound.product_id,
           p.name as product_name,
           p.sku as product_sku
         FROM outbound_records outbound
         LEFT JOIN products p ON outbound.product_id = p.id
         WHERE outbound.customer_id = ?
         ORDER BY outbound.batch_number ASC`,
        [customerId]
      )

      return batches
    } catch (error) {
      console.error('获取客户批次号列表失败:', error)
      throw error
    }
  }

  /**
   * 根据批次号获取商品信息
   */
  async getProductByBatchNumber(batchNumber: string, customerId?: number): Promise<{ product_id: number; product_name: string; product_sku: string; batch_number: string; available_quantity: number } | null> {
    try {
      await this.ensureBatchTables()

      let whereCondition = 'ib.batch_number = ?'
      const params: any[] = [batchNumber]

      if (customerId) {
        // 如果提供了客户ID，验证该批次号是否属于该客户的历史出库记录
        whereCondition += ' AND EXISTS (SELECT 1 FROM outbound_records WHERE batch_number = ? AND customer_id = ?)'
        params.push(batchNumber, customerId)
      }

      const result = await databaseService.queryOne<{ product_id: number; product_name: string; product_sku: string; batch_number: string; available_quantity: number }>(
        `SELECT 
           ib.product_id,
           p.name as product_name,
           p.sku as product_sku,
           ib.batch_number,
           ib.quantity as available_quantity
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         WHERE ${whereCondition} AND ib.quantity > 0
         LIMIT 1`,
        params
      )

      return result || null
    } catch (error) {
      console.error('根据批次号获取商品信息失败:', error)
      throw error
    }
  }

  /**
   * 根据 SN 码获取对应的批次信息（用于按SN快速识别批次）
   *
 * 规则（性能优化：优先使用索引查询）：
   *  1) 优先从 sn_status 表查找（性能优化：使用索引，基于 serial_number 查询）
   *  2) 如果找到，再查询 inventory_batches 表获取批次库存信息
   *  3) 如果未找到，回退到按批次号直接匹配（兼容批次号直接等于 SN / SN:SN 的场景）
   */
  async getBatchBySerialNumber(
    serialNumber: string,
    productId?: number
  ): Promise<{ product_id: number; product_name: string; product_sku: string; batch_number: string; available_quantity: number } | null> {
    try {
      await this.ensureBatchTables()

      const cleaned = (serialNumber || '').trim()
      if (!cleaned) return null

      // 1) 优先从 sn_status 表查找（性能优化，使用索引）
      let snStatusQuery = `SELECT ss.product_id, ss.batch_number, p.sku as product_sku
                           FROM sn_status ss
                           LEFT JOIN products p ON ss.product_id = p.id
                           WHERE ss.serial_number = ?`
      const snStatusParams: any[] = [cleaned]
      
      if (productId) {
        snStatusQuery += ' AND ss.product_id = ?'
        snStatusParams.push(productId)
      }
      
      snStatusQuery += ' ORDER BY ss.inbound_date ASC LIMIT 1'
      
      const snStatusResult = await databaseService.queryOne<{
        product_id: number
        batch_number: string | null
        product_sku: string
      }>(snStatusQuery, snStatusParams)

      if (snStatusResult && snStatusResult.batch_number) {
        // 从 sn_status 找到了，再查询批次库存信息
        const candidateFromSNStatus = await databaseService.queryOne<{
          product_id: number
          product_name: string
          product_sku: string
          batch_number: string
          available_quantity: number
        }>(
          `SELECT 
             ib.product_id,
             p.name as product_name,
             p.sku as product_sku,
             ib.batch_number,
             ib.quantity as available_quantity
           FROM inventory_batches ib
           LEFT JOIN products p ON ib.product_id = p.id
           WHERE ib.product_id = ? 
             AND ib.batch_number = ?
             AND ib.quantity > 0
           ORDER BY ib.inbound_date ASC, ib.id ASC
           LIMIT 1`,
          [snStatusResult.product_id, snStatusResult.batch_number]
        )

        if (candidateFromSNStatus) {
          return candidateFromSNStatus
        }
      }

      // 2) 日志未命中时，回退到按批次号直接匹配（兼容批次号直接等于 SN / SN:SN 的场景）
      let whereClause = 'ib.quantity > 0 AND (ib.batch_number = ? OR ib.batch_number = ?)'
      const params: any[] = [cleaned, `SN:${cleaned}`]

      if (productId) {
        whereClause += ' AND ib.product_id = ?'
        params.push(productId)
      }

      const candidates = await databaseService.query<{
        product_id: number
        product_name: string
        product_sku: string
        batch_number: string
        available_quantity: number
      }>(
        `SELECT 
           ib.product_id,
           p.name as product_name,
           p.sku as product_sku,
           ib.batch_number,
           ib.quantity as available_quantity
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         WHERE ${whereClause}
         ORDER BY ib.inbound_date ASC, ib.id ASC
         LIMIT 1`,
        params
      )

      if (!candidates || candidates.length === 0) {
        return null
      }

      return candidates[0]
    } catch (error) {
      console.error('根据SN码获取批次信息失败:', error)
      throw error
    }
  }

  /**
   * 获取指定出库记录下的 SN 明细
   */
  async getOutboundSNItems(
    outboundId: number
  ): Promise<{ serial_number: string; quantity: number }[]> {
    try {
      await this.ensureBatchTables()

      const items = await databaseService.query<{ serial_number: string; quantity: number }>(
        `SELECT serial_number, quantity 
         FROM outbound_sn_items 
         WHERE outbound_id = ?
         ORDER BY id ASC`,
        [outboundId]
      )

      return items || []
    } catch (error) {
      console.error('获取出库SN明细失败:', error)
      throw error
    }
  }

  /**
   * 获取所有批次信息（按批次分组，每个批次包含该批次下的所有SN码商品）
   */
  async getAllBatchesGrouped(
    page = 1,
    pageSize = 20,
    productId?: number,
    batchNumber?: string
  ): Promise<{ 
    data: Array<{
      product_id: number
      product_name: string
      product_sku: string
      batch_number: string
      total_quantity: number
      location?: string
      production_date?: string
      expiry_date?: string
      inbound_date: string
      sn_items: Array<{
        id: number
        quantity: number
        serial_number: string
        inbound_date: string
        status?: 'in' | 'out'
        outbound_date?: string
      }>
    }>; 
    total: number; 
    page: number; 
    pageSize: number 
  }> {
    try {
      await this.ensureBatchTables()

      // 查询所有批次（包括已出库完的批次），不再限制 quantity > 0
      let whereConditions = '1=1'
      const params: any[] = []

      if (productId) {
        whereConditions += ' AND ib.product_id = ?'
        params.push(productId)
      }

      if (batchNumber) {
        // 性能优化：批次号使用前缀匹配（可以使用索引）
        whereConditions += ' AND ib.batch_number LIKE ?'
        params.push(`${batchNumber}%`)
      }

      // 按 product_id 和 batch_number 分组获取批次信息（包括已出库完的批次）
      const groupedBatches = await databaseService.query<{
        product_id: number
        product_name: string
        product_sku: string
        batch_number: string
        total_quantity: number
        location: string
        production_date: string
        expiry_date: string
        min_inbound_date: string
      }>(
        `SELECT 
           ib.product_id,
           p.name as product_name,
           p.sku as product_sku,
           ib.batch_number,
           COUNT(DISTINCT ss.serial_number) as total_quantity,
           MAX(ib.location) as location,
           MAX(ib.production_date) as production_date,
           MAX(ib.expiry_date) as expiry_date,
           MIN(ib.inbound_date) as min_inbound_date
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         LEFT JOIN sn_status ss ON ib.product_id = ss.product_id AND ib.batch_number = ss.batch_number
         WHERE ${whereConditions}
         GROUP BY ib.product_id, ib.batch_number
         ORDER BY min_inbound_date DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      )

      // 获取总数（分组后的数量）
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(DISTINCT ib.product_id || '-' || ib.batch_number) as count 
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0

      // 性能优化：一次性查询所有批次的SN码，解决N+1查询问题
      if (groupedBatches.length === 0) {
        return {
          data: [],
          total,
          page,
          pageSize
        }
      }

      // 构建批次查询条件
      const batchConditions: string[] = []
      const batchParams: any[] = []
      groupedBatches.forEach(batch => {
        batchConditions.push('(product_id = ? AND batch_number = ?)')
        batchParams.push(batch.product_id, batch.batch_number)
      })

      // 一次性查询所有批次的SN码
      let allSNStatus: Array<{
        product_id: number
        batch_number: string
        id: number
        serial_number: string
        status: number
        inbound_date: string | null
        outbound_date: string | null
      }> = []

      try {
        allSNStatus = await databaseService.query<{
          product_id: number
          batch_number: string
          id: number
          serial_number: string
          status: number
          inbound_date: string | null
          outbound_date: string | null
        }>(
          `SELECT product_id, batch_number, id, serial_number, status, inbound_date, outbound_date
           FROM sn_status 
           WHERE ${batchConditions.join(' OR ')}
           ORDER BY product_id, batch_number, inbound_date ASC, id ASC`,
          batchParams
        )
      } catch (error) {
        console.error('批量查询SN码失败:', error)
      }

      // 在内存中按批次分组SN码
      const snMap = new Map<string, Array<{
        id: number
        quantity: number
        serial_number: string
        inbound_date: string
        status?: 'in' | 'out'
        outbound_date?: string
      }>>()

      allSNStatus.forEach(item => {
        if (item.serial_number) {
          const trimmedSn = item.serial_number.trim()
          if (trimmedSn) {
            const key = `${item.product_id}-${item.batch_number}`
            if (!snMap.has(key)) {
              snMap.set(key, [])
            }
            const status = item.status === 1 ? 'out' : 'in'
            snMap.get(key)!.push({
              id: item.id,
              quantity: 1,
              serial_number: trimmedSn,
              inbound_date: item.inbound_date || '',
              status: status,
              outbound_date: item.outbound_date || undefined
            })
          }
        }
      })

      // 为每个批次获取批次记录（用于没有SN码的情况）
      const batchIds: Array<{ product_id: number; batch_number: string }> = []
      groupedBatches.forEach(batch => {
        batchIds.push({ product_id: batch.product_id, batch_number: batch.batch_number })
      })

      // 构建批次记录查询
      const batchRecordConditions: string[] = []
      const batchRecordParams: any[] = []
      batchIds.forEach(batch => {
        batchRecordConditions.push('(product_id = ? AND batch_number = ?)')
        batchRecordParams.push(batch.product_id, batch.batch_number)
      })

      let allBatchRecords: InventoryBatch[] = []
      try {
        allBatchRecords = await databaseService.query<InventoryBatch>(
          `SELECT * FROM inventory_batches 
           WHERE ${batchRecordConditions.join(' OR ')}
           ORDER BY product_id, batch_number, inbound_date DESC`,
          batchRecordParams
        )
      } catch (error) {
        console.error('批量查询批次记录失败:', error)
      }

      // 按批次分组批次记录
      const batchRecordMap = new Map<string, InventoryBatch[]>()
      allBatchRecords.forEach(record => {
        const key = `${record.product_id}-${record.batch_number}`
        if (!batchRecordMap.has(key)) {
          batchRecordMap.set(key, [])
        }
        batchRecordMap.get(key)!.push(record)
      })

      // 组装最终结果
      const batchesWithSN = groupedBatches.map(batch => {
        const key = `${batch.product_id}-${batch.batch_number}`
        const snItems = snMap.get(key) || []
        const batchRecords = batchRecordMap.get(key) || []

        // 如果没有找到SN码，但批次记录存在，则创建默认项
        if (snItems.length === 0 && batchRecords.length > 0) {
          batchRecords.forEach(record => {
            snItems.push({
              id: record.id,
              quantity: record.quantity,
              serial_number: `批次-${record.id}`, // 默认标识
              inbound_date: record.inbound_date
            })
          })
        }

        return {
          product_id: batch.product_id,
          product_name: batch.product_name,
          product_sku: batch.product_sku,
          batch_number: batch.batch_number,
          // 总数量显示为该批次的SN码数量（从sn_status表统计）
          total_quantity: snItems.length > 0 ? snItems.length : (batch.total_quantity || 0),
          location: batch.location || undefined,
          production_date: batch.production_date || undefined,
          expiry_date: batch.expiry_date || undefined,
          inbound_date: batch.min_inbound_date,
          sn_items: snItems.sort((a, b) => {
            const dateA = a.inbound_date ? new Date(a.inbound_date).getTime() : 0
            const dateB = b.inbound_date ? new Date(b.inbound_date).getTime() : 0
            return dateB - dateA
          })
        }
      })

      return {
        data: batchesWithSN,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取批次信息失败:', error)
      throw error
    }
  }

  /**
   * 获取所有批次信息（包括SN码）- 保留旧方法以兼容
   */
  async getAllBatchesWithSerialNumbers(
    page = 1,
    pageSize = 20,
    productId?: number,
    batchNumber?: string
  ): Promise<{ data: Array<InventoryBatch & { product_name: string; product_sku: string; serial_numbers: string[] }>; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureBatchTables()

      // 查询所有批次（包括已出库完的批次），不再限制 quantity > 0
      let whereConditions = '1=1'
      const params: any[] = []

      if (productId) {
        whereConditions += ' AND ib.product_id = ?'
        params.push(productId)
      }

      if (batchNumber) {
        // 性能优化：批次号使用前缀匹配（可以使用索引）
        whereConditions += ' AND ib.batch_number LIKE ?'
        params.push(`${batchNumber}%`)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取批次数据
      const batches = await databaseService.query<InventoryBatch & { product_name: string; product_sku: string }>(
        `SELECT 
           ib.*,
           p.name as product_name,
           p.sku as product_sku
         FROM inventory_batches ib
         LEFT JOIN products p ON ib.product_id = p.id
         WHERE ${whereConditions}
         ORDER BY ib.inbound_date DESC, ib.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      // 从 sn_status 表查询SN码（性能优化：使用索引查询，避免JSON解析）
      const batchesWithSN = await Promise.all(batches.map(async (batch) => {
        const serialNumbers: string[] = []
        
        try {
          // 直接从 sn_status 表查询该批次的所有SN码（性能优化）
          // 按 product_id 和 batch_number 查询，确保只获取该批次的SN码
          const snStatusList = await databaseService.query<{ serial_number: string }>(
            `SELECT DISTINCT serial_number 
             FROM sn_status 
             WHERE product_id = ? AND batch_number = ?
             ORDER BY inbound_date ASC`,
            [batch.product_id, batch.batch_number]
          )

          // 提取SN码列表
          serialNumbers.push(...snStatusList.map(item => item.serial_number.trim()))
        } catch (error) {
          console.error('从 sn_status 表查询SN码失败:', error)
        }

        return {
          ...batch,
          serial_numbers: serialNumbers
        }
      }))

      return {
        data: batchesWithSN,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取批次信息失败:', error)
      throw error
    }
  }

  /**
   * 验证SN码是否存在和是否已出库（基于SKU）
   * @param serialNumber SN码
   * @param productId 商品ID（用于获取SKU）
   * @returns { exists: boolean, isOutbound: boolean, batchNumber?: string }
   */
  async validateSerialNumber(serialNumber: string, productId: number): Promise<{
    exists: boolean
    isOutbound: boolean
    batchNumber?: string
  }> {
    try {
      const cleaned = (serialNumber || '').trim()
      if (!cleaned) {
        return { exists: false, isOutbound: false }
      }

      // 获取商品的 SKU
      const product = await databaseService.queryOne<{ sku: string }>(
        'SELECT sku FROM products WHERE id = ?',
        [productId]
      )

      if (!product || !product.sku) {
        return { exists: false, isOutbound: false }
      }

      // 从SN码状态表检查（基于SKU，性能优化：使用组合索引）
      const snStatus = await databaseService.queryOne<{ status: number; batch_number: string | null }>(
        `SELECT status, batch_number 
         FROM sn_status 
         WHERE sku = ? AND serial_number = ?`,
        [product.sku, cleaned]
      )

      if (snStatus) {
        // status: 0=未出库, 1=已出库
        return {
          exists: true,
          isOutbound: snStatus.status === 1,
          batchNumber: snStatus.batch_number || undefined
        }
      }

      // 所有SN码都应该在 sn_status 表中，如果找不到说明不存在
      // 移除了 system_logs 回退查询，提高性能
      return { exists: false, isOutbound: false }
    } catch (error) {
      console.error('验证SN码失败:', error)
      return { exists: false, isOutbound: false }
    }
  }

  /**
   * 批量验证SN码（基于SKU，性能优化：减少数据库查询次数）
   * @param serialNumbers SN码数组
   * @param productId 商品ID（用于获取SKU）
   * @returns Map<serialNumber, { exists: boolean; isOutbound: boolean; batchNumber?: string }>
   */
  async validateSerialNumbers(
    serialNumbers: string[],
    productId: number
  ): Promise<Map<string, { exists: boolean; isOutbound: boolean; batchNumber?: string }>> {
    const result = new Map<string, { exists: boolean; isOutbound: boolean; batchNumber?: string }>()
    
    if (!serialNumbers || serialNumbers.length === 0) {
      return result
    }

    // 清理SN码
    const cleanedSNs = serialNumbers.map(sn => sn.trim()).filter(sn => sn)
    if (cleanedSNs.length === 0) {
      return result
    }

    try {
      // 获取商品的 SKU
      const product = await databaseService.queryOne<{ sku: string }>(
        'SELECT sku FROM products WHERE id = ?',
        [productId]
      )

      if (!product || !product.sku) {
        // 如果无法获取SKU，返回所有SN码为不存在
        cleanedSNs.forEach(sn => {
          result.set(sn, { exists: false, isOutbound: false })
        })
        return result
      }

      // 一次性查询所有SN码的状态（使用 IN 查询，性能优化）
      const placeholders = cleanedSNs.map(() => '?').join(',')
      const snStatuses = await databaseService.query<{
        serial_number: string
        status: number
        batch_number: string | null
      }>(
        `SELECT serial_number, status, batch_number 
         FROM sn_status 
         WHERE sku = ? AND serial_number IN (${placeholders})`,
        [product.sku, ...cleanedSNs]
      )

      // 构建结果Map
      const statusMap = new Map(
        snStatuses.map(s => [
          s.serial_number.trim(),
          {
            exists: true,
            isOutbound: s.status === 1,
            batchNumber: s.batch_number || undefined
          }
        ])
      )

      // 为所有SN码设置结果（存在的和不存在的）
      cleanedSNs.forEach(sn => {
        if (statusMap.has(sn)) {
          result.set(sn, statusMap.get(sn)!)
        } else {
          result.set(sn, { exists: false, isOutbound: false })
        }
      })

      return result
    } catch (error) {
      console.error('批量验证SN码失败:', error)
      // 返回所有SN码为不存在
      cleanedSNs.forEach(sn => {
        result.set(sn, { exists: false, isOutbound: false })
      })
      return result
    }
  }

  /**
   * 获取SN码溯源记录
   * @param serialNumber SN码
   * @param productId 商品ID
   * @returns 溯源记录，包括入库时间、出库时间、客户、门店、价格、数量等
   */
  async getSNTraceRecord(serialNumber: string, productId: number): Promise<{
    serial_number: string
    product_id: number
    product_name?: string
    product_sku?: string
    batch_number?: string
    inbound_date?: string
    outbound_records: Array<{
      outbound_id: number
      outbound_date: string
      customer_id: number
      customer_name?: string
      store_id?: number
      store_name?: string
      quantity: number
      outbound_price?: number
      location?: string
      notes?: string
    }>
  } | null> {
    try {
      const cleaned = (serialNumber || '').trim()
      if (!cleaned) {
        return null
      }

      // 获取商品的 SKU
      const product = await databaseService.queryOne<{ name: string; sku: string }>(
        'SELECT name, sku FROM products WHERE id = ?',
        [productId]
      )

      if (!product || !product.sku) {
        return null
      }

      // 查询SN码状态（基于SKU）
      const snStatus = await databaseService.queryOne<{
        id: number
        product_id: number
        serial_number: string
        batch_number: string | null
        status: number
        inbound_date: string | null
        outbound_date: string | null
      }>(
        `SELECT id, product_id, serial_number, batch_number, status, inbound_date, outbound_date 
         FROM sn_status 
         WHERE sku = ? AND serial_number = ?`,
        [product.sku, cleaned]
      )

      if (!snStatus) {
        return null
      }

      // 查询出库记录
      const outboundRecords = await databaseService.query<{
        outbound_id: number
        outbound_date: string
        customer_id: number
        customer_name: string
        store_id: number | null
        store_name: string | null
        quantity: number
        outbound_price: number | null
        location: string | null
        notes: string | null
      }>(
        `SELECT 
           orec.id as outbound_id,
           orec.outbound_date,
           orec.customer_id,
           c.name as customer_name,
           orec.store_id,
           cs.store_name,
           orec.quantity,
           orec.outbound_price,
           orec.location,
           orec.notes
         FROM outbound_sn_items osi
         JOIN outbound_records orec ON osi.outbound_id = orec.id
         LEFT JOIN customers c ON orec.customer_id = c.id
         LEFT JOIN customer_stores cs ON orec.store_id = cs.id
         WHERE osi.product_id = ? AND osi.serial_number = ?
         ORDER BY orec.outbound_date DESC`,
        [productId, cleaned]
      )

      return {
        serial_number: cleaned,
        product_id: productId,
        product_name: product?.name,
        product_sku: product?.sku,
        batch_number: snStatus.batch_number || undefined,
        inbound_date: snStatus.inbound_date || undefined,
        outbound_records: outboundRecords.map(record => ({
          outbound_id: record.outbound_id,
          outbound_date: record.outbound_date,
          customer_id: record.customer_id,
          customer_name: record.customer_name,
          store_id: record.store_id || undefined,
          store_name: record.store_name || undefined,
          quantity: record.quantity,
          outbound_price: record.outbound_price || undefined,
          location: record.location || undefined,
          notes: record.notes || undefined
        }))
      }
    } catch (error) {
      console.error('获取SN码溯源记录失败:', error)
      throw error
    }
  }

  /**
   * 删除未出库的SN码
   * @param serialNumber SN码
   * @param productId 商品ID
   * @param userId 操作用户ID（可选）
   * @throws Error 如果SN码不存在、已出库或删除失败
   */
  async deleteSerialNumber(serialNumber: string, productId: number, userId?: number): Promise<void> {
    try {
      const cleaned = (serialNumber || '').trim()
      if (!cleaned) {
        throw new Error('SN码不能为空')
      }

      // 获取商品的 SKU 和名称
      const product = await databaseService.queryOne<{ sku: string; name: string }>(
        'SELECT sku, name FROM products WHERE id = ?',
        [productId]
      )

      if (!product || !product.sku) {
        throw new Error('无法获取商品信息')
      }

      return await databaseService.transaction(async () => {
        // 查询SN码状态
        const snStatus = await databaseService.queryOne<{
          id: number
          product_id: number
          serial_number: string
          batch_number: string | null
          status: number
        }>(
          `SELECT id, product_id, serial_number, batch_number, status 
           FROM sn_status 
           WHERE sku = ? AND serial_number = ?`,
          [product.sku, cleaned]
        )

        if (!snStatus) {
          throw new Error(`SN码 "${cleaned}" 不存在`)
        }

        if (snStatus.status === 1) {
          throw new Error(`SN码 "${cleaned}" 已出库，无法删除`)
        }

        const batchNumber = snStatus.batch_number

        // 删除 sn_status 表中的记录
        await databaseService.update(
          'DELETE FROM sn_status WHERE id = ?',
          [snStatus.id]
        )

        // 减少批次数量（如果批次存在）
        if (batchNumber) {
          const batch = await databaseService.queryOne<{ id: number; quantity: number }>(
            'SELECT id, quantity FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
            [productId, batchNumber]
          )

          if (batch) {
            // 减少批次数量（如果大于0）
            if (batch.quantity > 0) {
              await databaseService.update(
                'UPDATE inventory_batches SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [batch.id]
              )
            }

            // 检查该批次是否还有其他SN码（删除SN码后检查）
            const remainingSNCount = await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count 
               FROM sn_status 
               WHERE sku = ? AND batch_number = ?`,
              [product.sku, batchNumber]
            )

            // 如果该批次下没有SN码了，删除该批次
            if (remainingSNCount && remainingSNCount.count === 0) {
              await databaseService.update(
                'DELETE FROM inventory_batches WHERE id = ?',
                [batch.id]
              )
            }
          }
        }

        // 减少总库存数量
        const currentInventory = await databaseService.queryOne<{ quantity: number }>(
          'SELECT quantity FROM inventory WHERE product_id = ?',
          [productId]
        )

        if (currentInventory && currentInventory.quantity > 0) {
          const newQuantity = Math.max(0, currentInventory.quantity - 1)
          await databaseService.update(
            'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?',
            [newQuantity, productId]
          )
        }

        // 注意：不删除 inventory_transactions 中的记录，因为：
        // 1. inventory_transactions 是历史记录，应该保留
        // 2. inventory_transactions 中没有直接存储SN码信息
        // 3. 一次入库可能包含多个SN码，删除一条记录会影响其他SN码
        // 删除SN码后，总库存数量已相应减少，保持数据一致性

        // 记录操作日志
        SystemLogService.createLog({
          user_id: userId || null,
          operation_type: 'delete_serial_number',
          table_name: 'sn_status',
          record_id: snStatus.id,
          old_values: {
            serial_number: cleaned,
            product_id: productId,
            product_name: product.name,
            product_sku: product.sku,
            batch_number: batchNumber
          },
          description: `删除SN码: ${cleaned} (商品: ${product.name}, SKU: ${product.sku}${batchNumber ? `, 批次: ${batchNumber}` : ''})`
        }).catch(err => console.error('记录删除操作日志失败:', err))
      })
    } catch (error) {
      console.error('删除SN码失败:', error)
      throw error
    }
  }

  /**
   * 执行库存盘点（SN码盘点）
   * 清除该商品所有未出库的批次和SN码，创建新的批次和SN码记录
   */
  async performInventoryCheck(
    productId: number,
    serialNumbers: string[],
    batchNumber?: string,
    location?: string,
    notes?: string,
    userId?: number
  ): Promise<void> {
    try {
      // 验证输入
      if (!productId) {
        throw new Error('商品ID不能为空')
      }
      if (!serialNumbers || serialNumbers.length === 0) {
        throw new Error('SN码列表不能为空')
      }

      // 清理SN码（去除空白字符）
      const cleanedSNs = serialNumbers
        .map(sn => sn.trim())
        .filter(sn => sn)

      if (cleanedSNs.length === 0) {
        throw new Error('SN码列表不能为空')
      }

      // 检查SN码是否有重复
      const duplicateSNs = cleanedSNs.filter((sn, index) => cleanedSNs.indexOf(sn) !== index)
      if (duplicateSNs.length > 0) {
        throw new Error(`SN码列表中有重复：${[...new Set(duplicateSNs)].join(', ')}`)
      }

      // 确保批次表和字段存在
      await this.ensureBatchTables()
      await this.ensureBatchNumberColumn()
      await this.ensureBalanceColumn()

      return await databaseService.transaction(async () => {
        // 获取商品信息
        const product = await databaseService.queryOne<{ sku: string; name: string }>(
          'SELECT sku, name FROM products WHERE id = ?',
          [productId]
        )

        if (!product || !product.sku) {
          throw new Error('无法获取商品信息')
        }

        // 生成批次号（如果未提供）
        let finalBatchNumber = batchNumber?.trim()
        if (!finalBatchNumber) {
          finalBatchNumber = await this.generateBatchNumber()
        }

        // 获取当前库存
        const currentInventory = await databaseService.queryOne<{ quantity: number }>(
          'SELECT quantity FROM inventory WHERE product_id = ?',
          [productId]
        )
        const currentQuantity = currentInventory?.quantity || 0

        // 新的盘点数量（等于SN码数量）
        const newQuantity = cleanedSNs.length

        // 1. 删除该商品所有未出库的SN码（status = 0）
        // 先查询要删除的SN码数量（用于日志记录）
        const oldSNs = await databaseService.query<{ serial_number: string }>(
          'SELECT serial_number FROM sn_status WHERE sku = ? AND status = 0',
          [product.sku]
        )
        const deletedSNCount = oldSNs.length
        
        await databaseService.update(
          `DELETE FROM sn_status 
           WHERE sku = ? AND status = 0`,
          [product.sku]
        )

        // 2. 删除该商品所有未出库的批次
        // 先查询哪些批次还有已出库的SN码，这些批次需要保留
        const batchesWithOutboundSNs = await databaseService.query<{ batch_number: string }>(
          `SELECT DISTINCT batch_number 
           FROM sn_status 
           WHERE sku = ? AND status = 1 AND batch_number IS NOT NULL`,
          [product.sku]
        )
        const preservedBatchNumbers = new Set(batchesWithOutboundSNs.map(b => b.batch_number))

        // 删除不在保留列表中的批次
        if (preservedBatchNumbers.size > 0) {
          const placeholders = Array.from(preservedBatchNumbers).map(() => '?').join(',')
          await databaseService.update(
            `DELETE FROM inventory_batches 
             WHERE product_id = ? AND batch_number NOT IN (${placeholders})`,
            [productId, ...Array.from(preservedBatchNumbers)]
          )
        } else {
          // 如果没有需要保留的批次，删除该商品所有批次
          await databaseService.update(
            'DELETE FROM inventory_batches WHERE product_id = ?',
            [productId]
          )
        }

        // 3. 创建新的批次记录
        const now = new Date()
        const currentTimestamp = 
          now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0')

        // 检查新批次是否已存在（理论上不应该存在，因为已删除所有未出库批次）
        const existingBatch = await databaseService.queryOne<{ id: number }>(
          'SELECT id FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
          [productId, finalBatchNumber]
        )

        if (existingBatch) {
          // 更新现有批次数量
          await databaseService.update(
            `UPDATE inventory_batches 
             SET quantity = ?, location = COALESCE(?, location), updated_at = ? 
             WHERE id = ?`,
            [newQuantity, location || null, currentTimestamp, existingBatch.id]
          )
        } else {
          // 创建新批次
          await databaseService.insert(
            `INSERT INTO inventory_batches 
             (product_id, batch_number, quantity, location, inbound_date, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              productId,
              finalBatchNumber,
              newQuantity,
              location || null,
              currentTimestamp,
              currentTimestamp,
              currentTimestamp
            ]
          )
        }

        // 4. 批量创建新的SN码记录
        for (const sn of cleanedSNs) {
          try {
            // 检查SN码是否已存在（已出库的SN码可能还存在）
            const existingSN = await databaseService.queryOne<{ id: number; status: number }>(
              'SELECT id, status FROM sn_status WHERE sku = ? AND serial_number = ?',
              [product.sku, sn]
            )

            if (existingSN) {
              if (existingSN.status === 1) {
                // 已出库的SN码，不能用于盘点
                throw new Error(`SN码 "${sn}" 已出库，不能用于盘点`)
              }
              // 如果存在但未出库，更新为新的批次号
              await databaseService.update(
                `UPDATE sn_status 
                 SET batch_number = ?, inbound_date = ?, updated_at = ?, status = 0 
                 WHERE id = ?`,
                [finalBatchNumber, currentTimestamp, currentTimestamp, existingSN.id]
              )
            } else {
              // 创建新的SN码状态记录
              await databaseService.insert(
                `INSERT INTO sn_status 
                 (product_id, sku, serial_number, batch_number, status, inbound_date, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
                [
                  productId,
                  product.sku,
                  sn,
                  finalBatchNumber,
                  currentTimestamp,
                  currentTimestamp,
                  currentTimestamp
                ]
              )
            }
          } catch (snErr: any) {
            if (snErr?.message?.includes('已出库')) {
              throw snErr
            }
            if (snErr?.message?.includes('UNIQUE constraint')) {
              throw new Error(`SN码 "${sn}" 在SKU "${product.sku}" 下已存在`)
            }
            console.error(`创建SN码状态记录失败 (${sn}):`, snErr)
            throw snErr
          }
        }

        // 5. 更新总库存数量
        if (currentInventory) {
          await databaseService.update(
            'UPDATE inventory SET quantity = ?, location = ?, batch_number = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?',
            [newQuantity, location || null, finalBatchNumber, productId]
          )
        } else {
          await databaseService.insert(
            `INSERT INTO inventory (product_id, quantity, location, batch_number, created_at, updated_at) 
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [productId, newQuantity, location || null, finalBatchNumber]
          )
        }

        // 6. 创建库存交易记录
        await databaseService.insert(
          `INSERT INTO inventory_transactions 
           (product_id, type, quantity, balance, batch_number, notes, created_by, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            productId,
            'adjust',
            newQuantity - currentQuantity, // 差异数量
            newQuantity, // 操作后的库存余额
            finalBatchNumber,
            notes || null,
            userId || null
          ]
        )

        // 7. 记录操作日志
        SystemLogService.createLog({
          user_id: userId || null,
          operation_type: 'inventory_check',
          table_name: 'inventory',
          record_id: productId,
          old_values: {
            old_quantity: currentQuantity,
            deleted_sn_count: deletedSNCount
          },
          new_values: {
            type: 'adjust',
            quantity: newQuantity,
            new_quantity: newQuantity,
            old_quantity: currentQuantity,
            batch_number: finalBatchNumber,
            location: location || null,
            notes: notes || null,
            sn_codes: cleanedSNs,
            sn_count: cleanedSNs.length
          },
          description: ` ${product.name}, SN码数量 ${cleanedSNs.length}, 库存从 ${currentQuantity} 变为 ${newQuantity}，批次号: ${finalBatchNumber}`
        }).catch(err => console.error('记录盘点操作日志失败:', err))
      })
    } catch (error) {
      console.error('执行库存盘点失败:', error)
      throw error
    }
  }
}

export default new InventoryService()