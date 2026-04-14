import databaseService from '@/database/DatabaseService'

// ========== 类型定义 ==========

export interface RepairPart {
  id?: number
  repair_id?: number
  part_name?: string          // 部件名称
  part_sn: string             // 部件SN码
  repair_amount: number       // 维修金额
  accessory_amount: number    // 配件金额
  other_amount: number        // 其他费用
  notes?: string              // 备注
  repair_date: string         // 维修日期（必填）
  warranty_value: number      // 质保数值
  warranty_unit: 'month' | 'year' // 质保单位
  warranty_end_date: string   // 质保截止（自动计算）
  subtotal?: number           // 小计（计算字段）
}

export interface RepairRecord {
  id?: number
  serial_number: string       // 关联的SN码
  product_id: number          // 关联的商品ID
  customer_id?: number        // 客户ID
  store_id?: number           // 门店ID
  customer_name?: string      // 客户名称（冗余）
  store_name?: string         // 门店名称（冗余）
  total_amount?: number       // 总金额
  created_at?: string
  updated_at?: string
  parts?: RepairPart[]        // 维修部件列表
}

export interface RepairListItem {
  id: number
  serial_number: string
  product_id: number
  customer_name: string
  store_name: string
  total_amount: number
  repair_date: string         // 最近一次维修日期
  warranty_end_date: string   // 最近一次质保截止
  created_at: string
}

// ========== 迁移：建表 ==========

async function migrateRepairTables(): Promise<void> {
  try {
    // 检查 repair_records 表是否存在
    const repairTable = await databaseService.queryOne<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='repair_records'`
    )
    if (!repairTable) {
      await databaseService.exec(`
        CREATE TABLE IF NOT EXISTS repair_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_number TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          customer_id INTEGER,
          store_id INTEGER,
          customer_name TEXT,
          store_name TEXT,
          total_amount REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      console.log('✓ 已创建 repair_records 表')
    }

    // 检查 repair_parts 表是否存在
    const repairPartsTable = await databaseService.queryOne<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='repair_parts'`
    )
    if (!repairPartsTable) {
      await databaseService.exec(`
        CREATE TABLE IF NOT EXISTS repair_parts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repair_id INTEGER NOT NULL,
          part_name TEXT,
          part_sn TEXT NOT NULL,
          repair_amount REAL DEFAULT 0,
          accessory_amount REAL DEFAULT 0,
          other_amount REAL DEFAULT 0,
          notes TEXT,
          repair_date TEXT NOT NULL,
          warranty_value INTEGER DEFAULT 0,
          warranty_unit TEXT DEFAULT 'month',
          warranty_end_date TEXT NOT NULL,
          FOREIGN KEY (repair_id) REFERENCES repair_records(id) ON DELETE CASCADE
        )
      `)
      console.log('✓ 已创建 repair_parts 表')
    } else {
      // 旧表兼容：补加 part_name 列
      const cols = await databaseService.query<{ name: string }>(
        `PRAGMA table_info(repair_parts)`
      )
      const hasPartName = cols.some((c: { name: string }) => c.name === 'part_name')
      if (!hasPartName) {
        await databaseService.exec(`ALTER TABLE repair_parts ADD COLUMN part_name TEXT`)
        console.log('✓ repair_parts 表已补加 part_name 列')
      }
    }
  } catch (error: any) {
    console.error('维修记录表迁移失败:', error?.message || error)
  }
}

// ========== Service ==========

const RepairService = {
  // 确保表存在（每次使用前调用）
  async ensureTables(): Promise<void> {
    await migrateRepairTables()
  },

  // 获取某SN码的所有维修记录（含部件）
  async getRepairsBySN(serialNumber: string): Promise<RepairRecord[]> {
    await migrateRepairTables()
    const records = await databaseService.query<RepairRecord>(
      `SELECT * FROM repair_records WHERE serial_number = ? ORDER BY created_at DESC`,
      [serialNumber]
    )
    for (const record of records) {
      const parts = await databaseService.query<RepairPart>(
        `SELECT * FROM repair_parts WHERE repair_id = ? ORDER BY id ASC`,
        [record.id]
      )
      record.parts = parts.map(p => ({
        ...p,
        subtotal: (p.repair_amount || 0) + (p.accessory_amount || 0) + (p.other_amount || 0)
      }))
    }
    return records
  },

  // 新增维修记录（含多条部件）
  async createRepair(data: RepairRecord): Promise<RepairRecord> {
    await migrateRepairTables()
    const parts = data.parts || []
    const totalAmount = parts.reduce(
      (sum, p) => sum + (p.repair_amount || 0) + (p.accessory_amount || 0) + (p.other_amount || 0),
      0
    )
    const id = await databaseService.insert(
      `INSERT INTO repair_records (serial_number, product_id, customer_id, store_id, customer_name, store_name, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.serial_number,
        data.product_id,
        data.customer_id ?? null,
        data.store_id ?? null,
        data.customer_name ?? null,
        data.store_name ?? null,
        totalAmount
      ]
    )
    for (const part of parts) {
      await databaseService.insert(
        `INSERT INTO repair_parts (repair_id, part_name, part_sn, repair_amount, accessory_amount, other_amount, notes, repair_date, warranty_value, warranty_unit, warranty_end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          part.part_name ?? null,
          part.part_sn,
          part.repair_amount || 0,
          part.accessory_amount || 0,
          part.other_amount || 0,
          part.notes ?? null,
          part.repair_date,
          part.warranty_value || 0,
          part.warranty_unit || 'month',
          part.warranty_end_date
        ]
      )
    }
    const created = await databaseService.queryOne<RepairRecord>(
      `SELECT * FROM repair_records WHERE id = ?`,
      [id]
    )
    return created!
  },

  // 删除维修记录（级联删除部件）
  async deleteRepair(id: number): Promise<void> {
    await migrateRepairTables()
    await databaseService.update(`DELETE FROM repair_parts WHERE repair_id = ?`, [id])
    await databaseService.update(`DELETE FROM repair_records WHERE id = ?`, [id])
  }
}

export default RepairService
