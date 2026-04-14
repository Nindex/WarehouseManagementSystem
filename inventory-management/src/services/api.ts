import { 
  UserService, 
  ProductService, 
  InventoryService, 
  CustomerService,
  SystemSettingService
} from './database'
import databaseService from '@/database/DatabaseService'
import { User } from '@/types'

// API响应类型
export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// 分页响应类型
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 认证相关API
export const authAPI = {
  login: async (username: string, password: string): Promise<ApiResponse<User>> => {
    try {
      const user = await UserService.authenticate(username, password)
      if (user) {
        return { success: true, data: user }
      } else {
        return { success: false, error: '用户名或密码错误' }
      }
    } catch (error) {
      console.error('登录失败:', error)
      return { success: false, error: '登录失败，请重试' }
    }
  },

  getStores: async (page = 1, pageSize = 20, search = '', customerId?: number) => {
    try {
      const result = await CustomerService.getAllStores(page, pageSize, search, customerId)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error: any) {
      console.error('获取门店列表失败:', error)
      return { success: false, error: error?.message || '获取门店列表失败' }
    }
  },

  register: async (payload: { username: string; password: string; name: string; email?: string; phone?: string }): Promise<ApiResponse<User>> => {
    try {
      const user = await UserService.createUser({
        username: payload.username,
        password: payload.password,
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
      })
      return { success: true, data: user }
    } catch (error: any) {
      console.error('注册失败:', error)
      // 传递原始错误消息，以便前端显示更详细的错误信息（如"用户名已存在"）
      const errorMessage = error?.message || '注册失败，请重试'
      return { success: false, error: errorMessage }
    }
  },

  getCurrentUser: async (): Promise<ApiResponse<User | null>> => {
    try {
      // 这里应该从本地存储获取当前用户信息
      // 暂时返回null，实际应用中需要实现用户会话管理
      return { success: true, data: null }
    } catch (error) {
      console.error('获取当前用户失败:', error)
      return { success: false, error: '获取用户信息失败' }
    }
  }
}

// 用户管理相关API
export const userAPI = {
  getAllUsers: async (page = 1, pageSize = 20): Promise<ApiResponse<PaginatedResponse<User>>> => {
    try {
      const result = await UserService.getAllUsers(page, pageSize)
      return {
        success: true,
        data: {
          data: result.data,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: Math.ceil(result.total / result.pageSize)
        }
      }
    } catch (error: any) {
      console.error('获取用户列表失败:', error)
      return { success: false, error: error?.message || '获取用户列表失败' }
    }
  },

  updateUser: async (id: number, userData: { name?: string; email?: string; phone?: string }): Promise<ApiResponse<User>> => {
    try {
      const user = await UserService.updateUser(id, userData)
      return { success: true, data: user }
    } catch (error: any) {
      console.error('更新用户失败:', error)
      return { success: false, error: error?.message || '更新用户失败' }
    }
  },

  changePassword: async (id: number, currentPassword: string, newPassword: string): Promise<ApiResponse<void>> => {
    try {
      // 先验证当前密码
      const user = await UserService.getUserById(id)
      if (!user) {
        return { success: false, error: '用户不存在' }
      }
      
      // 验证当前密码（需要从数据库获取用户密码进行验证）
      const authUser = await UserService.authenticate(user.username, currentPassword)
      if (!authUser) {
        return { success: false, error: '当前密码不正确' }
      }
      
      // 修改密码
      await UserService.changePassword(id, newPassword)
      return { success: true, message: '密码修改成功' }
    } catch (error: any) {
      console.error('修改密码失败:', error)
      return { success: false, error: error?.message || '修改密码失败' }
    }
  }
}

