import fs from 'fs'
import path from 'path'

interface DatabaseData {
  users: any[]
  products: any[]
  inventory: any[]
  inventory_transactions: any[]
  categories: any[]
  suppliers: any[]
  purchase_orders: any[]
  purchase_order_items: any[]
  purchase_returns: any[]
  purchase_return_items: any[]
  settings: any[]
}

class SimpleDatabase {
  private dataPath: string
  private data: DatabaseData

  constructor() {
    const userDataPath = process.env.APPDATA || process.env.HOME || process.cwd()
    const appDataPath = path.join(userDataPath, 'InventoryManagement')
    
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true })
    }
    
    this.dataPath = path.join(appDataPath, 'inventory-data.json')
    this.data = this.loadData()
  }

  private loadData(): DatabaseData {
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf8')
        return JSON.parse(content)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    }

    // 初始化默认数据
    return {
      users: [
        {
          id: 1,
          username: 'admin',
          password: 'password',
          name: '系统管理员',
          email: 'admin@company.com',
          phone: '13800138000',
          status: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 2,
          username: 'buyer',
          password: 'password',
          name: '采购员张三',
          email: 'buyer1@company.com',
          phone: '13800138001',
          status: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 3,
          username: 'warehouse',
          password: 'password',
          name: '仓库管理员李四',
          email: 'warehouse1@company.com',
          phone: '13800138002',
          status: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      categories: [],
      products: [
        {
          id: 1,
          name: 'ThinkPad笔记本',
          code: 'P001',
          barcode: '1234567890123',
          category_id: null,
          unit: '台',
          specification: 'E14 Gen3',
          min_stock: 5,
          max_stock: 50,
          purchase_price: 4500.00,
          selling_price: 5999.00,
          status: 1,
          description: '联想ThinkPad商务笔记本',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 2,
          name: '罗技鼠标',
          code: 'P002',
          barcode: '1234567890124',
          category_id: null,
          unit: '个',
          specification: 'M720',
          min_stock: 10,
          max_stock: 100,
          purchase_price: 150.00,
          selling_price: 199.00,
          status: 1,
          description: '罗技无线鼠标',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 3,
          name: 'A4打印纸',
          code: 'P003',
          barcode: '1234567890125',
          category_id: null,
          unit: '包',
          specification: '80g 500张',
          min_stock: 20,
          max_stock: 200,
          purchase_price: 25.00,
          selling_price: 35.00,
          status: 1,
          description: '高品质打印纸',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      inventory: [
        {
          id: 1,
          product_id: 1,
          quantity: 25,
          location: 'A1-01',
          batch_number: 'B2024001',
          production_date: '2024-01-01',
          expiry_date: '2026-01-01',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 2,
          product_id: 2,
          quantity: 45,
          location: 'A1-02',
          batch_number: 'B2024002',
          production_date: '2024-01-15',
          expiry_date: '2025-01-15',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 3,
          product_id: 3,
          quantity: 150,
          location: 'B1-01',
          batch_number: 'B2024003',
          production_date: '2024-02-01',
          expiry_date: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ],
      inventory_transactions: [],
      suppliers: [],
      purchase_orders: [],
      purchase_order_items: [],
      purchase_returns: [],
      purchase_return_items: [],
      settings: [
        // 系统设置将在应用首次运行时通过 SystemSettingService 自动创建
        // 只保留实际使用的设置
        { key: 'lowStockThreshold', value: '10', description: '低库存预警阈值' },
        { key: 'autoBackup', value: 'true', description: '自动备份开关' },
        { key: 'backupInterval', value: '7', description: '备份间隔天数' },
      ]
    }
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2))
    } catch (error) {
      console.error('保存数据失败:', error)
      throw error
    }
  }

  // 查询方法
  query(table: string, conditions: any = {}): any[] {
    let data = this.data[table as keyof DatabaseData] || []
    
    // 简单的条件过滤
    if (Object.keys(conditions).length > 0) {
      data = data.filter((item: any) => {
        return Object.entries(conditions).every(([key, value]) => {
          if (typeof value === 'string' && value.includes('%')) {
            // LIKE 操作
            const pattern = value.replace(/%/g, '')
            return item[key]?.toString().toLowerCase().includes(pattern.toLowerCase())
          }
          return item[key] === value
        })
      })
    }
    
    return data
  }

  get(table: string, conditions: any = {}): any | null {
    const results = this.query(table, conditions)
    return results.length > 0 ? results[0] : null
  }

  insert(table: string, data: any): number {
    const tableData = this.data[table as keyof DatabaseData]
    const newId = Math.max(...tableData.map((item: any) => item.id || 0), 0) + 1
    
    const newItem = { ...data, id: newId }
    tableData.push(newItem)
    this.saveData()
    
    return newId
  }

  update(table: string, id: number, data: any): boolean {
    const tableData = this.data[table as keyof DatabaseData]
    const index = tableData.findIndex((item: any) => item.id === id)
    
    if (index === -1) {
      return false
    }
    
    tableData[index] = { ...tableData[index], ...data, id }
    this.saveData()
    return true
  }

  delete(table: string, id: number): boolean {
    const tableData = this.data[table as keyof DatabaseData]
    const index = tableData.findIndex((item: any) => item.id === id)
    
    if (index === -1) {
      return false
    }
    
    tableData.splice(index, 1)
    this.saveData()
    return true
  }

  // 备份功能
  backup(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = this.dataPath.replace('inventory-data.json', `backup_${timestamp}.json`)
    
    try {
      fs.copyFileSync(this.dataPath, backupPath)
      return backupPath
    } catch (error) {
      console.error('备份失败:', error)
      throw error
    }
  }

  // 获取统计数据
  getStats(): any {
    return {
      totalProducts: this.data.products.filter((p: any) => p.status === 1).length,
      totalInventory: this.data.inventory.length,
      totalQuantity: this.data.inventory.reduce((sum: number, item: any) => sum + item.quantity, 0),
      lowStockProducts: this.data.products.filter((p: any) => {
        const inventory = this.data.inventory.find((inv: any) => inv.product_id === p.id)
        return p.status === 1 && inventory && inventory.quantity <= p.min_stock
      }).length,
      highStockProducts: this.data.products.filter((p: any) => {
        const inventory = this.data.inventory.find((inv: any) => inv.product_id === p.id)
        return p.status === 1 && inventory && inventory.quantity >= p.max_stock
      }).length
    }
  }

  // 清除所有数据（保留表结构，只清空数据，但保留 users 表）
  clearAll(): void {
    // 保留所有用户数据，不清除 users 表
    const existingUsers = this.data.users || []
    
    // 清空所有表的数据（保留 users 表）
    this.data = {
      users: existingUsers, // 保留所有用户数据
      products: [],
      inventory: [],
      inventory_transactions: [],
      categories: [],
      suppliers: [],
      purchase_orders: [],
      purchase_order_items: [],
      purchase_returns: [],
      purchase_return_items: [],
      settings: [
        // 系统设置将在应用首次运行时通过 SystemSettingService 自动创建
        // 只保留实际使用的设置
        { key: 'lowStockThreshold', value: '10', description: '低库存预警阈值' },
        { key: 'autoBackup', value: 'true', description: '自动备份开关' },
        { key: 'backupInterval', value: '7', description: '备份间隔天数' },
        { key: 'language', value: 'zh-CN', description: '语言设置' }
      ]
    }
    
    this.saveData()
  }
}

