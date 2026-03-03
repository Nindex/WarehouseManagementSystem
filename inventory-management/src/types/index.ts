/**
 * 仓库管理系统类型定义文件
 * 包含系统中所有核心数据模型的TypeScript接口定义
 * 用于类型检查和代码提示，提高代码质量和可维护性
 */

/**
 * 用户类型接口
 * 定义系统用户的基本信息和状态
 */
export interface User {
  /** 用户唯一标识符 */
  id: number
  /** 用户名，登录凭证 */
  username: string
  /** 密码哈希值，存储在数据库中 */
  password_hash: string
  /** 密码明文，仅用于登录和修改密码时的临时存储 */
  password?: string
  /** 用户真实姓名 */
  name: string
  /** 用户邮箱地址 */
  email?: string
  /** 用户电话号码 */
  phone?: string
  /** 用户状态，可为字符串或数字 */
  status?: string | number
  /** 用户是否激活 */
  is_active: boolean
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 最后更新时间，ISO 8601格式 */
  updated_at: string
}

/**
 * 商品类型接口
 * 定义仓库中商品的详细信息和属性
 */
export interface Product {
  /** 商品主键ID */
  id: number
  /** 商品SKU编码，唯一标识 */
  sku: string
  /** 商品名称 */
  name: string
  /** 商品分类（兼容旧字段） */
  category?: string
  /** 分类ID */
  category_id?: number
  /** 分类名称（冗余字段，便于查询） */
  category_name?: string
  /** 计量单位，如：件、箱、kg */
  unit: string
  /** 采购单价（参考价） */
  price?: number
  /** 成本价 */
  cost_price?: number
  /** 销售价 */
  selling_price?: number
  /** 最小库存阈值，低于此值触发低库存预警 */
  min_stock: number
  /** 最大库存阈值，高于此值触发超储预警 */
  max_stock: number
  /** 当前库存数量（实时库存） */
  stock_quantity?: number
  /** 商品描述 */
  description?: string
  /** 商品状态：1启用/0停用，或字符串状态 */
  status?: number | string
  /** 商品所在库位 */
  location?: string
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 最后更新时间，ISO 8601格式 */
  updated_at: string
}

/**
 * 分类类型接口
 * 定义商品分类的结构和属性
 */
export interface Category {
  /** 分类唯一标识符 */
  id: number
  /** 分类名称 */
  name: string
  /** 分类描述 */
  description?: string
  /** 父分类ID，用于实现分类层级结构 */
  parent_id?: number
  /** 分类状态，1启用/0停用 */
  status: number
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 最后更新时间，ISO 8601格式 */
  updated_at: string
}

/**
 * 库存类型接口
 * 定义商品当前库存状态的详细信息
 */
export interface InventoryCurrent {
  /** 库存记录ID */
  id: number
  /** 商品ID */
  product_id: number
  /** 当前总库存数量 */
  current_stock: number
  /** 可用库存数量（总库存 - 锁定库存） */
  available_stock: number
  /** 锁定库存数量（如已下单但未出库的数量） */
  locked_stock: number
  /** 最后更新时间，ISO 8601格式 */
  last_updated: string
  /** 关联的商品信息，用于查询时的关联数据 */
  product?: Product
}

/**
 * 库存日志类型接口
 * 记录库存变动的详细历史记录
 */
export interface InventoryLog {
  /** 日志记录ID */
  id: number
  /** 商品ID */
  product_id: number
  /** 操作用户ID */
  user_id: number
  /** 操作类型：入库、出库、盘点、调整 */
  operation_type: 'inbound' | 'outbound' | 'check' | 'adjust'
  /** 变动数量 */
  quantity: number
  /** 操作前库存数量 */
  before_stock: number
  /** 操作后库存数量 */
  after_stock: number
  /** 批次号，用于追踪商品批次 */
  batch_number?: string
  /** 参考编号，如采购订单号、销售订单号等 */
  reference_number?: string
  /** 备注信息 */
  notes?: string
  /** 操作时间，ISO 8601格式 */
  created_at: string
  /** 关联的用户信息，用于查询时的关联数据 */
  user?: User
  /** 关联的商品信息，用于查询时的关联数据 */
  product?: Product
}