// 产品相关API
export const productAPI = {
  getProducts: async (page = 1, pageSize = 20, search = '', categoryId?: number) => {
    try {
      const result = await ProductService.getAllProducts(page, pageSize, search, categoryId)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error) {
      console.error('获取产品列表失败:', error)
      return { success: false, error: '获取产品列表失败' }
    }
  },

  getProduct: async (id: number) => {
    try {
      const product = await ProductService.getProductById(id)
      if (product) {
        return { success: true, data: product }
      } else {
        return { success: false, error: '产品不存在' }
      }
    } catch (error) {
      console.error('获取产品详情失败:', error)
      return { success: false, error: '获取产品详情失败' }
    }
  },

  getProductsByIds: async (ids: number[]) => {
    try {
      const products = await ProductService.getProductsByIds(ids)
      return { success: true, data: products }
    } catch (error) {
      console.error('批量获取产品失败:', error)
      return { success: false, error: '批量获取产品失败' }
    }
  },

  getProductBySku: async (sku: string) => {
    try {
      const product = await ProductService.getProductBySku(sku)
      if (product) {
        return { success: true, data: product }
      } else {
        return { success: false, error: '产品不存在' }
      }
    } catch (error) {
      console.error('获取产品失败:', error)
      return { success: false, error: '获取产品失败' }
    }
  },

  createProduct: async (productData: any, userId?: number) => {
    try {
      const product = await ProductService.createProduct(productData, userId)
      return { success: true, data: product }
    } catch (error: any) {
      console.error('创建产品失败:', error)
      const errorMessage = error?.message || '创建产品失败'
      return { success: false, error: errorMessage }
    }
  },

  updateProduct: async (id: number, productData: any, userId?: number) => {
    try {
      const product = await ProductService.updateProduct(id, productData, userId)
      return { success: true, data: product }
    } catch (error) {
      console.error('更新产品失败:', error)
      return { success: false, error: '更新产品失败' }
    }
  },

  deleteProduct: async (id: number, userId?: number) => {
    try {
      await ProductService.deleteProduct(id, userId)
      return { success: true, message: '产品删除成功' }
    } catch (error: any) {
      return { success: false, error: error?.message || '删除产品失败' }
    }
  },

  // 获取所有商品（包括停用的）
  getProductsIncludeDisabled: async (page = 1, pageSize = 20, search = '', categoryId?: number) => {
    try {
      const result = await ProductService.getAllProductsIncludeDisabled(page, pageSize, search, categoryId)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error) {
      console.error('获取产品列表失败:', error)
      return { success: false, error: '获取产品列表失败' }
    }
  },

  // 切换商品启用/停用状态
  toggleProductStatus: async (id: number, userId?: number) => {
    try {
      const product = await ProductService.toggleProductStatus(id, userId)
      return { success: true, data: product }
    } catch (error: any) {
      console.error('切换商品状态失败:', error)
      return { success: false, error: error?.message || '切换商品状态失败' }
    }
  },


  getCategories: async () => {
    try {
      const categories = await ProductService.getAllCategories()
      return { success: true, data: categories }
    } catch (error) {
      console.error('获取分类列表失败:', error)
      return { success: false, error: '获取分类列表失败' }
    }
  },

  createCategory: async (categoryData: { name: string; description?: string }) => {
    try {
      const category = await ProductService.createCategory(categoryData)
      return { success: true, data: category }
    } catch (error: any) {
      console.error('创建分类失败:', error)
      return { success: false, error: error?.message || '创建分类失败' }
    }
  },

  updateCategory: async (id: number, categoryData: { name?: string; description?: string }) => {
    try {
      const category = await ProductService.updateCategory(id, categoryData)
      return { success: true, data: category }
    } catch (error: any) {
      console.error('更新分类失败:', error)
      return { success: false, error: error?.message || '更新分类失败' }
    }
  },

  deleteCategory: async (id: number) => {
    try {
      await ProductService.deleteCategory(id)
      return { success: true, message: '删除分类成功' }
    } catch (error: any) {
      console.error('删除分类失败:', error)
      return { success: false, error: error?.message || '删除分类失败' }
    }
  },

  getStockAlerts: async () => {
    try {
      const alerts = await ProductService.getStockAlerts()
      return { success: true, data: alerts }
    } catch (error) {
      console.error('获取库存预警失败:', error)
      return { success: false, error: '获取库存预警失败' }
    }
  }
}