// 创建全局实例
export const simpleDB = new SimpleDatabase()

// 导出兼容的接口
export function query(table: string, conditions: any = []): any[] {
  return simpleDB.query(table, conditions)
}

export function get(table: string, conditions: any = {}): any | null {
  return simpleDB.get(table, conditions)
}

export function run(sql: string, params: any[] = []): any {
  // 简单的SQL解析（仅支持基本操作）
  const sqlLower = sql.toLowerCase().trim()
  
  if (sqlLower.startsWith('select')) {
    const tableMatch = sql.match(/from\s+(\w+)/i)
    const table = tableMatch ? tableMatch[1] : ''
    
    if (sql.includes('where')) {
      const whereMatch = sql.match(/where\s+(.+)/i)
      if (whereMatch) {
        const whereClause = whereMatch[1]
        const conditions = parseWhereClause(whereClause, params)
        return simpleDB.query(table, conditions)
      }
    }
    
    return simpleDB.query(table)
  }
  
  if (sqlLower.startsWith('insert')) {
    const tableMatch = sql.match(/into\s+(\w+)/i)
    const table = tableMatch ? tableMatch[1] : ''
    
    const valuesMatch = sql.match(/values\s*\(([^)]+)\)/i)
    if (valuesMatch && params.length > 0) {
      const data = parseInsertData(sql, params)
      const id = simpleDB.insert(table, data)
      return { lastInsertRowid: id, changes: 1 }
    }
  }
  
  if (sqlLower.startsWith('update')) {
    const tableMatch = sql.match(/update\s+(\w+)/i)
    const table = tableMatch ? tableMatch[1] : ''
    
    const setMatch = sql.match(/set\s+(.+?)\s+where/i)
    const whereMatch = sql.match(/where\s+(.+)/i)
    
    if (setMatch && whereMatch) {
      const id = parseUpdateId(whereMatch[1], params)
      const data = parseUpdateData(setMatch[1], params)
      const success = simpleDB.update(table, id, data)
      return { changes: success ? 1 : 0 }
    }
  }
  
  return { changes: 0 }
}

// 简单的WHERE子句解析
function parseWhereClause(whereClause: string, params: any[]): any {
  const conditions: any = {}
  
  // 简单的等值条件解析
  const equalMatches = whereClause.match(/(\w+)\s*=\s*\?/g)
  if (equalMatches) {
    equalMatches.forEach((match, index) => {
      const key = match.match(/(\w+)\s*=/)?.[1]
      if (key && params[index] !== undefined) {
        conditions[key] = params[index]
      }
    })
  }
  
  return conditions
}

// 简单的INSERT数据解析
function parseInsertData(sql: string, params: any[]): any {
  const data: any = {}
  
  // 解析列名
  const columnsMatch = sql.match(/\(([^)]+)\)\s*values/i)
  if (columnsMatch) {
    const columns = columnsMatch[1].split(',').map(col => col.trim())
    columns.forEach((col, index) => {
      if (params[index] !== undefined) {
        data[col] = params[index]
      }
    })
  }
  
  return data
}

// 简单的UPDATE数据解析
function parseUpdateData(setClause: string, params: any[]): any {
  const data: any = {}
  
  const setMatches = setClause.match(/(\w+)\s*=\s*\?/g)
  if (setMatches) {
    setMatches.forEach((match, index) => {
      const key = match.match(/(\w+)\s*=/)?.[1]
      if (key && params[index] !== undefined) {
        data[key] = params[index]
      }
    })
  }
  
  return data
}

// 解析UPDATE的ID
function parseUpdateId(whereClause: string, params: any[]): number {
  const idMatch = whereClause.match(/id\s*=\s*\?(\s|$)/)
  if (idMatch && params.length > 0) {
    const idParam = params[params.length - 1]
    return typeof idParam === 'number' ? idParam : parseInt(idParam)
  }
  return 0
}