/**
 * 供应商类型接口
 * 定义供应商的详细信息和联系方式
 */
export interface Supplier {
  /** 供应商ID */
  id: number
  /** 供应商编码，用于系统内部标识 */
  code?: string
  /** 供应商名称 */
  name: string
  /** 联系人姓名 */
  contact_person?: string
  /** 联系电话 */
  phone?: string
  /** 电子邮箱 */
  email?: string
  /** 地址 */
  address?: string
  /** 付款条款，如账期等 */
  payment_terms?: string
  /** 供应商评分，用于评估供应商质量 */
  rating?: number
  /** 供应商状态，1启用/0停用 */
  status?: number | string
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 最后更新时间，ISO 8601格式 */
  updated_at: string
}

/**
 * 采购订单类型接口
 * 定义采购订单的详细信息和状态
 */
export interface ProcurementOrder {
  /** 订单ID */
  id: number
  /** 订单编号，系统生成的唯一标识 */
  order_number: string
  /** 供应商ID */
  supplier_id: number
  /** 创建人ID */
  created_by: number
  /** 订单状态：待处理、已批准、已收货、已取消 */
  status: 'pending' | 'approved' | 'received' | 'cancelled'
  /** 订单总金额 */
  total_amount: number
  /** 审批状态：待审批、已批准、已拒绝 */
  approval_status?: 'pending' | 'approved' | 'rejected'
  /** 预计到货日期 */
  expected_date?: string
  /** 订单备注 */
  notes?: string
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 最后更新时间，ISO 8601格式 */
  updated_at: string
  /** 供应商名称（冗余字段，便于查询） */
  supplier_name?: string
  /** 关联的供应商信息，用于查询时的关联数据 */
  supplier?: Supplier
  /** 关联的创建人信息，用于查询时的关联数据 */
  creator?: User
  /** 订单明细项，包含采购的商品列表 */
  items?: ProcurementItem[]
}

/**
 * 采购订单明细类型接口
 * 定义采购订单中单个商品的采购信息
 */
export interface ProcurementItem {
  /** 明细项ID */
  id: number
  /** 所属订单ID */
  order_id: number
  /** 商品ID */
  product_id: number
  /** 采购数量 */
  quantity: number
  /** 单价 */
  unit_price: number
  /** 小计金额（单价 × 数量） */
  subtotal?: number
  /** 总金额（与subtotal相同，兼容字段） */
  total_price?: number
  /** 已收货数量 */
  received_quantity?: number
  /** 备注信息 */
  notes?: string
  /** 关联的商品信息，用于查询时的关联数据 */
  product?: Product
}

/**
 * 采购退货类型接口
 * 定义采购退货的详细信息和状态
 */
export interface ProcurementReturn {
  /** 退货单ID */
  id: number
  /** 关联的采购订单ID */
  order_id: number
  /** 退货单编号，系统生成的唯一标识 */
  return_number: string
  /** 退货商品ID */
  product_id: number
  /** 退货数量 */
  quantity: number
  /** 退货原因 */
  reason?: string
  /** 退货状态：待处理、已批准、已完成、已拒绝 */
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  /** 创建时间，ISO 8601格式 */
  created_at: string
  /** 关联的采购订单信息，用于查询时的关联数据 */
  order?: ProcurementOrder
  /** 关联的商品信息，用于查询时的关联数据 */
  product?: Product
}

/**
 * 系统日志类型接口
 * 记录系统操作的历史记录，用于审计和追踪
 */
export interface SystemLog {
  /** 日志ID */
  id: number
  /** 操作用户ID */
  user_id?: number
  /** 操作类型，如新增、修改、删除等 */
  operation_type: string
  /** 操作的表名 */
  table_name?: string
  /** 操作的记录ID */
  record_id?: number
  /** 操作前的值，JSON字符串格式 */
  old_values?: string
  /** 操作后的值，JSON字符串格式 */
  new_values?: string
  /** 操作用户的IP地址 */
  ip_address?: string
  /** 操作时间，ISO 8601格式 */
  created_at: string
  /** 关联的用户信息，用于查询时的关联数据 */
  user?: User
}