// 库存相关API
// 注意：这里有两个 getInventoryReport，一个在 inventoryAPI，一个在 reportAPI
export const inventoryAPI = {
  adjustStock: async (data: any) => {
    try {
      await InventoryService.adjustStock(data)
      return { success: true, message: '库存调整成功' }
    } catch (error: any) {
      console.error('调整库存失败:', error)
      // 传递原始错误消息，以便前端显示更详细的错误信息
      const errorMessage = error?.message || '调整库存失败'
      return { success: false, error: errorMessage }
    }
  },

  batchInbound: async (
    items: Array<{ product_id: number; serial_numbers: string[] }>,
    commonData: { location?: string; batch_number?: string; notes?: string; created_by?: number }
  ) => {
    try {
      const result = await InventoryService.batchInbound(items, commonData)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('批量入库失败:', error)
      return { success: false, error: error?.message || '批量入库失败' }
    }
  },

  getTransactions: async (page = 1, pageSize = 20, filters: any = {}) => {
    try {
      const result = await InventoryService.getInventoryTransactions(
        page, 
        pageSize, 
        filters.productId, 
        filters.type, 
        filters.startDate, 
        filters.endDate
      )
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error) {
      console.error('获取库存交易记录失败:', error)
      return { success: false, error: '获取库存交易记录失败' }
    }
  },

  getCurrentInventory: async (productId?: number) => {
    try {
      const inventory = await InventoryService.getCurrentInventory(productId)
      return { success: true, data: inventory }
    } catch (error) {
      console.error('获取当前库存失败:', error)
      return { success: false, error: '获取当前库存失败' }
    }
  },

  getInventoryReport: async (categoryId?: number) => {
    try {
      const report = await InventoryService.getInventoryReport(categoryId)
      return { success: true, data: report }
    } catch (error) {
      console.error('获取库存报表失败:', error)
      return { success: false, error: '获取库存报表失败' }
    }
  },

  getStockAlerts: async () => {
    try {
      const alerts = await InventoryService.getStockAlerts()
      return { success: true, data: alerts }
    } catch (error) {
      console.error('获取库存预警失败:', error)
      return { success: false, error: '获取库存预警失败' }
    }
  },

  getExpiringProducts: async (daysAhead = 30) => {
    try {
      const products = await InventoryService.getExpiringProducts(daysAhead)
      return { success: true, data: products }
    } catch (error) {
      console.error('获取即将过期商品失败:', error)
      return { success: false, error: '获取即将过期商品失败' }
    }
  },

  getInventoryValue: async () => {
    try {
      const value = await InventoryService.getInventoryValue()
      return { success: true, data: value }
    } catch (error) {
      console.error('获取库存总值失败:', error)
      return { success: false, error: '获取库存总值失败' }
    }
  },

  getOutboundRecords: async (page = 1, pageSize = 20, filters?: any) => {
    try {
      const result = await InventoryService.getOutboundRecords(page, pageSize, filters)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error) {
      console.error('获取出库记录失败:', error)
      return { success: false, error: '获取出库记录失败' }
    }
  },

  getOutboundRecordsTotalAmount: async (filters?: any) => {
    try {
      const totalAmount = await InventoryService.getOutboundRecordsTotalAmount(filters)
      return { success: true, data: totalAmount }
    } catch (error) {
      console.error('获取出库记录总金额失败:', error)
      return { success: false, error: '获取出库记录总金额失败' }
    }
  },

  getProductBatches: async (productId: number) => {
    try {
      const batches = await InventoryService.getProductBatches(productId)
      return { success: true, data: batches }
    } catch (error) {
      console.error('获取商品批次列表失败:', error)
      return { success: false, error: '获取商品批次列表失败' }
    }
  },

  getCustomerBatchNumbers: async (customerId: number) => {
    try {
      const batches = await InventoryService.getCustomerBatchNumbers(customerId)
      return { success: true, data: batches }
    } catch (error) {
      console.error('获取客户批次号列表失败:', error)
      return { success: false, error: '获取客户批次号列表失败' }
    }
  },

  getProductByBatchNumber: async (batchNumber: string, customerId?: number) => {
    try {
      const product = await InventoryService.getProductByBatchNumber(batchNumber, customerId)
      if (product) {
        return { success: true, data: product }
      } else {
        return { success: false, error: '未找到该批次号的商品' }
      }
    } catch (error) {
      console.error('根据批次号获取商品信息失败:', error)
      return { success: false, error: '获取商品信息失败' }
    }
  },

  getBatchBySerialNumber: async (serialNumber: string, productId?: number) => {
    try {
      const batch = await InventoryService.getBatchBySerialNumber(serialNumber, productId)
      if (batch) {
        return { success: true, data: batch }
      } else {
        return { success: false, error: '未找到该SN码对应的批次' }
      }
    } catch (error: any) {
      console.error('根据SN码获取批次信息失败:', error)
      return { success: false, error: error?.message || '获取批次信息失败' }
    }
  },

  getOutboundSNItems: async (outboundId: number) => {
    try {
      const items = await InventoryService.getOutboundSNItems(outboundId)
      return { success: true, data: items }
    } catch (error: any) {
      console.error('获取出库SN明细失败:', error)
      return { success: false, error: error?.message || '获取出库SN明细失败' }
    }
  },

  getAllBatchesWithSerialNumbers: async (page = 1, pageSize = 20, productId?: number, batchNumber?: string) => {
    try {
      const result = await InventoryService.getAllBatchesWithSerialNumbers(page, pageSize, productId, batchNumber)
      return { success: true, data: result }
    } catch (error) {
      console.error('获取批次信息失败:', error)
      return { success: false, error: '获取批次信息失败' }
    }
  },

  getAllBatchesGrouped: async (page = 1, pageSize = 20, productId?: number, batchNumber?: string) => {
    try {
      const result = await InventoryService.getAllBatchesGrouped(page, pageSize, productId, batchNumber)
      return { success: true, data: result }
    } catch (error) {
      console.error('获取批次信息失败:', error)
      return { success: false, error: '获取批次信息失败' }
    }
  },

  updateBatchLocation: async (productId: number, batchNumber: string, location: string) => {
    try {
      await InventoryService.updateBatchLocation(productId, batchNumber, location)
      return { success: true, message: '存放位置更新成功' }
    } catch (error: any) {
      return { success: false, error: error?.message || '更新存放位置失败' }
    }
  },

  generateBatchNumber: async () => {
    try {
      const batchNumber = await InventoryService.generateBatchNumber()
      return { success: true, data: batchNumber }
    } catch (error: any) {
      console.error('生成批次号失败:', error)
      return { success: false, error: error?.message || '生成批次号失败' }
    }
  },

  validateSerialNumber: async (serialNumber: string, productId: number) => {
    try {
      const result = await InventoryService.validateSerialNumber(serialNumber, productId)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('验证SN码失败:', error)
      return { success: false, error: error?.message || '验证SN码失败' }
    }
  },

  validateSerialNumbers: async (serialNumbers: string[], productId: number) => {
    try {
      const result = await InventoryService.validateSerialNumbers(serialNumbers, productId)
      // 将 Map 转换为对象以便 JSON 序列化
      const resultObj: Record<string, { exists: boolean; isOutbound: boolean; batchNumber?: string }> = {}
      result.forEach((value, key) => {
        resultObj[key] = value
      })
      return { success: true, data: resultObj }
    } catch (error: any) {
      console.error('批量验证SN码失败:', error)
      return { success: false, error: error?.message || '批量验证SN码失败' }
    }
  },

  getSNTraceRecord: async (serialNumber: string, productId: number) => {
    try {
      const result = await InventoryService.getSNTraceRecord(serialNumber, productId)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('获取SN码溯源记录失败:', error)
      return { success: false, error: error?.message || '获取SN码溯源记录失败' }
    }
  },

  deleteSerialNumber: async (serialNumber: string, productId: number, userId?: number) => {
    try {
      await InventoryService.deleteSerialNumber(serialNumber, productId, userId)
      return { success: true }
    } catch (error: any) {
      console.error('删除SN码失败:', error)
      return { success: false, error: error?.message || '删除SN码失败' }
    }
  },

  performInventoryCheck: async (
    productId: number,
    serialNumbers: string[],
    batchNumber?: string,
    location?: string,
    notes?: string,
    userId?: number
  ) => {
    try {
      await InventoryService.performInventoryCheck(
        productId,
        serialNumbers,
        batchNumber,
        location,
        notes,
        userId
      )
      return { success: true, message: '盘点完成' }
    } catch (error: any) {
      console.error('执行库存盘点失败:', error)
      return { success: false, error: error?.message || '执行库存盘点失败' }
    }
  }
}

