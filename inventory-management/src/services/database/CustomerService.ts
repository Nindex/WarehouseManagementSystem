import databaseService from '@/database/DatabaseService'
import SystemLogService from './SystemLogService'

export interface Customer {
  id: number
  code?: string
  name: string
  contact_person?: string
  phone?: string
  address?: string
  backend_url?: string
  backend_account?: string
  backend_password?: string
  upgrade_password?: string
  status: number
  created_at: string
  updated_at: string
}

export interface CreateCustomerData {
  code?: string
  name: string
  contact_person?: string
  phone?: string
  service_fee_expiry_date?: string
  address?: string
  backend_url?: string
  backend_account?: string
  backend_password?: string
  upgrade_password?: string
}

export interface CustomerStore {
  id: number
  customer_id: number
  code?: string
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
  code?: string
  store_name: string
  address?: string
  contact_person?: string
  phone?: string
}

export interface ServiceFeeRecord {
  id: number
  customer_id: number
  start_date: string
  end_date: string
  payment_date?: string
  is_paid: number
  amount?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface CreateServiceFeeData {
  customer_id: number
  start_date: string
  end_date: string
  payment_date?: string
  is_paid?: number
  amount: number
  notes?: string
}

class CustomerService {
  
  /**
   * 确保 customers 表和 customer_stores 表存在
   * 使用 CREATE TABLE IF NOT EXISTS，并自动迁移新增的列
   */
  private async ensureTableExists(): Promise<void> {
    try {
      await databaseService.exec(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE,
          name TEXT NOT NULL,
          contact_person TEXT,
          phone TEXT,
          address TEXT,
          backend_url TEXT,
          backend_account TEXT,
          backend_password TEXT,
          upgrade_password TEXT,
          status INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 自动迁移：检查并添加 customers 表缺失的列
      const customerColumns = await databaseService.query<{name: string}>(
        'PRAGMA table_info(customers)'
      );
      const customerColumnNames = customerColumns.map((c: any) => c.name);
      
      const neededCustomerCols = {
        code: 'TEXT',
        backend_url: 'TEXT',
        backend_account: 'TEXT',
        backend_password: 'TEXT',
        upgrade_password: 'TEXT',
      };
      for (const [col, colType] of Object.entries(neededCustomerCols)) {
        if (!customerColumnNames.includes(col)) {
          console.log(`[DB Migration] customers 表缺少 ${col} 列，正在添加...`);
          await databaseService.exec(`ALTER TABLE customers ADD COLUMN ${col} ${colType}`);
          console.log(`[DB Migration] customers.${col} 列已添加`);
        }
      }
      // code 唯一索引（允许 NULL）
      await databaseService.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code ON customers(code) WHERE code IS NOT NULL'
      );

      await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)');
      await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)');

      await databaseService.exec(`
        CREATE TABLE IF NOT EXISTS customer_stores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          code TEXT UNIQUE,
          store_name TEXT NOT NULL,
          address TEXT,
          contact_person TEXT,
          phone TEXT,
          status INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id),
          UNIQUE(customer_id, store_name)
        )
      `);

      // 自动迁移：检查并添加 customer_stores 表缺失的列
      const storeColumns = await databaseService.query<{name: string}>(
        'PRAGMA table_info(customer_stores)'
      );
      const storeColumnNames = storeColumns.map((c: any) => c.name);
      
      if (!storeColumnNames.includes('code')) {
        console.log('[DB Migration] customer_stores 表缺少 code 列，正在添加...');
        await databaseService.exec('ALTER TABLE customer_stores ADD COLUMN code TEXT');
        console.log('[DB Migration] customer_stores.code 列已添加');
      }
      await databaseService.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_stores_code ON customer_stores(code) WHERE code IS NOT NULL'
      );

      await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customer_stores_customer ON customer_stores(customer_id)');
      await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_customer_stores_status ON customer_stores(status)');

      await databaseService.exec(`
        CREATE TABLE IF NOT EXISTS service_fee_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          payment_date TEXT,
          is_paid INTEGER DEFAULT 0,
          amount REAL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
      `);

      // 自动迁移：检查并添加 service_fee_records 表缺失的列
      const feeColumns = await databaseService.query<{name: string}>(
        'PRAGMA table_info(service_fee_records)'
      );
      const feeColumnNames = feeColumns.map((c: any) => c.name);
      