/**
 * 库存预警类型接口
 * 定义库存异常情况的预警信息
 */
export interface StockAlert {
  /** 预警ID */
  id?: number
  /** 商品ID */
  product_id?: number
  /** 预警类型（兼容旧字段） */
  type?: 'low' | 'high' | 'low_stock' | 'out_of_stock'
  /** 预警类型：低库存、缺货、超储 */
  alert_type?: 'low_stock' | 'out_of_stock' | 'over_stock'
  /** 关联的商品信息，用于查询时的关联数据 */
  product?: Product
  /** 当前库存数量 */
  current_stock?: number
  /** 最小库存阈值 */
  min_stock?: number
  /** 最大库存阈值 */
  max_stock?: number
  /** 预警阈值 */
  threshold?: number
  /** 商品名称（冗余字段，便于查询） */
  product_name?: string
  /** 商品SKU编码（冗余字段，便于查询） */
  product_sku?: string
  /** 预警生成时间，ISO 8601格式 */
  created_at?: string
}

/**
 * KPI数据类型接口
 * 定义库存管理关键绩效指标的数据结构
 */
export interface KPIData {
  /** 商品总数 */
  totalProducts: number
  /** 库存总价值 */
  totalInventoryValue: number
  /** 低库存商品数量 */
  lowStockItems: number
  /** 待处理订单数量 */
  pendingOrders: number
  /** 库存周转率 */
  inventoryTurnover: number
  /** 缺货率 */
  stockoutRate: number
}

/**
 * 分页响应类型接口
 * 定义API返回分页数据的标准结构
 * @template T 数据项的类型
 */
export interface PaginatedResponse<T> {
  /** 数据列表 */
  data: T[]
  /** 总数据量 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页数据量 */
  pageSize: number
  /** 总页数 */
  totalPages: number
}

/**
 * API响应类型接口
 * 定义API返回数据的标准结构
 * @template T 响应数据的类型
 */
export interface ApiResponse<T> {
  /** 操作是否成功 */
  success: boolean
  /** 响应数据 */
  data?: T
  /** 响应消息 */
  message?: string
  /** 错误信息 */
  error?: string
}

/**
 * 登录表单类型接口
 * 定义用户登录时提交的数据结构
 */
export interface LoginForm {
  /** 用户名 */
  username: string
  /** 密码 */
  password: string
  /** 是否记住登录状态 */
  remember: boolean
}

/**
 * 用户状态类型接口
 * 定义认证状态的Redux状态结构
 */
export interface AuthState {
  /** 是否已认证 */
  isAuthenticated: boolean
  /** 当前用户信息 */
  user: User | null
  /** 认证令牌 */
  token: string | null
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | null
}

/**
 * 兼容旧命名
 * 保持与旧代码的兼容性
 */
export type PurchaseOrder = ProcurementOrder
export type PurchaseReturn = ProcurementReturn

/**
 * 库存交易记录接口
 * 记录库存变动的交易明细
 */
export interface InventoryTransaction {
  /** 交易记录ID */
  id: number
  /** 商品ID */
  product_id: number
  /** 交易类型：入库、出库、调整 */
  type: 'in' | 'out' | 'adjust'
  /** 交易数量 */
  quantity: number
  /** 交易前库存数量 */
  before_stock?: number
  /** 交易后库存数量 */
  after_stock?: number
  /** 旧库存数量（兼容字段） */
  old_quantity?: number
  /** 新库存数量（兼容字段） */
  new_quantity?: number
  /** 库位信息 */
  location?: string
  /** 批次号 */
  batch_number?: string
  /** 备注信息 */
  notes?: string
  /** 操作用户ID */
  user_id?: number
  /** 交易时间，ISO 8601格式 */
  created_at: string
}