// 报表相关API
export const reportAPI = {
  getInventoryReport: async (categoryId?: number, startDate?: string, endDate?: string) => {
    try {
      const report = await InventoryService.getInventoryReport(categoryId, startDate, endDate)
      return { success: true, data: report }
    } catch (error) {
      console.error('获取库存报表失败:', error)
      return { success: false, error: '获取库存报表失败' }
    }
  },



  getStockAlerts: async () => {
    try {
      const alerts = await InventoryService.getStockAlerts()
      return { success: true, data: alerts }
    } catch (error) {
      console.error('获取库存预警失败:', error)
      return { success: false, error: '获取库存预警失败' }
    }
  },

  getExpiringProducts: async (daysAhead = 30) => {
    try {
      const products = await InventoryService.getExpiringProducts(daysAhead)
      return { success: true, data: products }
    } catch (error) {
      console.error('获取即将过期商品失败:', error)
      return { success: false, error: '获取即将过期商品失败' }
    }
  },

  getOutboundReport: async (startDate?: string, endDate?: string, customerId?: number) => {
    try {
      const report = await InventoryService.getOutboundReport(startDate, endDate, customerId)
      return { success: true, data: report }
    } catch (error) {
      console.error('获取出入库报表失败:', error)
      return { success: false, error: '获取出入库报表失败' }
    }
  },

  getInboundOutboundReport: async (startDate?: string, endDate?: string, productId?: number) => {
    try {
      const report = await InventoryService.getInboundOutboundReport(startDate, endDate, productId)
      return { success: true, data: report }
    } catch (error) {
      console.error('获取出入库报表失败:', error)
      return { success: false, error: '获取出入库报表失败' }
    }
  }
}

