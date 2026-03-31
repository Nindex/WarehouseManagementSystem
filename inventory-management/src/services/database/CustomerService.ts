import databaseService from '@/database/DatabaseService'
import SystemLogService from './SystemLogService'

export interface Customer {
  id: number
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  status: number
  created_at: string
  updated_at: string
}

export interface CreateCustomerData {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
}

export interface CustomerStore {
  id: number
  customer_id: number
  store_name: string
  address?: string
  contact_person?: string
  phone?: string
  status: number
  created_at: string
  updated_at: string
  customer_name?: string
}

export interface CreateStoreData {
  customer_id: number
  store_name: string
  address?: string
  contact_person?: string
  phone?: string
}

class CustomerService {
  /**
   * 确保customers表和customer_stores表存在
   */
  private async ensureTableExists(): Promise<void> {
    try {
      const tableExists = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='customers'`
      )
      
      if (!tableExists) {
        console.log('customers表不存在，开始创建...')
        
        const createTableSql = `CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          contact_person TEXT,
          phone TEXT,
          email TEXT,
          address TEXT,
          status INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
        
        try {
          if (databaseService.exec) {
            await databaseService.exec(createTableSql)
          } else {
            await databaseService.update(createTableSql, [])
          }
          console.log('customers表创建成功')
        } catch (createError: any) {
          console.error('创建customers表失败:', createError)
          throw createError
        }
      }

      // 检查并创建customer_stores表
      const storesTableExists = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='customer_stores'`
      )
      
      if (!storesTableExists) {
        console.log('customer_stores表不存在，开始创建...')
        
        const createStoresTableSql = `CREATE TABLE customer_stores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          store_name TEXT NOT NULL,
          address TEXT,
          contact_person TEXT,
          phone TEXT,
          status INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id),
          UNIQUE(customer_id, store_name)
        )`
        
        try {
          if (databaseService.exec) {
            await databaseService.exec(createStoresTableSql)
            await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customer_stores_customer ON customer_stores(customer_id)')
            await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customer_stores_status ON customer_stores(status)')
          } else {
            await databaseService.update(createStoresTableSql, [])
          }
          console.log('customer_stores表创建成功')
        } catch (createError: any) {
          console.error('创建customer_stores表失败:', createError)
          throw createError
        }
      }
    } catch (err: any) {
      console.warn('检查/创建customers表时出现警告:', err.message || err)
    }
  }

  /**
   * 获取所有客户
   */
  async getAllCustomers(
    page = 1, 
    pageSize = 20, 
    search = '',
    includeDisabled = false
  ): Promise<{ data: Customer[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureTableExists()
      
      let whereConditions = includeDisabled ? '1=1' : 'status = 1'
      const params: any[] = []

      if (search) {
        whereConditions += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)'
        const searchPattern = `%${search}%`
        params.push(searchPattern, searchPattern, searchPattern)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM customers WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      const customers = await databaseService.query<Customer>(
        `SELECT * FROM customers WHERE ${whereConditions} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      return {
        data: customers,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取客户列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取客户
   */
  async getCustomerById(id: number): Promise<Customer | null> {
    try {
      await this.ensureTableExists()
      
      const customer = await databaseService.queryOne<Customer>(
        'SELECT * FROM customers WHERE id = ? AND status = 1',
        [id]
      )
      
      return customer
    } catch (error) {
      console.error('获取客户信息失败:', error)
      throw error
    }
  }

  /**
   * 创建客户
   */
  async createCustomer(customerData: CreateCustomerData, userId?: number): Promise<Customer> {
    try {
      await this.ensureTableExists()
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const customerId = await databaseService.insert(
        `INSERT INTO customers (name, contact_person, phone, email, address, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          customerData.name, 
          customerData.contact_person || null, 
          customerData.phone || null,
          customerData.email || null, 
          customerData.address || null,
          currentTimestamp,
          currentTimestamp
        ]
      )
      
      const newCustomer = await this.getCustomerById(customerId)
      if (!newCustomer) {
        throw new Error('创建客户失败')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'create_customer',
        table_name: 'customers',
        record_id: customerId,
        new_values: { name: newCustomer.name, contact_person: newCustomer.contact_person, phone: newCustomer.phone },
        description: `创建客户: ${newCustomer.name}`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return newCustomer
    } catch (error) {
      console.error('创建客户失败:', error)
      throw error
    }
  }

  /**
   * 更新客户
   */
  async updateCustomer(id: number, data: Partial<CreateCustomerData> & { status?: number }, userId?: number): Promise<Customer> {
    try {
      await this.ensureTableExists()
      
      // 先获取旧值用于日志（不限制 status）
      const oldCustomer = await databaseService.queryOne<Customer>(
        'SELECT * FROM customers WHERE id = ?',
        [id]
      )
      
      if (!oldCustomer) {
        throw new Error('客户不存在')
      }
      
      const fields: string[] = []
      const values: any[] = []
      
      if (data.name !== undefined) {
        fields.push('name = ?')
        values.push(data.name)
      }
      if (data.contact_person !== undefined) {
        fields.push('contact_person = ?')
        values.push(data.contact_person)
      }
      if (data.phone !== undefined) {
        fields.push('phone = ?')
        values.push(data.phone)
      }
      if (data.email !== undefined) {
        fields.push('email = ?')
        values.push(data.email)
      }
      if (data.address !== undefined) {
        fields.push('address = ?')
        values.push(data.address)
      }
      if (data.status !== undefined) {
        fields.push('status = ?')
        values.push(data.status)
      }
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')
      
      fields.push('updated_at = ?')
      values.push(currentTimestamp, id)
      
      const affectedRows = await databaseService.update(
        `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
        values
      )
      
      if (affectedRows === 0) {
        throw new Error('客户不存在')
      }
      
      // 不限制 status 再次查询最新数据
      const updatedCustomer = await databaseService.queryOne<Customer>(
        'SELECT * FROM customers WHERE id = ?',
        [id]
      )
      if (!updatedCustomer) {
        throw new Error('更新客户失败')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      let description = `更新客户: ${oldCustomer.name}`
      if (data.status !== undefined) {
        // 如果更新了状态，明确说明是启用还是停用
        const statusText = data.status === 1 ? '启用' : '停用'
        description = `${statusText}客户: ${oldCustomer.name}`
      } else if (data.name !== undefined && oldCustomer.name !== updatedCustomer.name) {
        description = `更新客户: ${oldCustomer.name} -> ${updatedCustomer.name}`
      }
      
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'update_customer',
        table_name: 'customers',
        record_id: id,
        old_values: { name: oldCustomer.name, status: oldCustomer.status, contact_person: oldCustomer.contact_person, phone: oldCustomer.phone },
        new_values: { name: updatedCustomer.name, status: updatedCustomer.status, contact_person: updatedCustomer.contact_person, phone: updatedCustomer.phone },
        description: description
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return updatedCustomer
    } catch (error) {
      console.error('更新客户失败:', error)
      throw error
    }
  }

  /**
   * 删除客户（软删除）
   */
  async deleteCustomer(id: number, userId?: number): Promise<void> {
    try {
      await this.ensureTableExists()
      
      // 先获取客户信息用于日志（不限制 status，确保能获取到信息）
      const customer = await databaseService.queryOne<Customer>(
        'SELECT * FROM customers WHERE id = ?',
        [id]
      )
      
      if (!customer) {
        throw new Error('客户不存在')
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')
      
      const affectedRows = await databaseService.update(
        'UPDATE customers SET status = 0, updated_at = ? WHERE id = ?',
        [currentTimestamp, id]
      )
      
      if (affectedRows === 0) {
        throw new Error('客户不存在')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        user_id: userId || null,
        operation_type: 'delete_customer',
        table_name: 'customers',
        record_id: id,
        old_values: { name: customer.name },
        description: `删除客户: ${customer.name}`
      }).catch(err => console.error('记录操作日志失败:', err))
    } catch (error) {
      console.error('删除客户失败:', error)
      throw error
    }
  }

  /**
   * 获取客户的所有门店
   */
  async getCustomerStores(customerId: number): Promise<CustomerStore[]> {
    try {
      await this.ensureTableExists()
      
      const stores = await databaseService.query<CustomerStore>(
        'SELECT * FROM customer_stores WHERE customer_id = ? AND status = 1 ORDER BY store_name ASC',
        [customerId]
      )
      
      return stores
    } catch (error) {
      console.error('获取客户门店列表失败:', error)
      throw error
    }
  }

  /**
   * 获取所有门店（可搜索、分页）
   */
  async getAllStores(
    page = 1,
    pageSize = 20,
    search = '',
    customerId?: number,
    includeDisabled = false,
    statusFilter?: number
  ): Promise<{ data: CustomerStore[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureTableExists()

      let whereConditions = includeDisabled ? '1=1' : 'cs.status = 1'
      const params: any[] = []

      if (search) {
        whereConditions += ' AND (cs.store_name LIKE ? OR c.name LIKE ?)'
        const pattern = `%${search}%`
        params.push(pattern, pattern)
      }

      if (customerId !== undefined && customerId !== null) {
        whereConditions += ' AND cs.customer_id = ?'
        params.push(customerId)
      }

      if (statusFilter !== undefined && statusFilter !== null) {
        whereConditions += ' AND cs.status = ?'
        params.push(statusFilter)
      }

      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM customer_stores cs
         LEFT JOIN customers c ON cs.customer_id = c.id
         WHERE ${whereConditions}`,
        params
      )

      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      const stores = await databaseService.query<CustomerStore>(
        `SELECT 
           cs.*, 
           c.name as customer_name
         FROM customer_stores cs
         LEFT JOIN customers c ON cs.customer_id = c.id
         WHERE ${whereConditions}
         ORDER BY cs.store_name ASC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      return {
        data: stores,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取门店列表失败:', error)
      throw error
    }
  }

  /**
   * 创建或获取门店（如果已存在则返回，不存在则创建）
   */
  async createOrGetStore(storeData: CreateStoreData): Promise<CustomerStore> {
    try {
      await this.ensureTableExists()
      
      // 先检查是否已存在
      const existingStore = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE customer_id = ? AND store_name = ? AND status = 1',
        [storeData.customer_id, storeData.store_name]
      )
      
      if (existingStore) {
        return existingStore
      }
      
      // 如果不存在，创建新门店
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const storeId = await databaseService.insert(
        `INSERT INTO customer_stores (customer_id, store_name, address, contact_person, phone, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          storeData.customer_id,
          storeData.store_name,
          storeData.address || null,
          storeData.contact_person || null,
          storeData.phone || null,
          currentTimestamp,
          currentTimestamp
        ]
      )
      
      const newStore = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE id = ?',
        [storeId]
      )
      
      if (!newStore) {
        throw new Error('创建门店失败')
      }

      // 记录创建门店日志（异步）
      SystemLogService.createLog({
        operation_type: 'create_store',
        table_name: 'customer_stores',
        record_id: storeId,
        new_values: { 
          customer_id: newStore.customer_id,
          store_name: newStore.store_name
        },
        description: `创建门店: ${newStore.store_name} (客户ID: ${newStore.customer_id})`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return newStore
    } catch (error: any) {
      // 如果是唯一约束错误，说明门店已存在，再次查询返回
      if (error?.message?.includes('UNIQUE constraint')) {
        const existingStore = await databaseService.queryOne<CustomerStore>(
          'SELECT * FROM customer_stores WHERE customer_id = ? AND store_name = ?',
          [storeData.customer_id, storeData.store_name]
        )
        if (existingStore) {
          // 如果门店存在但状态为0，恢复它
          if (existingStore.status === 0) {
            const now = new Date()
            const currentTimestamp = 
              now.getFullYear() + '-' +
              String(now.getMonth() + 1).padStart(2, '0') + '-' +
              String(now.getDate()).padStart(2, '0') + ' ' +
              String(now.getHours()).padStart(2, '0') + ':' +
              String(now.getMinutes()).padStart(2, '0') + ':' +
              String(now.getSeconds()).padStart(2, '0')
            
            await databaseService.update(
              'UPDATE customer_stores SET status = 1, updated_at = ? WHERE id = ?',
              [currentTimestamp, existingStore.id]
            )
            const restoredStore = { ...existingStore, status: 1, updated_at: currentTimestamp }

            // 记录启用门店日志（异步）
            SystemLogService.createLog({
              operation_type: 'update_store',
              table_name: 'customer_stores',
              record_id: existingStore.id,
              old_values: { 
                store_name: existingStore.store_name,
                status: existingStore.status
              },
              new_values: { 
                store_name: existingStore.store_name,
                status: 1 
              },
              description: `启用门店: ${existingStore.store_name}`
            }).catch(err => console.error('记录操作日志失败:', err))

            return restoredStore
          }
          return existingStore
        }
      }
      console.error('创建或获取门店失败:', error)
      throw error
    }
  }

  /**
   * 创建门店
   */
  async createStore(storeData: CreateStoreData, userId?: number): Promise<CustomerStore> {
    try {
      await this.ensureTableExists()
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const storeId = await databaseService.insert(
        `INSERT INTO customer_stores (customer_id, store_name, address, contact_person, phone, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          storeData.customer_id,
          storeData.store_name,
          storeData.address || null,
          storeData.contact_person || null,
          storeData.phone || null,
          currentTimestamp,
          currentTimestamp
        ]
      )
      
      const newStore = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE id = ?',
        [storeId]
      )
      
      if (!newStore) {
        throw new Error('创建门店失败')
      }

      // 记录创建门店日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'create_store',
        table_name: 'customer_stores',
        record_id: storeId,
        new_values: { 
          customer_id: newStore.customer_id,
          store_name: newStore.store_name,
          address: newStore.address,
          contact_person: newStore.contact_person,
          phone: newStore.phone
        },
        description: `创建门店: ${newStore.store_name} (客户ID: ${newStore.customer_id})`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return newStore
    } catch (error: any) {
      console.error('创建门店失败:', error)
      // 如果是唯一约束错误，转换为友好的中文提示
      if (error?.message?.includes('UNIQUE constraint') && error?.message?.includes('customer_stores.customer_id, customer_stores.store_name')) {
        throw new Error('该客户下已存在相同名称的门店，请使用不同的门店名称')
      }
      throw error
    }
  }

  /**
   * 更新门店
   */
  async updateStore(id: number, data: Partial<CreateStoreData> & { status?: number }, userId?: number): Promise<CustomerStore> {
    try {
      await this.ensureTableExists()
      
      const fields: string[] = []
      const values: any[] = []
      
      if (data.customer_id !== undefined) {
        fields.push('customer_id = ?')
        values.push(data.customer_id)
      }
      if (data.store_name !== undefined) {
        fields.push('store_name = ?')
        values.push(data.store_name)
      }
      if (data.address !== undefined) {
        fields.push('address = ?')
        values.push(data.address)
      }
      if (data.contact_person !== undefined) {
        fields.push('contact_person = ?')
        values.push(data.contact_person)
      }
      if (data.phone !== undefined) {
        fields.push('phone = ?')
        values.push(data.phone)
      }
      if (data.status !== undefined) {
        fields.push('status = ?')
        values.push(data.status)
      }
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }
      
      // 先获取旧值用于日志
      const oldStore = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE id = ?',
        [id]
      )
      
      if (!oldStore) {
        throw new Error('门店不存在')
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')
      
      fields.push('updated_at = ?')
      values.push(currentTimestamp, id)
      
      const affectedRows = await databaseService.update(
        `UPDATE customer_stores SET ${fields.join(', ')} WHERE id = ?`,
        values
      )
      
      if (affectedRows === 0) {
        throw new Error('门店不存在')
      }
      
      const updatedStore = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE id = ?',
        [id]
      )
      
      if (!updatedStore) {
        throw new Error('更新门店失败')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      let description = `更新门店: ${oldStore.store_name}`
      if (data.status !== undefined) {
        // 如果更新了状态，明确说明是启用还是停用，
        const statusText = data.status === 1 ? '启用' : '停用'
        description = `${statusText}门店: ${oldStore.store_name}`
      } else if (data.store_name !== undefined && oldStore.store_name !== updatedStore.store_name) {
        description = `更新门店: ${oldStore.store_name} -> ${updatedStore.store_name}`
      } else if (data.customer_id !== undefined && oldStore.customer_id !== updatedStore.customer_id) {
        description = `更新门店: ${oldStore.store_name} 的客户`
      }
      
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'update_store',
        table_name: 'customer_stores',
        record_id: id,
        old_values: { 
          store_name: oldStore.store_name, 
          status: oldStore.status,
          customer_id: oldStore.customer_id,
          address: oldStore.address,
          contact_person: oldStore.contact_person,
          phone: oldStore.phone
        },
        new_values: { 
          store_name: updatedStore.store_name, 
          status: updatedStore.status,
          customer_id: updatedStore.customer_id,
          address: updatedStore.address,
          contact_person: updatedStore.contact_person,
          phone: updatedStore.phone
        },
        description: description
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return updatedStore
    } catch (error) {
      console.error('更新门店失败:', error)
      throw error
    }
  }

  /**
   * 删除门店（软删除：仅将status置为0）
   */
  async deleteStore(id: number, userId?: number): Promise<void> {
    try {
      await this.ensureTableExists()

      // 获取门店信息用于日志
      const store = await databaseService.queryOne<CustomerStore>(
        'SELECT * FROM customer_stores WHERE id = ?',
        [id]
      )

      if (!store) {
        throw new Error('门店不存在')
      }

      const now = new Date()
      const currentTimestamp =
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const affectedRows = await databaseService.update(
        'UPDATE customer_stores SET status = 0, updated_at = ? WHERE id = ?',
        [currentTimestamp, id]
      )

      if (affectedRows === 0) {
        throw new Error('门店不存在')
      }

      // 记录操作日志（异步）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'delete_store',
        table_name: 'customer_stores',
        record_id: id,
        old_values: { store_name: store.store_name, customer_id: store.customer_id },
        description: `删除门店: ${store.store_name}`
      }).catch(err => console.error('记录操作日志失败:', err))
    } catch (error) {
      console.error('删除门店失败:', error)
      throw error
    }
  }
}

export default new CustomerService()

