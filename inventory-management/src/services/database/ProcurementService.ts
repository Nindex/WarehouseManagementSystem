import databaseService from '@/database/DatabaseService'
import SystemLogService from './SystemLogService'
import InventoryService from './InventoryService'

// 确保 purchase_order_items 表有 notes 字段
async function ensureNotesColumnExists(): Promise<void> {
  try {
    // 检查 notes 字段是否存在
    const tableInfo = await databaseService.query<{ name: string }>(
      `PRAGMA table_info(purchase_order_items)`
    )
    const hasNotesColumn = tableInfo.some(col => col.name === 'notes')

    if (!hasNotesColumn) {
      // 添加 notes 字段
      await databaseService.update(
        `ALTER TABLE purchase_order_items ADD COLUMN notes TEXT`,
        []
      )
      console.log('已为 purchase_order_items 表添加 notes 字段')
    }
  } catch (error) {
    console.warn('检查/添加 notes 字段时出现警告:', error)
    // 不抛出错误，允许继续执行
  }
}

export interface Supplier {
  id: number
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_number?: string
  bank_info?: string
  status: number
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: number
  order_number: string
  supplier_id: number
  supplier_name?: string
  status: 'pending' | 'approved' | 'received' | 'cancelled'
  total_amount: number
  order_date: string
  expected_date?: string
  actual_date?: string
  notes?: string
  created_by?: number
  approved_by?: number
  created_at: string
  updated_at: string
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: number
  order_id: number
  product_id: number
  product_name?: string
  product_sku?: string
  quantity: number
  unit_price: number
  total_price: number
  received_quantity: number
  notes?: string
  created_at: string
}

export interface PurchaseReturn {
  id: number
  return_number: string
  order_id: number
  product_id: number
  product_name?: string
  product_sku?: string
  quantity: number
  reason: string
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  created_by?: number
  approved_by?: number
  created_at: string
  updated_at: string
}

export interface CreateSupplierData {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  tax_number?: string
  bank_info?: string
}

export interface CreatePurchaseOrderData {
  supplier_id: number
  expected_date?: string
  notes?: string
  items: {
    product_id: number
    quantity: number
    unit_price: number
    notes?: string
  }[]
}

export interface CreatePurchaseReturnData {
  order_id: number
  product_id: number
  quantity: number
  reason: string
}

class ProcurementService {
  /**
   * 获取所有供应商
   */
  async getAllSuppliers(
    page = 1,
    pageSize = 20,
    search = ''
  ): Promise<{ data: Supplier[]; total: number; page: number; pageSize: number }> {
    try {
      let whereConditions = 'status = 1'
      const params: any[] = []

      if (search) {
        whereConditions += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)'
        const searchPattern = `%${search}%`
        params.push(searchPattern, searchPattern, searchPattern)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM suppliers WHERE ${whereConditions}`,
        params
      )

      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      const suppliers = await databaseService.query<Supplier>(
        `SELECT * FROM suppliers WHERE ${whereConditions} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      return {
        data: suppliers,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取供应商列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取供应商
   */
  async getSupplierById(id: number): Promise<Supplier | null> {
    try {
      const supplier = await databaseService.queryOne<Supplier>(
        'SELECT * FROM suppliers WHERE id = ? AND status = 1',
        [id]
      )

      return supplier
    } catch (error) {
      console.error('获取供应商信息失败:', error)
      throw error
    }
  }

  /**
   * 创建供应商
   */
  async createSupplier(supplierData: CreateSupplierData): Promise<Supplier> {
    try {
      const supplierId = await databaseService.insert(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          supplierData.name, supplierData.contact_person || null, supplierData.phone || null,
          supplierData.email || null, supplierData.address || null
        ]
      )

      const newSupplier = await this.getSupplierById(supplierId)
      if (!newSupplier) {
        throw new Error('创建供应商失败')
      }

      // 记录操作日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        operation_type: 'create_supplier',
        table_name: 'suppliers',
        record_id: supplierId,
        new_values: { name: newSupplier.name },
        description: `创建供应商: ${newSupplier.name}`
      }).catch(err => console.error('记录操作日志失败:', err))

      return newSupplier
    } catch (error) {
      console.error('创建供应商失败:', error)
      throw error
    }
  }