// 操作日志相关API
import SystemLogService from './database/SystemLogService'

export const systemLogAPI = {
  getLogs: async (page = 1, pageSize = 20, filters?: any): Promise<ApiResponse<any>> => {
    try {
      const result = await SystemLogService.getLogs(page, pageSize, filters)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('获取操作日志失败:', error)
      // 如果是表不存在的错误，尝试再次创建表并返回空结果
      if (error?.message?.includes('no such table: system_logs')) {
        try {
          await SystemLogService.ensureTableExists()
          // 返回空结果而不是错误
          return { 
            success: true, 
            data: { 
              data: [], 
              total: 0, 
              page, 
              pageSize 
            } 
          }
        } catch (createError) {
          console.error('重试创建表失败:', createError)
        }
      }
      return { success: false, error: error?.message || '获取操作日志失败' }
    }
  },

  getRecentLogs: async (limit = 10, userId?: number): Promise<ApiResponse<any>> => {
    try {
      const logs = await SystemLogService.getRecentLogs(limit, userId)
      return { success: true, data: logs }
    } catch (error: any) {
      console.error('获取最近操作日志失败:', error)
      // 如果是表不存在的错误，尝试再次创建表并返回空数组
      if (error?.message?.includes('no such table: system_logs')) {
        try {
          await SystemLogService.ensureTableExists()
          // 返回空数组而不是错误
          return { success: true, data: [] }
        } catch (createError) {
          console.error('重试创建表失败:', createError)
        }
      }
      return { success: false, error: error?.message || '获取最近操作日志失败' }
    }
  },

  createLog: async (logData: any): Promise<ApiResponse<any>> => {
    try {
      const log = await SystemLogService.createLog(logData)
      return { success: true, data: log }
    } catch (error) {
      console.error('创建操作日志失败:', error)
      return { success: false, error: '创建操作日志失败' }
    }
  }
}

// 客户相关API
export const customerAPI = {
  getCustomers: async (page = 1, pageSize = 20, search = '', includeDisabled = false) => {
    try {
      const result = await CustomerService.getAllCustomers(page, pageSize, search, includeDisabled)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error) {
      console.error('获取客户列表失败:', error)
      return { success: false, error: '获取客户列表失败' }
    }
  },

  getStores: async (page = 1, pageSize = 20, search = '', customerId?: number, includeDisabled = false, statusFilter?: number) => {
    try {
      const result = await CustomerService.getAllStores(page, pageSize, search, customerId, includeDisabled, statusFilter)
      return {
        success: true,
        data: {
          ...result,
          totalPages: Math.ceil(result.total / pageSize)
        }
      }
    } catch (error: any) {
      console.error('获取门店列表失败:', error)
      return { success: false, error: error?.message || '获取门店列表失败' }
    }
  },

  getCustomer: async (id: number) => {
    try {
      const customer = await CustomerService.getCustomerById(id)
      if (customer) {
        return { success: true, data: customer }
      } else {
        return { success: false, error: '客户不存在' }
      }
    } catch (error) {
      console.error('获取客户详情失败:', error)
      return { success: false, error: '获取客户详情失败' }
    }
  },

  createCustomer: async (customerData: any) => {
    try {
      const customer = await CustomerService.createCustomer(customerData)
      return { success: true, data: customer }
    } catch (error: any) {
      console.error('创建客户失败:', error)
      return { success: false, error: error?.message || '创建客户失败' }
    }
  },

  updateCustomer: async (id: number, data: any) => {
    try {
      const customer = await CustomerService.updateCustomer(id, data)
      return { success: true, data: customer }
    } catch (error: any) {
      console.error('更新客户失败:', error)
      return { success: false, error: error?.message || '更新客户失败' }
    }
  },

  deleteCustomer: async (id: number, userId?: number) => {
    try {
      await CustomerService.deleteCustomer(id, userId)
      return { success: true, message: '客户删除成功' }
    } catch (error: any) {
      console.error('删除客户失败:', error)
      return { success: false, error: error?.message || '删除客户失败' }
    }
  },

  getCustomerStores: async (customerId: number) => {
    try {
      const stores = await CustomerService.getCustomerStores(customerId)
      return { success: true, data: stores }
    } catch (error: any) {
      console.error('获取客户门店列表失败:', error)
      return { success: false, error: error?.message || '获取客户门店列表失败' }
    }
  },

  createOrGetStore: async (storeData: { customer_id: number; store_name: string; address?: string; contact_person?: string; phone?: string }) => {
    try {
      const store = await CustomerService.createOrGetStore(storeData)
      return { success: true, data: store }
    } catch (error: any) {
      console.error('创建或获取门店失败:', error)
      return { success: false, error: error?.message || '创建或获取门店失败' }
    }
  },

  createStore: async (storeData: { customer_id: number; store_name: string; address?: string; contact_person?: string; phone?: string }) => {
    try {
      const store = await CustomerService.createStore(storeData)
      return { success: true, data: store }
    } catch (error: any) {
      console.error('创建门店失败:', error)
      return { success: false, error: error?.message || '创建门店失败' }
    }
  },

  updateStore: async (id: number, data: any) => {
    try {
      const store = await CustomerService.updateStore(id, data)
      return { success: true, data: store }
    } catch (error: any) {
      console.error('更新门店失败:', error)
      return { success: false, error: error?.message || '更新门店失败' }
    }
  },

  deleteStore: async (id: number) => {
    try {
      await CustomerService.deleteStore(id)
      return { success: true, message: '门店删除成功' }
    } catch (error: any) {
      console.error('删除门店失败:', error)
      return { success: false, error: error?.message || '删除门店失败' }
    }
  }
}