      if (!feeColumnNames.includes('amount')) {
        console.log('[DB Migration] service_fee_records 表缺少 amount 列，正在添加...');
        await databaseService.exec('ALTER TABLE service_fee_records ADD COLUMN amount REAL');
        console.log('[DB Migration] service_fee_records.amount 列已添加');
      }

      console.log('✓ ensureTableExists 完成');
    } catch (err: any) {
      console.error('检查/创建表失败:', err.message || err);
      throw err;
    }
  }

  

/**
   * 获取所有客户
   * 自动包含 fee_status 字段和最后服务费到期时间
   */
  async getAllCustomers(
    page = 1, 
    pageSize = 20, 
    search = '',
    includeDisabled = false,
    statusFilter?: number,
    feeStatusFilter?: string,
    sortField?: string,
    sortOrder?: 'asc' | 'desc'
  ): Promise<{ data: (Customer & { fee_status: string; last_fee_end_date?: string })[]; total: number; page: number; pageSize: number }> {
    try {
      await this.ensureTableExists()
      
      let whereConditions = includeDisabled ? '1=1' : 'c.status = 1'
      const params: any[] = []

      if (search) {
        whereConditions += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)'
        const searchPattern = `%${search}%`
        params.push(searchPattern, searchPattern, searchPattern)
      }

      // 到期状态筛选
      if (feeStatusFilter !== undefined && feeStatusFilter !== null && feeStatusFilter !== '') {
        const today = new Date().toISOString().split('T')[0]
        if (feeStatusFilter === '已到期') {
          // 已到期：当前没有有效的服务费记录（即没有 start_date <= today <= end_date 的记录）
          // 也包括没有任何服务费记录的客户
          whereConditions += ` AND NOT EXISTS (SELECT 1 FROM service_fee_records sfr WHERE sfr.customer_id = c.id AND sfr.start_date <= ? AND sfr.end_date >= ?)`
          params.push(today, today)
        } else if (feeStatusFilter === '未到期') {
          // 未到期：当前有有效的服务费记录
          whereConditions += ` AND EXISTS (SELECT 1 FROM service_fee_records sfr WHERE sfr.customer_id = c.id AND sfr.start_date <= ? AND sfr.end_date >= ?)`
          params.push(today, today)
        }
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM customers c WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 构建排序语句
      let orderBy = 'c.name ASC'
      if (sortField === 'last_fee_end_date') {
        if (sortOrder === 'asc') {
          orderBy = `last_fee_end_date ASC NULLS FIRST`
        } else if (sortOrder === 'desc') {
          orderBy = `last_fee_end_date DESC NULLS LAST`
        }
      }

      // 获取分页数据，同时获取最后的服务费到期时间
      const customers = await databaseService.query<Customer & { last_fee_end_date?: string }>(
        `SELECT c.*, 
                (SELECT MAX(end_date) FROM service_fee_records sfr 
                 WHERE sfr.customer_id = c.id) as last_fee_end_date
         FROM customers c 
         WHERE ${whereConditions} 
         ORDER BY ${orderBy} 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      // 为每个客户添加 fee_status 字段
      const customersWithFeeStatus = await Promise.all(
        customers.map(async (customer) => {
          const feeStatus = await this.getServiceFeeStatus(customer.id)
          return {
            ...customer,
            fee_status: feeStatus,
            last_fee_end_date: customer.last_fee_end_date || undefined
          }
        })
      )
      
      return {
        data: customersWithFeeStatus,
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
      
      // 验证 code 唯一性（如果提供了 code）
      if (customerData.code) {
        const existingCustomer = await databaseService.queryOne<Customer>(
          'SELECT * FROM customers WHERE code = ?',
          [customerData.code]
        )
        if (existingCustomer) {
          throw new Error(`客户编码 "${customerData.code}" 已存在，请使用其他编码`)
        }
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const customerId = await databaseService.insert(
        `INSERT INTO customers (code, name, contact_person, phone, address, backend_url, backend_account, backend_password, upgrade_password, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          customerData.code || null,
          customerData.name, 
          customerData.contact_person || null, 
          customerData.phone || null,
          customerData.address || null,
          customerData.backend_url || null,
          customerData.backend_account || null,
          customerData.backend_password || null,
          customerData.upgrade_password || null,
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
      // 注意：code 字段建立后不允许修改，即使传入也忽略
      // 注意：email 列已移除，不再更新
      if (data.address !== undefined) {
        fields.push('address = ?')
        values.push(data.address)
      }
      if (data.backend_url !== undefined) {
        fields.push('backend_url = ?')
        values.push(data.backend_url)
      }
      if (data.backend_account !== undefined) {
        fields.push('backend_account = ?')
        values.push(data.backend_account)
      }
      if (data.backend_password !== undefined) {
        fields.push('backend_password = ?')
        values.push(data.backend_password)
      }
      if (data.upgrade_password !== undefined) {
        fields.push('upgrade_password = ?')
        values.push(data.upgrade_password)
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
        old_values: { 
          name: oldCustomer.name, 
          status: oldCustomer.status, 
          contact_person: oldCustomer.contact_person, 
          phone: oldCustomer.phone,
          backend_url: oldCustomer.backend_url,
          backend_account: oldCustomer.backend_account
        },
        new_values: { 
          name: updatedCustomer.name, 
          status: updatedCustomer.status, 
          contact_person: updatedCustomer.contact_person, 
          phone: updatedCustomer.phone,
          backend_url: updatedCustomer.backend_url,
          backend_account: updatedCustomer.backend_account
        },
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
        `INSERT INTO customer_stores (customer_id, code, store_name, address, contact_person, phone, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          storeData.customer_id,
          storeData.code || null,
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
  async createStore(storeData: CreateStoreData, userId?: number, retried: boolean = false): Promise<CustomerStore> {
    try {
      await this.ensureTableExists()
      
      // 处理 code：如果提供了则验证唯一性，如果没有提供则自动生成
      let code = storeData.code;
      
      if (code) {
        // 验证 code 唯一性
        const existingStore = await databaseService.queryOne<CustomerStore>(
          'SELECT * FROM customer_stores WHERE code = ?',
          [code]
        )
        if (existingStore) {
          throw new Error(`门店编码 "${code}" 已存在，请使用其他编码`)
        }
      } else {
        // 自动生成 code（数字格式，递增）
        const allStores = await databaseService.query<CustomerStore>(
          'SELECT code FROM customer_stores WHERE code IS NOT NULL'
        );
        
        let maxCode = 0;
        for (const store of allStores) {
          const num = parseInt(store.code);
          if (!isNaN(num) && num > maxCode) {
            maxCode = num;
          }
        }
        
        code = String(maxCode + 1);
        console.log(`自动生成门店编码: ${code}`);
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')

      const storeId = await databaseService.insert(
        `INSERT INTO customer_stores (customer_id, code, store_name, address, contact_person, phone, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          storeData.customer_id,
          code, // 使用处理后的 code（提供的或自动生成的）
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
      // 注意：code 字段建立后不允许修改，即使传入也忽略
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

  

/**
   * 确保服务费记录表存在，并确保customers表有service_fee_expiry_date列
   */
  private async ensureServiceFeeTableExists(): Promise<void> {
    try {
      await this.ensureTableExists()
      
      // 检查并添加 service_fee_expiry_date 列到 customers 表
      try {
        const tableInfo = await databaseService.query<{ name: string }>(
          'PRAGMA table_info(customers)'
        )
        
        const hasServiceFeeColumn = tableInfo.some(col => col.name === 'service_fee_expiry_date')
        
        if (!hasServiceFeeColumn) {
          // 添加新列
          await databaseService.exec('ALTER TABLE customers ADD COLUMN service_fee_expiry_date TEXT')
          console.log('✓ 已添加 service_fee_expiry_date 列到 customers 表')
        }
      } catch (err) {
        console.warn('检查/添加 service_fee_expiry_date 列失败:', err)
      }
      
      // 检查服务费记录表是否存在
      const tableExists = await databaseService.queryOne<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='service_fee_records'`
      )
      
      if (!tableExists) {
        console.log('service_fee_records表不存在，开始创建...')
        
        const createTableSql = `CREATE TABLE service_fee_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          payment_date TEXT,
          is_paid INTEGER DEFAULT 0,
          amount REAL,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        )`
        
        try {
          if (databaseService.exec) {
            await databaseService.exec(createTableSql)
            await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_service_fee_records_customer ON service_fee_records(customer_id)')
            await databaseService.exec('CREATE INDEX IF NOT EXISTS idx_service_fee_records_dates ON service_fee_records(start_date, end_date)')
          } else {
            await databaseService.update(createTableSql, [])
          }
          console.log('✓ service_fee_records表创建成功')
        } catch (createError: any) {
          console.error('创建service_fee_records表失败:', createError)
          throw createError
        }
      }
    } catch (err: any) {
      console.warn('检查/创建服务费记录表时出现警告:', err.message || err)
    }
  }

  /**
   * 检查服务费记录时间是否重叠
   * @param customerId 客户ID
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @param excludeId 排除的记录ID（用于更新时排除自身）
   * @returns 如果重叠返回重叠的记录信息，否则返回null
   */
  async checkServiceFeeDateOverlap(
    customerId: number, 
    startDate: string, 
    endDate: string, 
    excludeId?: number
  ): Promise<ServiceFeeRecord | null> {
    try {
      await this.ensureServiceFeeTableExists()
      
      let sql = `
        SELECT * FROM service_fee_records 
        WHERE customer_id = ? 
        AND (
          (start_date <= ? AND end_date >= ?) OR  -- 新记录完全覆盖旧记录
          (start_date >= ? AND start_date <= ?) OR  -- 新记录开始时间在旧记录范围内
          (end_date >= ? AND end_date <= ?)  -- 新记录结束时间在旧记录范围内
        )
      `
      let params: any[] = [
        customerId, 
        endDate, startDate,  // 覆盖判断
        startDate, endDate,  // 开始时间重叠
        startDate, endDate   // 结束时间重叠
      ]
      
      if (excludeId) {
        sql += ' AND id != ?'
        params.push(excludeId)
      }
      
      const overlappingRecord = await databaseService.queryOne<ServiceFeeRecord>(sql, params)
      return overlappingRecord || null
    } catch (error) {
      console.error('检查服务费记录时间重叠失败:', error)
      throw error
    }
  }

  /**
   * 创建服务费记录
   */
  async createServiceFeeRecord(data: CreateServiceFeeData, userId?: number): Promise<ServiceFeeRecord> {
    try {
      await this.ensureServiceFeeTableExists()
      
      // 检查时间重叠
      const overlap = await this.checkServiceFeeDateOverlap(data.customer_id, data.start_date, data.end_date)
      if (overlap) {
        throw new Error(`时间重叠：该客户在 ${overlap.start_date} 到 ${overlap.end_date} 期间已有服务费记录`)
      }
      
      const now = new Date()
      const currentTimestamp = 
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0')
      
      const recordId = await databaseService.insert(
        `INSERT INTO service_fee_records (customer_id, start_date, end_date, payment_date, is_paid, amount, notes, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.customer_id,
          data.start_date,
          data.end_date,
          data.payment_date || null,
          data.is_paid || 0,
          data.amount || null,
          data.notes || null,
          currentTimestamp,
          currentTimestamp
        ]
      )
      
      const newRecord = await databaseService.queryOne<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE id = ?',
        [recordId]
      )
      
      if (!newRecord) {
        throw new Error('创建服务费记录失败')
      }
      
      // 记录操作日志（异步）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'create_service_fee',
        table_name: 'service_fee_records',
        record_id: recordId,
        new_values: { 
          customer_id: newRecord.customer_id,
          start_date: newRecord.start_date,
          end_date: newRecord.end_date
        },
        description: `创建服务费记录: 客户ID ${newRecord.customer_id}, ${newRecord.start_date} 至 ${newRecord.end_date}`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return newRecord
    } catch (error) {
      console.error('创建服务费记录失败:', error)
      throw error
    }
  }

  /**
   * 获取客户的服务费记录
   */
  async getServiceFeeRecords(customerId: number): Promise<ServiceFeeRecord[]> {
    try {
      await this.ensureServiceFeeTableExists()
      
      const records = await databaseService.query<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE customer_id = ? ORDER BY start_date DESC',
        [customerId]
      )
      
      return records
    } catch (error) {
      console.error('获取服务费记录失败:', error)
      throw error
    }
  }

  /**
   * 更新服务费记录
   */
  async updateServiceFeeRecord(id: number, data: Partial<CreateServiceFeeData>, userId?: number): Promise<ServiceFeeRecord> {
    try {
      await this.ensureServiceFeeTableExists()
      
      // 先获取旧值用于日志
      const oldRecord = await databaseService.queryOne<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE id = ?',
        [id]
      )
      
      if (!oldRecord) {
        throw new Error('服务费记录不存在')
      }
      
      // 如果更新了日期，检查时间重叠
      if (data.start_date || data.end_date) {
        const startDate = data.start_date || oldRecord.start_date
        const endDate = data.end_date || oldRecord.end_date
        const overlap = await this.checkServiceFeeDateOverlap(oldRecord.customer_id, startDate, endDate, id)
        if (overlap) {
          throw new Error(`时间重叠：该客户在 ${overlap.start_date} 到 ${overlap.end_date} 期间已有服务费记录`)
        }
      }
      
      const fields: string[] = []
      const values: any[] = []
      
      if (data.start_date !== undefined) {
        fields.push('start_date = ?')
        values.push(data.start_date)
      }
      if (data.end_date !== undefined) {
        fields.push('end_date = ?')
        values.push(data.end_date)
      }
      if (data.payment_date !== undefined) {
        fields.push('payment_date = ?')
        values.push(data.payment_date)
      }
      if (data.is_paid !== undefined) {
        fields.push('is_paid = ?')
        values.push(data.is_paid)
      }
      if (data.notes !== undefined) {
        fields.push('notes = ?')
        values.push(data.notes)
      }
      if (data.amount !== undefined) {
        fields.push('amount = ?')
        values.push(data.amount)
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
        `UPDATE service_fee_records SET ${fields.join(', ')} WHERE id = ?`,
        values
      )
      
      if (affectedRows === 0) {
        throw new Error('服务费记录不存在')
      }
      
      const updatedRecord = await databaseService.queryOne<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE id = ?',
        [id]
      )
      
      if (!updatedRecord) {
        throw new Error('更新服务费记录失败')
      }
      
      // 记录操作日志（异步）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'update_service_fee',
        table_name: 'service_fee_records',
        record_id: id,
        old_values: { 
          start_date: oldRecord.start_date, 
          end_date: oldRecord.end_date,
          is_paid: oldRecord.is_paid
        },
        new_values: { 
          start_date: updatedRecord.start_date, 
          end_date: updatedRecord.end_date,
          is_paid: updatedRecord.is_paid
        },
        description: `更新服务费记录: ID ${id}`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return updatedRecord
    } catch (error) {
      console.error('更新服务费记录失败:', error)
      throw error
    }
  }

  /**
   * 删除服务费记录
   */
  async deleteServiceFeeRecord(id: number, userId?: number): Promise<void> {
    try {
      await this.ensureServiceFeeTableExists()
      
      // 获取记录信息用于日志
      const record = await databaseService.queryOne<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE id = ?',
        [id]
      )
      
      if (!record) {
        throw new Error('服务费记录不存在')
      }
      
      const affectedRows = await databaseService.update(
        'DELETE FROM service_fee_records WHERE id = ?',
        [id]
      )
      
      if (affectedRows === 0) {
        throw new Error('服务费记录不存在')
      }
      
      // 记录操作日志（异步）
      SystemLogService.createLog({
        user_id: userId,
        operation_type: 'delete_service_fee',
        table_name: 'service_fee_records',
        record_id: id,
        old_values: { 
          customer_id: record.customer_id,
          start_date: record.start_date,
          end_date: record.end_date
        },
        description: `删除服务费记录: 客户ID ${record.customer_id}, ${record.start_date} 至 ${record.end_date}`
      }).catch(err => console.error('记录操作日志失败:', err))
    } catch (error) {
      console.error('删除服务费记录失败:', error)
      throw error
    }
  }

  /**
   * 获取客户的服务费到期状态
   * @returns '已到期' 或 '未到期'
   */
  async getServiceFeeStatus(customerId: number): Promise<string> {
    try {
      await this.ensureServiceFeeTableExists()
      
      const now = new Date().toISOString().split('T')[0]  // YYYY-MM-DD
      
      // 查找当前有效的服务费记录
      const currentRecord = await databaseService.queryOne<ServiceFeeRecord>(
        'SELECT * FROM service_fee_records WHERE customer_id = ? AND start_date <= ? AND end_date >= ? ORDER BY end_date DESC LIMIT 1',
        [customerId, now, now]
      )
      
      if (currentRecord) {
        return '未到期'
      } else {
        return '已到期'
      }
    } catch (error) {
      console.error('获取服务费状态失败:', error)
      return '已到期'  // 默认返回已到期
    }
  }
}

export default new CustomerService()