  /**
   * 更新供应商
   */
  async updateSupplier(id: number, data: Partial<CreateSupplierData>): Promise<Supplier> {
    try {
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
      if (data.tax_number !== undefined) {
        fields.push('tax_number = ?')
        values.push(data.tax_number)
      }
      if (data.bank_info !== undefined) {
        fields.push('bank_info = ?')
        values.push(data.bank_info)
      }

      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }

      fields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)

      const affectedRows = await databaseService.update(
        `UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`,
        values
      )

      if (affectedRows === 0) {
        throw new Error('供应商不存在')
      }

      const updatedSupplier = await this.getSupplierById(id)
      if (!updatedSupplier) {
        throw new Error('更新供应商失败')
      }

      return updatedSupplier
    } catch (error) {
      console.error('更新供应商失败:', error)
      throw error
    }
  }

  /**
   * 删除供应商（软删除）
   */
  async deleteSupplier(id: number, userId?: number): Promise<void> {
    try {
      // 先获取供应商信息用于日志
      const supplier = await this.getSupplierById(id)

      const affectedRows = await databaseService.update(
        'UPDATE suppliers SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )

      if (affectedRows === 0) {
        throw new Error('供应商不存在')
      }

      // 记录操作日志（异步，不阻塞主流程）
      if (supplier) {
        SystemLogService.createLog({
          user_id: userId || null,
          operation_type: 'delete_supplier',
          table_name: 'suppliers',
          record_id: id,
          old_values: { name: supplier.name },
          description: `删除供应商: ${supplier.name}`
        }).catch(err => console.error('记录操作日志失败:', err))
      }
    } catch (error) {
      console.error('删除供应商失败:', error)
      throw error
    }
  }

  /**
   * 获取所有采购订单
   */
  async getAllPurchaseOrders(
    page = 1,
    pageSize = 20,
    status = '',
    supplierId?: number
  ): Promise<{ data: PurchaseOrder[]; total: number; page: number; pageSize: number }> {
    try {
      let whereConditions = '1=1'
      const params: any[] = []

      if (status) {
        whereConditions += ' AND po.status = ?'
        params.push(status)
      }
      // 不设置默认过滤，显示所有状态的订单

      if (supplierId) {
        whereConditions += ' AND po.supplier_id = ?'
        params.push(supplierId)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM purchase_orders po WHERE ${whereConditions}`,
        params
      )

      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      const orders = await databaseService.query<PurchaseOrder>(
        `SELECT 
           po.id, po.order_number, po.supplier_id, s.name as supplier_name,
           po.status, po.total_amount, po.order_date, po.expected_date, 
           po.notes, po.created_by, po.approved_by, 
           po.created_at, po.updated_at
         FROM purchase_orders po 
         LEFT JOIN suppliers s ON po.supplier_id = s.id 
         WHERE ${whereConditions} 
         ORDER BY po.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      return {
        data: orders,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取采购订单列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取采购订单
   */
  async getPurchaseOrderById(id: number): Promise<PurchaseOrder | null> {
    try {
      const order = await databaseService.queryOne<PurchaseOrder>(
        `SELECT 
           po.id, po.order_number, po.supplier_id, s.name as supplier_name,
           po.status, po.total_amount, po.order_date, po.expected_date, 
           po.notes, po.created_by, po.approved_by, 
           po.created_at, po.updated_at
         FROM purchase_orders po 
         LEFT JOIN suppliers s ON po.supplier_id = s.id 
         WHERE po.id = ?`,
        [id]
      )

      if (order) {
        // 获取订单明细
        const items = await databaseService.query<PurchaseOrderItem>(
          `SELECT 
             poi.id, poi.order_id, poi.product_id, p.name as product_name, 
             p.sku as product_sku, poi.quantity, poi.unit_price, 
             poi.total_price, poi.received_quantity, poi.notes, poi.created_at
           FROM purchase_order_items poi 
           LEFT JOIN products p ON poi.product_id = p.id 
           WHERE poi.order_id = ?`,
          [id]
        )
        order.items = items
      }

      return order
    } catch (error) {
      console.error('获取采购订单信息失败:', error)
      throw error
    }
  }

  /**
   * 创建采购订单
   */
  async createPurchaseOrder(orderData: CreatePurchaseOrderData, createdBy: number): Promise<PurchaseOrder> {
    try {
      // 确保 notes 字段存在
      await ensureNotesColumnExists()

      return await databaseService.transaction(async () => {
        // 生成订单号
        const orderNumber = `PO${Date.now()}`
        const orderDate = new Date().toISOString().split('T')[0]
        // 获取当前系统时间（包含时分秒）- 使用本地时间
        const now = new Date()
        const currentTimestamp =
          now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0')

        // 计算总金额
        let totalAmount = 0
        for (const item of orderData.items) {
          totalAmount += item.quantity * item.unit_price
        }

        // 创建采购订单
        // 注意：数据库约束只允许 'pending', 'approved', 'received', 'cancelled'
        // 新创建的订单使用 'pending' 状态
        const orderId = await databaseService.insert(
          `INSERT INTO purchase_orders 
           (order_number, supplier_id, status, total_amount, order_date, expected_date, notes, created_by, created_at, updated_at) 
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderNumber, orderData.supplier_id, totalAmount, orderDate,
            orderData.expected_date || null, orderData.notes || null, createdBy,
            currentTimestamp, currentTimestamp
          ]
        )

        // 创建订单明细
        for (const item of orderData.items) {
          const totalPrice = item.quantity * item.unit_price
          await databaseService.insert(
            `INSERT INTO purchase_order_items 
             (order_id, product_id, quantity, unit_price, total_price, received_quantity, notes, created_at) 
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              orderId, item.product_id, item.quantity, item.unit_price,
              totalPrice, item.notes || null, currentTimestamp
            ]
          )
        }

        const newOrder = await this.getPurchaseOrderById(orderId)
        if (!newOrder) {
          throw new Error('创建采购订单失败')
        }

        // 记录操作日志（异步，不阻塞主流程）
        SystemLogService.createLog({
          user_id: createdBy || null,
          operation_type: 'create_purchase_order',
          table_name: 'purchase_orders',
          record_id: orderId,
          new_values: { order_number: orderNumber, total_amount: totalAmount },
          description: `创建采购订单: ${orderNumber}, 总金额: ¥${totalAmount.toFixed(2)}`
        }).catch(err => console.error('记录操作日志失败:', err))

        return newOrder
      })
    } catch (error) {
      console.error('创建采购订单失败:', error)
      throw error
    }
  }

  /**
   * 更新采购订单状态
   */
  async updatePurchaseOrderStatus(id: number, status: string, approvedBy?: number, receivedQuantities?: Record<number, number>): Promise<PurchaseOrder> {
    try {
      return await databaseService.transaction(async () => {
        // 获取订单信息，检查当前状态
        const currentOrder = await this.getPurchaseOrderById(id)
        if (!currentOrder) {
          throw new Error('采购订单不存在')
        }

        const fields: string[] = ['status = ?']
        const values: any[] = [status]

        if (approvedBy && status === 'approved') {
          fields.push('approved_by = ?')
          values.push(approvedBy)
        }

        if (status === 'received') {
          fields.push('actual_date = ?')
          values.push(new Date().toISOString().split('T')[0])
        }

        fields.push('updated_at = CURRENT_TIMESTAMP')
        values.push(id)

        const affectedRows = await databaseService.update(
          `UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = ?`,
          values
        )

        if (affectedRows === 0) {
          throw new Error('采购订单不存在')
        }

        // 如果订单状态从其他状态变为 'approved'，更新已收货数量并增加库存
        if (status === 'approved' && currentOrder.status !== 'approved' && currentOrder.items) {
          // 更新订单项的已收货数量
          if (receivedQuantities) {
            for (const item of currentOrder.items) {
              const receivedQty = receivedQuantities[item.id] ?? item.quantity
              if (receivedQty !== item.received_quantity) {
                await databaseService.update(
                  `UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?`,
                  [receivedQty, item.id]
                )
              }
            }
          }

          // 根据已收货数量增加库存
          for (const item of currentOrder.items) {
            try {
              // 使用已收货数量，如果没有指定则使用采购数量
              const qtyToAdd = receivedQuantities ? (receivedQuantities[item.id] ?? item.quantity) : item.quantity

              if (qtyToAdd > 0) {
                await InventoryService.adjustStock({
                  product_id: item.product_id,
                  quantity: qtyToAdd,
                  type: 'in',
                  reference_type: 'purchase_order',
                  reference_id: id,
                  notes: `采购订单 ${currentOrder.order_number} 审核通过，增加库存 ${qtyToAdd}`,
                  created_by: approvedBy
                })
              }
            } catch (stockError) {
              console.error(`商品 ${item.product_id} 库存增加失败:`, stockError)
              // 不抛出错误，继续处理其他商品
            }
          }

          // 记录操作日志
          SystemLogService.createLog({
            user_id: approvedBy || null,
            operation_type: 'approve_purchase_order',
            table_name: 'purchase_orders',
            record_id: id,
            new_values: { status: 'approved' },
            description: `采购订单 ${currentOrder.order_number} 审核通过，已增加库存`
          }).catch(err => console.error('记录操作日志失败:', err))
        }

        const updatedOrder = await this.getPurchaseOrderById(id)
        if (!updatedOrder) {
          throw new Error('更新采购订单失败')
        }

        return updatedOrder
      })
    } catch (error) {
      console.error('更新采购订单状态失败:', error)
      throw error
    }
  }

  /**
   * 获取所有采购退货
   */
  async getAllPurchaseReturns(
    page = 1,
    pageSize = 20,
    status = ''
  ): Promise<{ data: PurchaseReturn[]; total: number; page: number; pageSize: number }> {
    try {
      let whereConditions = '1=1'
      const params: any[] = []

      if (status) {
        whereConditions += ' AND pr.status = ?'
        params.push(status)
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM purchase_returns pr WHERE ${whereConditions}`,
        params
      )

      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据（关联查询原订单号）
      const returns = await databaseService.query<any>(
        `SELECT 
           pr.id, pr.return_number, pr.order_id, pr.return_date,
           pr.reason, pr.status, pr.total_amount,
           pr.created_by, pr.approved_by, 
           pr.created_at, pr.updated_at,
           po.order_number as order_number
         FROM purchase_returns pr 
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         WHERE ${whereConditions} 
         ORDER BY pr.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )

      // 为每个退货记录获取关联的商品信息（通过 purchase_return_items）
      const returnsWithItems = await Promise.all(returns.map(async (ret: any) => {
        const items = await databaseService.query<any>(
          `SELECT 
             pri.return_id, pri.order_item_id, pri.quantity, pri.unit_price, pri.total_price,
             poi.product_id, p.name as product_name, p.sku as product_sku
           FROM purchase_return_items pri
           LEFT JOIN purchase_order_items poi ON pri.order_item_id = poi.id
           LEFT JOIN products p ON poi.product_id = p.id
           WHERE pri.return_id = ?`,
          [ret.id]
        )
        // 如果只有一个商品，添加到返回数据中（兼容旧接口）
        if (items.length === 1) {
          return {
            ...ret,
            product_id: items[0].product_id,
            product_name: items[0].product_name,
            product_sku: items[0].product_sku,
            quantity: items[0].quantity,
            order: ret.order_number ? { order_number: ret.order_number } : undefined
          } as PurchaseReturn
        }
        // 如果有多个商品，返回第一个（或需要修改接口以支持多个商品）
        return {
          ...ret,
          product_id: items[0]?.product_id,
          product_name: items[0]?.product_name,
          product_sku: items[0]?.product_sku,
          quantity: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
          order: ret.order_number ? { order_number: ret.order_number } : undefined
        } as PurchaseReturn
      }))

      return {
        data: returnsWithItems,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取采购退货列表失败:', error)
      throw error
    }
  }

  /**
   * 创建采购退货
   */
  async createPurchaseReturn(returnData: CreatePurchaseReturnData, createdBy: number): Promise<PurchaseReturn> {
    try {
      // #region agent log
      console.log('🔍 [后端调试] createPurchaseReturn 接收到的参数:', {
        returnData,
        createdBy,
        order_id: returnData.order_id,
        product_id: returnData.product_id,
        order_id类型: typeof returnData.order_id,
        product_id类型: typeof returnData.product_id,
        order_id值: returnData.order_id,
        product_id值: returnData.product_id
      })
      fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:674', message: 'createPurchaseReturn entry', data: { returnData, createdBy, order_id_type: typeof returnData.order_id, product_id_type: typeof returnData.product_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
      // #endregion
      return await databaseService.transaction(async () => {
        // 检查订单状态，只有已审核的订单才能退货，已退货的订单不允许重复退货
        const order = await databaseService.queryOne<any>(
          `SELECT id, order_number, status FROM purchase_orders WHERE id = ?`,
          [returnData.order_id]
        )

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:681', message: 'order query result', data: { order, order_id: returnData.order_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion

        if (!order) {
          throw new Error('采购订单不存在')
        }

        if (order.status !== 'approved') {
          if (order.status === 'cancelled') {
            throw new Error('该采购订单已退货，不允许重复退货')
          }
          throw new Error('只有已审核的采购订单才能退货')
        }

        // 检查是否已经有已审核的退货单（已审核的退货单会导致订单状态变为 cancelled）
        // 如果订单状态是 cancelled，说明已经有已审核的退货单
        // 同时检查是否有待审核的退货单，如果有也不允许重复创建
        const existingPendingReturns = await databaseService.query<any>(
          `SELECT id, status FROM purchase_returns WHERE order_id = ? AND status = 'pending'`,
          [returnData.order_id]
        )

        if (existingPendingReturns.length > 0) {
          throw new Error('该采购订单已有待审核的退货单，请先处理现有退货单')
        }

        // 检查是否已经有已审核的退货单
        const existingApprovedReturns = await databaseService.query<any>(
          `SELECT id, status FROM purchase_returns WHERE order_id = ? AND status = 'approved'`,
          [returnData.order_id]
        )

        if (existingApprovedReturns.length > 0) {
          throw new Error('该采购订单已有已审核的退货单，不允许重复退货')
        }

        // 生成退货号
        const returnNumber = `PR${Date.now()}`
        // 获取当前系统时间（包含时分秒）- 使用本地时间
        const now = new Date()
        const currentTimestamp =
          now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0')

        // 创建采购退货（注意：purchase_returns 表没有 product_id 和 quantity，需要通过 purchase_return_items 存储）
        // 先获取订单项信息
        // #region agent log
        console.log('🔍 [后端调试] 准备查询订单项:', {
          查询的order_id: returnData.order_id,
          查询的product_id: returnData.product_id,
          order_id类型: typeof returnData.order_id,
          product_id类型: typeof returnData.product_id
        })
        fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:721', message: 'before orderItems query', data: { order_id: returnData.order_id, product_id: returnData.product_id, order_id_type: typeof returnData.order_id, product_id_type: typeof returnData.product_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
        // #endregion

        // 先查询该订单的所有订单项，用于调试
        const allOrderItems = await databaseService.query<any>(
          `SELECT poi.id as order_item_id, poi.product_id, poi.unit_price, poi.quantity as order_quantity
           FROM purchase_order_items poi
           WHERE poi.order_id = ?`,
          [returnData.order_id]
        )

        // #region agent log
        console.log('🔍 [后端调试] 该订单的所有订单项:', {
          订单ID: returnData.order_id,
          订单项总数: allOrderItems.length,
          所有订单项: allOrderItems,
          订单项中的商品ID列表: allOrderItems.map((item: any) => item.product_id),
          要查找的商品ID: returnData.product_id,
          商品ID是否在订单中: allOrderItems.some((item: any) => item.product_id === returnData.product_id)
        })
        fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:726', message: 'all orderItems query result', data: { allOrderItems, allOrderItemsCount: allOrderItems.length, order_id: returnData.order_id, product_id: returnData.product_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
        // #endregion

        const orderItems = await databaseService.query<any>(
          `SELECT poi.id as order_item_id, poi.product_id, poi.unit_price, poi.quantity as order_quantity
           FROM purchase_order_items poi
           WHERE poi.order_id = ? AND poi.product_id = ?`,
          [returnData.order_id, returnData.product_id]
        )

        // #region agent log
        console.log('🔍 [后端调试] 匹配的订单项查询结果:', {
          查询的order_id: returnData.order_id,
          查询的product_id: returnData.product_id,
          匹配到的订单项数量: orderItems.length,
          匹配到的订单项: orderItems,
          该订单所有商品ID: allOrderItems.map((item: any) => item.product_id)
        })
        fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:730', message: 'orderItems query result', data: { orderItems, orderItemsCount: orderItems.length, query_order_id: returnData.order_id, query_product_id: returnData.product_id, matched_product_ids: allOrderItems.map((item: any) => item.product_id) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion

        if (orderItems.length === 0) {
          // #region agent log
          console.error('❌ [后端调试] 未找到对应的订单项 - 错误详情:', {
            订单ID: returnData.order_id,
            商品ID: returnData.product_id,
            该订单的所有订单项: allOrderItems,
            该订单包含的商品ID列表: allOrderItems.map((item: any) => item.product_id),
            问题: `商品ID ${returnData.product_id} 不在订单 ${returnData.order_id} 的商品列表中`
          })
          fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'ProcurementService.ts:732', message: 'orderItems not found error', data: { order_id: returnData.order_id, product_id: returnData.product_id, allOrderItems, available_product_ids: allOrderItems.map((item: any) => item.product_id) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
          // #endregion
          throw new Error('未找到对应的订单项')
        }

        const orderItem = orderItems[0]
        const unitPrice = orderItem.unit_price || 0
        const totalAmount = unitPrice * returnData.quantity

        // 创建 purchase_returns 记录
        const returnId = await databaseService.insert(
          `INSERT INTO purchase_returns 
           (return_number, order_id, return_date, reason, status, total_amount, created_by, created_at, updated_at) 
           VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          [
            returnNumber,
            returnData.order_id,
            new Date().toISOString().split('T')[0],
            returnData.reason,
            totalAmount,
            createdBy,
            currentTimestamp,
            currentTimestamp
          ]
        )

        // 记录操作日志（异步，不阻塞主流程）
        SystemLogService.createLog({
          user_id: createdBy || null,
          operation_type: 'create_purchase_return',
          table_name: 'purchase_returns',
          record_id: returnId,
          new_values: { return_number: returnNumber, quantity: returnData.quantity },
          description: `创建采购退货: ${returnNumber}, 数量: ${returnData.quantity}`
        }).catch(err => console.error('记录操作日志失败:', err))

        // 创建 purchase_return_items 记录
        await databaseService.insert(
          `INSERT INTO purchase_return_items 
           (return_id, order_item_id, quantity, unit_price, total_price, created_at) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [returnId, orderItem.order_item_id, returnData.quantity, unitPrice, totalAmount, currentTimestamp]
        )

        const newReturn = await this.getPurchaseReturnById(returnId)
        if (!newReturn) {
          throw new Error('创建采购退货失败')
        }

        // 记录操作日志（异步，不阻塞主流程）
        SystemLogService.createLog({
          user_id: createdBy || null,
          operation_type: 'create_purchase_return',
          table_name: 'purchase_returns',
          record_id: returnId,
          new_values: { return_number: returnNumber, quantity: returnData.quantity },
          description: `创建采购退货: ${returnNumber}, 数量: ${returnData.quantity}`
        }).catch(err => console.error('记录操作日志失败:', err))

        return newReturn
      })
    } catch (error) {
      console.error('创建采购退货失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取采购退货
   */
  async getPurchaseReturnById(id: number): Promise<PurchaseReturn | null> {
    try {
      const returnRecord = await databaseService.queryOne<any>(
        `SELECT 
           pr.id, pr.return_number, pr.order_id, pr.return_date,
           pr.reason, pr.status, pr.total_amount,
           pr.created_by, pr.approved_by, 
           pr.created_at, pr.updated_at,
           po.order_number as order_number
         FROM purchase_returns pr 
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         WHERE pr.id = ?`,
        [id]
      )

      if (!returnRecord) return null

      // 获取关联的商品信息（通过 purchase_return_items）
      const items = await databaseService.query<any>(
        `SELECT 
           pri.return_id, pri.order_item_id, pri.quantity, pri.unit_price, pri.total_price,
           poi.product_id, p.name as product_name, p.sku as product_sku
         FROM purchase_return_items pri
         LEFT JOIN purchase_order_items poi ON pri.order_item_id = poi.id
         LEFT JOIN products p ON poi.product_id = p.id
         WHERE pri.return_id = ?`,
        [id]
      )

      // 如果只有一个商品，添加到返回数据中（兼容旧接口）
      if (items.length === 1) {
        return {
          ...returnRecord,
          product_id: items[0].product_id,
          product_name: items[0].product_name,
          product_sku: items[0].product_sku,
          quantity: items[0].quantity,
          order: returnRecord.order_number ? { order_number: returnRecord.order_number } : undefined,
          product: items[0].product_name ? { name: items[0].product_name, sku: items[0].product_sku } : undefined
        } as PurchaseReturn
      }

      // 如果有多个商品，返回第一个（或需要修改接口以支持多个商品）
      return {
        ...returnRecord,
        product_id: items[0]?.product_id,
        product_name: items[0]?.product_name,
        product_sku: items[0]?.product_sku,
        quantity: items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        order: returnRecord.order_number ? { order_number: returnRecord.order_number } : undefined,
        product: items[0]?.product_name ? { name: items[0].product_name, sku: items[0].product_sku } : undefined
      } as PurchaseReturn
    } catch (error) {
      console.error('获取采购退货信息失败:', error)
      throw error
    }
  }

  /**
   * 更新采购退货状态
   */
  async updatePurchaseReturnStatus(id: number, status: string, approvedBy?: number): Promise<PurchaseReturn> {
    try {
      return await databaseService.transaction(async () => {
        // 先获取退货信息
        const returnRecord = await this.getPurchaseReturnById(id)
        if (!returnRecord) {
          throw new Error('采购退货不存在')
        }

        const fields: string[] = ['status = ?']
        const values: any[] = [status]

        if (approvedBy && (status === 'approved' || status === 'completed')) {
          fields.push('approved_by = ?')
          values.push(approvedBy)
        }

        fields.push('updated_at = CURRENT_TIMESTAMP')
        values.push(id)

        const affectedRows = await databaseService.update(
          `UPDATE purchase_returns SET ${fields.join(', ')} WHERE id = ?`,
          values
        )

        if (affectedRows === 0) {
          throw new Error('采购退货不存在')
        }

        // 如果审核通过，减少库存并更新采购订单状态为已退货
        if (status === 'approved' && returnRecord.order_id) {
          try {
            // 获取退货明细，减少对应商品的库存
            const returnItems = await databaseService.query<any>(
              `SELECT 
                 pri.quantity, pri.order_item_id,
                 poi.product_id
               FROM purchase_return_items pri
               INNER JOIN purchase_order_items poi ON pri.order_item_id = poi.id
               WHERE pri.return_id = ?`,
              [id]
            )

            for (const item of returnItems) {
              try {
                await InventoryService.adjustStock({
                  product_id: item.product_id,
                  quantity: item.quantity,
                  type: 'out',
                  reference_type: 'purchase_return',
                  reference_id: id,
                  notes: `采购退货 ${returnRecord.return_number} 审核通过，减少库存`,
                  created_by: approvedBy
                })
              } catch (stockError) {
                console.error(`商品 ${item.product_id} 库存减少失败:`, stockError)
                // 不抛出错误，继续处理其他商品
              }
            }

            // 获取订单号
            const orderInfo = await databaseService.queryOne<{ order_number: string }>(
              `SELECT order_number FROM purchase_orders WHERE id = ?`,
              [returnRecord.order_id]
            )

            // 更新采购订单状态为已退货（cancelled）
            await databaseService.update(
              `UPDATE purchase_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [returnRecord.order_id]
            )

            // 记录操作日志
            SystemLogService.createLog({
              user_id: approvedBy || null,
              operation_type: 'approve_purchase_return',
              table_name: 'purchase_returns',
              record_id: id,
              new_values: { status: 'approved' },
              description: `采购退货 ${returnRecord.return_number} 审核通过，已减少库存，采购订单 ${orderInfo?.order_number || returnRecord.order_id} 状态已更新为已退货`
            }).catch(err => console.error('记录操作日志失败:', err))

            // 记录采购订单状态更新日志
            SystemLogService.createLog({
              user_id: approvedBy || null,
              operation_type: 'update_purchase_order_status',
              table_name: 'purchase_orders',
              record_id: returnRecord.order_id,
              new_values: { status: 'cancelled' },
              description: `采购订单 ${orderInfo?.order_number || returnRecord.order_id} 因退货审核通过，状态更新为已退货`
            }).catch(err => console.error('记录操作日志失败:', err))
          } catch (updateError) {
            console.warn('处理退货库存或更新订单状态失败:', updateError)
            // 不抛出错误，允许继续执行
          }
        }

        // 记录操作日志（异步，不阻塞主流程）
        SystemLogService.createLog({
          user_id: approvedBy || null,
          operation_type: status === 'approved' ? 'approve_purchase_return' : 'reject_purchase_return',
          table_name: 'purchase_returns',
          record_id: id,
          new_values: { status },
          description: status === 'approved' ? `审核通过采购退货: ${returnRecord.return_number}` : `拒绝采购退货: ${returnRecord.return_number}`
        }).catch(err => console.error('记录操作日志失败:', err))

        const updatedReturn = await this.getPurchaseReturnById(id)
        if (!updatedReturn) {
          throw new Error('更新采购退货失败')
        }

        return updatedReturn
      })
    } catch (error) {
      console.error('更新采购退货状态失败:', error)
      throw error
    }
  }

  /**
   * 获取采购统计
   */
  async getProcurementStats(): Promise<{
    totalOrders: number
    pendingOrders: number
    totalAmount: number
    avgOrderAmount: number
    supplierCount: number
  }> {
    try {
      const stats = await databaseService.queryOne<{
        total_orders: number
        pending_orders: number
        total_amount: number
        avg_order_amount: number
        supplier_count: number
      }>(
        `SELECT 
           COUNT(*) as total_orders,
           SUM(CASE WHEN status IN ('pending', 'approved') THEN 1 ELSE 0 END) as pending_orders,
           SUM(total_amount) as total_amount,
           AVG(total_amount) as avg_order_amount,
           COUNT(DISTINCT supplier_id) as supplier_count
         FROM purchase_orders 
         WHERE created_at >= datetime('now', '-30 days')`
      )

      return {
        totalOrders: stats?.total_orders || 0,
        pendingOrders: stats?.pending_orders || 0,
        totalAmount: stats?.total_amount || 0,
        avgOrderAmount: stats?.avg_order_amount || 0,
        supplierCount: stats?.supplier_count || 0
      }
    } catch (error) {
      console.error('获取采购统计失败:', error)
      throw error
    }
  }



  /**
   * 检查订单是否已有已审核的退货单
   */
  async hasApprovedReturn(orderId: number): Promise<boolean> {
    try {
      const result = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM purchase_returns WHERE order_id = ? AND status = 'approved'`,
        [orderId]
      )
      return (result?.count || 0) > 0
    } catch (error) {
      console.error('检查订单退货单状态失败:', error)
      return false
    }
  }

  /**
   * 批量检查多个订单是否已有已审核的退货单
   */
  async getOrdersWithApprovedReturns(orderIds: number[]): Promise<Set<number>> {
    try {
      if (orderIds.length === 0) {
        return new Set()
      }
      const placeholders = orderIds.map(() => '?').join(',')
      const results = await databaseService.query<{ order_id: number }>(
        `SELECT DISTINCT order_id FROM purchase_returns WHERE order_id IN (${placeholders}) AND status = 'approved'`,
        orderIds
      )
      return new Set(results.map(r => r.order_id))
    } catch (error) {
      console.error('批量检查订单退货单状态失败:', error)
      return new Set()
    }
  }
}

export default new ProcurementService()