// 数据库管理相关API
// 允许清除的表名白名单（防止 SQL 注入）
const ALLOWED_TABLES = [
  'outbound_sn_items',
  'outbound_records',
  'inventory_transactions',
  'inventory',
  'inventory_batches',
  'sn_status',
  'purchase_return_items',
  'purchase_returns',
  'purchase_order_items',
  'purchase_orders',
  'sales_order_items',
  'sales_orders',
  'suppliers',
  'customer_stores',
  'customers',
  'system_logs',
  'categories',
  'products'
]

// 验证表名是否在白名单中
function validateTableName(tableName: string): boolean {
  return ALLOWED_TABLES.includes(tableName)
}

export const databaseAPI = {
  clearAllData: async (tablesToClear?: string[]): Promise<ApiResponse<void>> => {
    try {
      // 禁用外键约束，避免外键约束导致的清除失败
      // 注意：不在这里使用 BEGIN TRANSACTION，因为可能已经在事务中
      await databaseService.exec('PRAGMA foreign_keys = OFF')

      // 如果没有指定要清除的表，则清除所有业务数据表
      const defaultTables = ALLOWED_TABLES

      const tables = tablesToClear && tablesToClear.length > 0 ? tablesToClear : defaultTables

      // 验证所有表名都在白名单中
      const invalidTables = tables.filter(t => !validateTableName(t))
      if (invalidTables.length > 0) {
        return { success: false, error: `无效的表名: ${invalidTables.join(', ')}` }
      }

      // 定义清除顺序：先清除有外键引用的表，再清除被引用的表
      // 注意：所有引用 products 的表必须在 products 之前清除
      const clearOrder = [
        'outbound_sn_items',      // 引用 products, outbound_records, inventory_batches
        'outbound_records',        // 引用 products, inventory_batches, customers
        'inventory_transactions',  // 引用 products
        'purchase_return_items',   // 引用 purchase_returns
        'purchase_returns',        // 引用 products, purchase_orders
        'purchase_order_items',    // 引用 products, purchase_orders
        'purchase_orders',         // 引用 suppliers
        'sales_order_items',       // 引用 products, sales_orders
        'sales_orders',            // 引用 customers
        'inventory',              // 引用 products
        'inventory_batches',      // 引用 products，必须在 outbound_records 之后清除
        'sn_status',              // 引用 products，必须在 products 之前清除
        'customer_stores',        // 引用 customers
        'customers',              // 被其他表引用
        'system_logs',            // 独立表
        'categories',             // 被 products 引用（但 products 的 category_id 可以为 NULL）
        'suppliers',              // 可能被其他表引用
        'products'               // 被多个表引用，必须最后清除
      ]

      // 按照清除顺序排列要清除的表
      const orderedTables: string[] = []
      const unorderedTables: string[] = []

      // 先添加有序的表
      for (const table of clearOrder) {
        if (tables.includes(table)) {
          orderedTables.push(table)
        }
      }

      // 再添加不在顺序列表中的表（可能是新增的表）
      for (const table of tables) {
        if (!clearOrder.includes(table)) {
          unorderedTables.push(table)
        }
      }

      // 合并有序和无序的表
      const finalTables = [...orderedTables, ...unorderedTables]

      // 如果清除 products 表，先清除所有相关的孤立批次数据和SN码状态
      if (finalTables.includes('products')) {
        try {
          // 清除那些商品已被删除的批次数据（孤立数据）
          if (!finalTables.includes('inventory_batches')) {
            await databaseService.exec(`
              DELETE FROM inventory_batches 
              WHERE product_id NOT IN (SELECT id FROM products)
            `)
            console.log('✓ 已清除孤立的批次数据（商品已被删除的批次）')
          }
          // 清除那些商品已被删除的SN码状态（孤立数据）
          if (!finalTables.includes('sn_status')) {
            await databaseService.exec(`
              DELETE FROM sn_status 
              WHERE product_id NOT IN (SELECT id FROM products)
            `)
            console.log('✓ 已清除孤立的SN码状态数据（商品已被删除的SN码）')
          }
        } catch (e) {
          console.warn('清除孤立数据失败（可能表不存在）:', (e as any)?.message || e)
        }
      }

      // 按顺序清除表
      const clearedTables: string[] = []
      const failedTables: string[] = []
      
      for (const table of finalTables) {
        try {
          // 先检查表是否存在（表名已通过白名单验证，安全）
          const tableExists = await databaseService.queryOne<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
            [table]
          )
          
          if (tableExists) {
            // 清除前检查记录数
            const countBefore = await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count FROM ${table}`
            )
            const recordCount = countBefore?.count || 0
            
            // 确保外键约束已禁用（在每个 DELETE 前重新设置，确保生效）
            await databaseService.exec('PRAGMA foreign_keys = OFF')
            
            await databaseService.exec(`DELETE FROM ${table}`)
            
            // 清除后验证记录数
            const countAfter = await databaseService.queryOne<{ count: number }>(
              `SELECT COUNT(*) as count FROM ${table}`
            )
            const remainingCount = countAfter?.count || 0
            
            if (remainingCount === 0) {
              clearedTables.push(table)
              console.log(`✓ 已清除表 ${table}（清除了 ${recordCount} 条记录）`)
            } else {
              console.warn(`⚠ 表 ${table} 清除后仍有 ${remainingCount} 条记录（清除前：${recordCount} 条）`)
              failedTables.push(table)
            }
          } else {
            console.warn(`表 ${table} 不存在，跳过清除`)
          }
        } catch (e) {
          const errorMsg = (e as any)?.message || String(e)
          console.error(`清除表 ${table} 失败：`, errorMsg)
          failedTables.push(table)
          // 如果清除失败，记录错误但不中断整个清除过程
        }
      }
      
      // 如果有表清除失败，记录警告但继续执行
      if (failedTables.length > 0) {
        console.warn(`以下表清除失败：${failedTables.join(', ')}`)
      }
      
      // 如果所有表都清除失败，返回错误
      if (clearedTables.length === 0 && finalTables.length > 0) {
        return { 
          success: false, 
          error: '没有成功清除任何表，请检查表名是否正确' 
        }
      }

      // 重置自增ID（如果存在）
      if (finalTables.length > 0) {
        try {
          // 使用参数化查询重置自增ID（表名已通过白名单验证）
          for (const table of finalTables) {
            try {
              await databaseService.update(
                `DELETE FROM sqlite_sequence WHERE name = ?`,
                [table]
              )
            } catch {
              // 忽略单个表的错误
            }
          }
        } catch {
          // 部分环境可能没有 sqlite_sequence，忽略
        }
      }

      // 重新启用外键约束
      await databaseService.exec('PRAGMA foreign_keys = ON')
      
      const successMessage = clearedTables.length > 0 
        ? `成功清除 ${clearedTables.length} 个表：${clearedTables.join(', ')}`
        : '数据清除完成'
      
      return { success: true, message: successMessage }
    } catch (error: any) {
      console.error('清除数据失败:', error)
      try {
        // 确保在出错时重新启用外键约束
        await databaseService.exec('PRAGMA foreign_keys = ON')
      } catch {}
      return { success: false, error: error?.message || '清除数据失败' }
    }
  },
  migrate: async (): Promise<ApiResponse<void>> => {
    try {
      const result = await window.electron.electronAPI.dbMigrate()
      if (result.success) {
        return { success: true, message: result.message || '数据库迁移成功' }
      } else {
        return { success: false, error: result.error || '数据库迁移失败' }
      }
    } catch (error: any) {
      console.error('数据库迁移失败:', error)
      return { success: false, error: error?.message || '数据库迁移失败' }
    }
  },
  backup: async (backupDir?: string): Promise<ApiResponse<{ path: string }>> => {
    try {
      const result = await window.electron.electronAPI.dbBackup(backupDir)
      if (result.success) {
        return { success: true, data: { path: result.path || '' }, message: result.message || '备份成功' }
      } else {
        return { success: false, error: result.error || '备份失败' }
      }
    } catch (error: any) {
      console.error('数据库备份失败:', error)
      return { success: false, error: error?.message || '备份失败' }
    }
  },
  backupTest: async (): Promise<ApiResponse<void>> => {
    try {
      const result = await window.electron.electronAPI.dbBackupTest()
      if (result.success) {
        return { success: true, message: result.message || '备份测试完成' }
      } else {
        return { success: false, error: result.error || '备份测试失败' }
      }
    } catch (error: any) {
      console.error('备份测试失败:', error)
      return { success: false, error: error?.message || '备份测试失败' }
    }
  },
  restore: async (backupPath: string): Promise<ApiResponse<void>> => {
    try {
      const result = await window.electron.electronAPI.dbRestore(backupPath)
      if (result.success) {
        return { success: true, message: result.message || '恢复成功' }
      } else {
        return { success: false, error: result.error || '恢复失败' }
      }
    } catch (error: any) {
      console.error('数据库恢复失败:', error)
      return { success: false, error: error?.message || '恢复失败' }
    }
  },
  repair: async (): Promise<ApiResponse<void>> => {
    try {
      const result = await window.electron.electronAPI.dbRepair()
      if (result.success) {
        return { success: true, message: result.message || '数据库修复成功' }
      } else {
        return { success: false, error: result.error || '数据库修复失败' }
      }
    } catch (error: any) {
      console.error('数据库修复失败:', error)
      return { success: false, error: error?.message || '数据库修复失败' }
    }
  },
  cleanupBackups: async (): Promise<ApiResponse<void>> => {
    try {
      const result = await window.electron.electronAPI.dbCleanupBackups()
      if (result.success) {
        return { success: true, message: result.message || '备份清理完成' }
      } else {
        return { success: false, error: result.error || '备份清理失败' }
      }
    } catch (error: any) {
      console.error('备份清理失败:', error)
      return { success: false, error: error?.message || '备份清理失败' }
    }
  }
}

// 维修记录相关API
import RepairService from './database/RepairService'
import type { RepairRecord } from './database/RepairService'

export const repairAPI = {
  getRepairsBySN: async (serialNumber: string) => {
    try {
      const data = await RepairService.getRepairsBySN(serialNumber)
      return { success: true, data }
    } catch (error: any) {
      console.error('获取维修记录失败:', error)
      return { success: false, error: error?.message || '获取维修记录失败' }
    }
  },

  createRepair: async (data: RepairRecord) => {
    try {
      const result = await RepairService.createRepair(data)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('创建维修记录失败:', error)
      return { success: false, error: error?.message || '创建维修记录失败' }
    }
  },

  deleteRepair: async (id: number) => {
    try {
      await RepairService.deleteRepair(id)
      return { success: true }
    } catch (error: any) {
      console.error('删除维修记录失败:', error)
      return { success: false, error: error?.message || '删除维修记录失败' }
    }
  }
}

// 系统设置相关API
export const systemSettingAPI = {
  getSettings: async (): Promise<ApiResponse<Record<string, string>>> => {
    try {
      const settings = await SystemSettingService.getSettings()
      return { success: true, data: settings }
    } catch (error: any) {
      console.error('获取系统设置失败:', error)
      return { success: false, error: error?.message || '获取系统设置失败' }
    }
  },

  getSetting: async (key: string, defaultValue: string = ''): Promise<ApiResponse<string>> => {
    try {
      const value = await SystemSettingService.getSetting(key, defaultValue)
      return { success: true, data: value }
    } catch (error: any) {
      console.error(`获取设置 ${key} 失败:`, error)
      return { success: false, error: error?.message || '获取设置失败' }
    }
  },

  setSettings: async (settings: Record<string, string>): Promise<ApiResponse<void>> => {
    try {
      await SystemSettingService.setSettings(settings)
      return { success: true, message: '系统设置保存成功' }
    } catch (error: any) {
      console.error('保存系统设置失败:', error)
      return { success: false, error: error?.message || '保存系统设置失败' }
    }
  }
}

// 导出所有API
export default {
  auth: authAPI,
  product: productAPI,
  inventory: inventoryAPI,
  report: reportAPI,
  systemLog: systemLogAPI,
  database: databaseAPI,
  user: userAPI,
  systemSetting: systemSettingAPI
}