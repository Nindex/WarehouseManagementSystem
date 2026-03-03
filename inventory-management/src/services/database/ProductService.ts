import databaseService from '@/database/DatabaseService'
import SystemLogService from './SystemLogService'

export interface Product {
  id: number
  sku: string
  name: string
  category_id?: number
  category_name?: string
  description?: string
  unit: string
  cost_price: number
  selling_price: number
  min_stock: number
  max_stock: number
  status: number
  created_at: string
  updated_at: string
}

export interface Inventory {
  id: number
  product_id: number
  quantity: number
  location?: string
  batch_number?: string
  production_date?: string
  expiry_date?: string
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
  description?: string
  parent_id?: number
  status: number
  created_at: string
  updated_at: string
}

export interface StockAlert {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  current_stock: number
  min_stock: number
  alert_type: 'low_stock' | 'out_of_stock'
  created_at: string
}

export interface CreateProductData {
  sku: string
  name: string
  category_id?: number
  description?: string
  unit: string
  cost_price: number
  selling_price: number
  min_stock: number
  max_stock: number
}

export interface UpdateProductData {
  name?: string
  category_id?: number
  description?: string
  unit?: string
  cost_price?: number
  selling_price?: number
  min_stock?: number
  max_stock?: number
  status?: number
}

class ProductService {
  /**
   * 获取所有产品
   */
  async getAllProducts(
    page = 1, 
    pageSize = 20, 
    search = '', 
    categoryId?: number
  ): Promise<{ data: Product[]; total: number; page: number; pageSize: number }> {
    try {
      let whereConditions = 'p.status = 1'
      const params: any[] = []

      if (search) {
        // 性能优化：对于SKU使用前缀匹配（可以使用索引），名称保持模糊匹配
        // 如果搜索词长度>=3，对SKU使用前缀匹配以提高性能
        const trimmedSearch = search.trim()
        if (trimmedSearch.length >= 3) {
          // SKU使用前缀匹配（可以使用索引）
          whereConditions += ' AND (p.name LIKE ? OR p.sku LIKE ?)'
          params.push(`%${trimmedSearch}%`, `${trimmedSearch}%`)
        } else {
          // 短搜索词保持模糊匹配
          whereConditions += ' AND (p.name LIKE ? OR p.sku LIKE ?)'
          const searchPattern = `%${trimmedSearch}%`
          params.push(searchPattern, searchPattern)
        }
      }

      if (categoryId !== undefined) {
        if (categoryId === -1) {
          // -1 表示"未分类"，即 category_id 为 NULL
          whereConditions += ' AND p.category_id IS NULL'
        } else {
        whereConditions += ' AND p.category_id = ?'
        params.push(categoryId)
        }
      }

      // 获取总数
      const countResult = await databaseService.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM products p 
         WHERE ${whereConditions}`,
        params
      )
      
      const total = countResult?.count || 0
      const offset = (page - 1) * pageSize

      // 获取分页数据
      // 性能优化：使用LEFT JOIN + GROUP BY替代子查询，解决N+1查询问题
      // 先获取产品ID列表（用于JOIN优化）
      const productIds = await databaseService.query<{ id: number }>(
        `SELECT p.id 
         FROM products p 
         WHERE ${whereConditions}
         ORDER BY p.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      )
      
      if (productIds.length === 0) {
        return {
          data: [],
          total,
          page,
          pageSize
        }
      }
      
      const ids = productIds.map(p => p.id)
      const placeholders = ids.map(() => '?').join(',')
      
      // 使用LEFT JOIN一次性获取所有产品的库存信息
      const products = await databaseService.query<Product>(
        `SELECT 
           p.id, p.sku, p.name, p.category_id, c.name as category_name, 
           p.description, p.unit, p.cost_price, p.selling_price, 
           p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at,
           COALESCE(SUM(i.quantity), 0) as current_stock
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.status = 1
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id IN (${placeholders})
         GROUP BY p.id, p.sku, p.name, p.category_id, c.name, 
                  p.description, p.unit, p.cost_price, p.selling_price, 
                  p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at
         ORDER BY p.created_at DESC`,
        ids
      )
      
      return {
        data: products,
        total,
        page,
        pageSize
      }
    } catch (error) {
      console.error('获取产品列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取产品
   */
  async getProductById(id: number): Promise<Product | null> {
    try {
      const product = await databaseService.queryOne<Product>(
        `SELECT 
           p.id, p.sku, p.name, p.category_id, c.name as category_name, 
           p.description, p.unit, p.cost_price, p.selling_price, 
           p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at,
           COALESCE(i.quantity, 0) as current_stock
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.status = 1
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id = ? AND p.status = 1`,
        [id]
      )
      
      return product
    } catch (error) {
      console.error('获取产品信息失败:', error)
      throw error
    }
  }

  /**
   * 批量根据ID获取产品（性能优化：减少查询次数）
   */
  async getProductsByIds(ids: number[]): Promise<Product[]> {
    try {
      if (!ids || ids.length === 0) {
        return []
      }

      // 去重
      const uniqueIds = [...new Set(ids)]
      const placeholders = uniqueIds.map(() => '?').join(',')

      const products = await databaseService.query<Product>(
        `SELECT 
           p.id, p.sku, p.name, p.category_id, c.name as category_name, 
           p.description, p.unit, p.cost_price, p.selling_price, 
           p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at,
           COALESCE(SUM(i.quantity), 0) as current_stock
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.status = 1
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.id IN (${placeholders}) AND p.status = 1
         GROUP BY p.id, p.sku, p.name, p.category_id, c.name, 
                  p.description, p.unit, p.cost_price, p.selling_price, 
                  p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at`,
        uniqueIds
      )
      
      return products
    } catch (error) {
      console.error('批量获取产品信息失败:', error)
      throw error
    }
  }

  /**
   * 根据SKU获取产品
   */
  async getProductBySku(sku: string): Promise<Product | null> {
    try {
      const product = await databaseService.queryOne<Product>(
        `SELECT 
           p.id, p.sku, p.name, p.category_id, c.name as category_name, 
           p.description, p.unit, p.cost_price, p.selling_price, 
           p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at,
           COALESCE(i.quantity, 0) as current_stock
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.status = 1
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.sku = ? AND p.status = 1`,
        [sku]
      )
      
      return product
    } catch (error) {
      console.error('获取产品信息失败:', error)
      throw error
    }
  }

  /**
   * 创建产品
   */
  async createProduct(productData: CreateProductData, userId?: number): Promise<Product> {
    try {
      // 验证必填字段
      if (!productData.sku || productData.sku.trim() === '') {
        throw new Error('商品SKU不能为空')
      }
      if (!productData.name || productData.name.trim() === '') {
        throw new Error('商品名称不能为空')
      }
      if (!productData.unit || productData.unit.trim() === '') {
        throw new Error('商品单位不能为空')
      }
      if (productData.cost_price === undefined || productData.cost_price === null) {
        throw new Error('商品成本价不能为空')
      }
      if (productData.selling_price === undefined || productData.selling_price === null) {
        throw new Error('商品售价不能为空')
      }
      if (productData.min_stock === undefined || productData.min_stock === null) {
        throw new Error('最低库存不能为空')
      }
      if (productData.max_stock === undefined || productData.max_stock === null) {
        throw new Error('最高库存不能为空')
      }

      // 检查 SKU 是否已存在（包括已删除的商品）
      const existingProduct = await databaseService.queryOne<{ id: number; sku: string; status: number }>(
        `SELECT id, sku, status FROM products WHERE sku = ?`,
        [productData.sku]
      )
      if (existingProduct) {
        throw new Error(`商品SKU "${productData.sku}" 已存在，请使用其他SKU`)
      }

      const productId = await databaseService.insert(
        `INSERT INTO products (sku, name, category_id, description, unit, 
          cost_price, selling_price, min_stock, max_stock, status, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          productData.sku.trim(), 
          productData.name.trim(), 
          productData.category_id || null, 
          productData.description?.trim() || null, 
          productData.unit.trim(),
          productData.cost_price, 
          productData.selling_price, 
          productData.min_stock, 
          productData.max_stock
        ]
      )

      // 创建库存记录
      await databaseService.insert(
        'INSERT INTO inventory (product_id, quantity, location, created_at, updated_at) VALUES (?, 0, null, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [productId]
      )
      
      const newProduct = await this.getProductById(productId)
      if (!newProduct) {
        throw new Error('创建产品成功，但无法获取产品信息')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        user_id: userId || null,
        operation_type: 'create_product',
        table_name: 'products',
        record_id: productId,
        new_values: { sku: newProduct.sku, name: newProduct.name },
        description: `创建商品: ${newProduct.name} (SKU: ${newProduct.sku})`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return newProduct
    } catch (error: any) {
      console.error('创建产品失败:', error)
      // 如果是 UNIQUE constraint 错误，转换为友好的中文提示
      if (error?.message?.includes('UNIQUE constraint failed') || error?.message?.includes('UNIQUE constraint')) {
        if (error?.message?.includes('products.sku')) {
          throw new Error(`商品SKU "${productData.sku}" 已存在，请使用其他SKU`)
        }
        throw new Error('商品信息重复，请检查SKU是否已存在')
      }
      // 如果是 SQL 错误，提取更详细的错误信息
      if (error?.message) {
        throw new Error(error.message)
      }
      throw new Error('创建产品失败: ' + (error?.toString() || '未知错误'))
    }
  }

  /**
   * 更新产品
   */
  async updateProduct(id: number, data: UpdateProductData, userId?: number): Promise<Product> {
    try {
      const fields: string[] = []
      const values: any[] = []
      
      if (data.name !== undefined) {
        fields.push('name = ?')
        values.push(data.name)
      }
      if (data.category_id !== undefined) {
        fields.push('category_id = ?')
        values.push(data.category_id)
      }
      if (data.description !== undefined) {
        fields.push('description = ?')
        values.push(data.description)
      }
      if (data.unit !== undefined) {
        fields.push('unit = ?')
        values.push(data.unit)
      }
      if (data.cost_price !== undefined) {
        fields.push('cost_price = ?')
        values.push(data.cost_price)
      }
      if (data.selling_price !== undefined) {
        fields.push('selling_price = ?')
        values.push(data.selling_price)
      }
      if (data.min_stock !== undefined) {
        fields.push('min_stock = ?')
        values.push(data.min_stock)
      }
      if (data.max_stock !== undefined) {
        fields.push('max_stock = ?')
        values.push(data.max_stock)
      }
      if (data.status !== undefined) {
        fields.push('status = ?')
        values.push(data.status)
      }
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }
      
      fields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)
      
      const affectedRows = await databaseService.update(
        `UPDATE products SET ${fields.join(', ')} WHERE id = ?`,
        values
      )
      
      if (affectedRows === 0) {
        throw new Error('产品不存在')
      }
      
      const updatedProduct = await this.getProductById(id)
      if (!updatedProduct) {
        throw new Error('更新产品失败')
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      SystemLogService.createLog({
        user_id: userId || null,
        operation_type: 'update_product',
        table_name: 'products',
        record_id: id,
        new_values: data,
        description: `${updatedProduct.name} (SKU: ${updatedProduct.sku})`
      }).catch(err => console.error('记录操作日志失败:', err))
      
      return updatedProduct
    } catch (error: any) {
      console.error('更新产品失败:', error)
      // 如果是 UNIQUE constraint 错误，转换为友好的中文提示
      if (error?.message?.includes('UNIQUE constraint failed') || error?.message?.includes('UNIQUE constraint')) {
        if (error?.message?.includes('products.sku')) {
          throw new Error('商品SKU已被其他商品使用，请使用其他SKU')
        }
        throw new Error('商品信息重复，请检查SKU是否已存在')
      }
      // 如果已经有友好的错误信息，直接抛出
      if (error?.message && !error?.message?.includes('SqliteError')) {
        throw error
      }
      throw new Error('更新产品失败: ' + (error?.message || '未知错误'))
    }
  }

  /**
   * 删除产品（软删除）
   */
  async deleteProduct(id: number, userId?: number): Promise<void> {
    try {
      // 先获取产品信息用于日志
      const product = await this.getProductById(id)
      
      const affectedRows = await databaseService.update(
        'UPDATE products SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )
      
      if (affectedRows === 0) {
        throw new Error('产品不存在')
      }
      
      // 删除该商品相关的库存流水记录
      try {
        await databaseService.update(
          'DELETE FROM inventory_transactions WHERE product_id = ?',
          [id]
        )
        console.log(`已删除商品 ${id} 的库存流水记录`)
      } catch (transactionError) {
        // 如果删除流水记录失败，记录错误但不影响主流程
        console.error('删除库存流水记录失败:', transactionError)
      }
      
      // 删除该商品的库存记录
      try {
        await databaseService.update(
          'DELETE FROM inventory WHERE product_id = ?',
          [id]
        )
        console.log(`已删除商品 ${id} 的库存记录`)
      } catch (inventoryError) {
        // 如果删除库存记录失败，记录错误但不影响主流程
        console.error('删除库存记录失败:', inventoryError)
      }
      
      // 记录操作日志（异步，不阻塞主流程）
      if (product) {
        SystemLogService.createLog({
          user_id: userId || null,
          operation_type: 'delete_product',
          table_name: 'products',
          record_id: id,
          old_values: { sku: product.sku, name: product.name },
          description: `删除商品: ${product.name} (SKU: ${product.sku})`
        }).catch(err => console.error('记录操作日志失败:', err))
      }
    } catch (error) {
      console.error('删除产品失败:', error)
      throw error
    }
  }


  /**
   * 根据SKU获取产品（包括已删除的）
   */
  async getProductBySkuIncludeDeleted(sku: string): Promise<Product | null> {
    try {
      const product = await databaseService.queryOne<Product>(
        `SELECT 
           p.id, p.sku, p.name, p.category_id, c.name as category_name, 
           p.description, p.unit, p.cost_price, p.selling_price, 
           p.min_stock, p.max_stock, p.status, p.created_at, p.updated_at,
           COALESCE(i.quantity, 0) as current_stock
         FROM products p 
         LEFT JOIN categories c ON p.category_id = c.id AND c.status = 1
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.sku = ?`,
        [sku]
      )
      
      return product
    } catch (error) {
      console.error('获取产品信息失败:', error)
      throw error
    }
  }

  /**
   * 获取库存预警
   */
  async getStockAlerts(): Promise<StockAlert[]> {
    try {
      const alerts = await databaseService.query<StockAlert>(
        `SELECT 
           p.id, p.id as product_id, p.name as product_name, p.sku as product_sku,
           COALESCE(i.quantity, 0) as current_stock, p.min_stock,
           CASE 
             WHEN COALESCE(i.quantity, 0) = 0 THEN 'out_of_stock'
             WHEN COALESCE(i.quantity, 0) <= p.min_stock THEN 'low_stock'
             ELSE 'low_stock'
           END as alert_type,
           CURRENT_TIMESTAMP as created_at
         FROM products p 
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.status = 1 AND COALESCE(i.quantity, 0) <= p.min_stock
         ORDER BY current_stock ASC`
      )
      
      return alerts
    } catch (error) {
      console.error('获取库存预警失败:', error)
      throw error
    }
  }

  /**
   * 获取所有分类
   */
  async getAllCategories(): Promise<Category[]> {
    try {
      const categories = await databaseService.query<Category>(
        'SELECT id, name, description, status, created_at, updated_at FROM categories WHERE status = 1 ORDER BY name ASC'
      )
      
      return categories
    } catch (error) {
      console.error('获取分类列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取分类
   */
  async getCategoryById(id: number): Promise<Category | null> {
    try {
      const category = await databaseService.queryOne<Category>(
        'SELECT id, name, description, status, created_at, updated_at FROM categories WHERE id = ? AND status = 1',
        [id]
      )
      
      return category
    } catch (error) {
      console.error('获取分类信息失败:', error)
      throw error
    }
  }

  /**
   * 创建分类
   */
  async createCategory(categoryData: Omit<Category, 'id' | 'status' | 'created_at' | 'updated_at' | 'parent_id'>): Promise<Category> {
    try {
      const categoryId = await databaseService.insert(
        'INSERT INTO categories (name, description, status, created_at, updated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [categoryData.name, categoryData.description || null]
      )
      
      const newCategory = await this.getCategoryById(categoryId)
      if (!newCategory) {
        throw new Error('创建分类失败')
      }
      
      return newCategory
    } catch (error) {
      console.error('创建分类失败:', error)
      throw error
    }
  }

  /**
   * 更新分类
   */
  async updateCategory(id: number, data: Partial<Omit<Category, 'id' | 'status' | 'created_at' | 'updated_at' | 'parent_id'>>): Promise<Category> {
    try {
      const fields: string[] = []
      const values: any[] = []
      
      if (data.name !== undefined) {
        fields.push('name = ?')
        values.push(data.name)
      }
      if (data.description !== undefined) {
        fields.push('description = ?')
        values.push(data.description)
      }
      // 注意：categories 表中没有 parent_id 字段，已移除相关代码
      
      if (fields.length === 0) {
        throw new Error('没有要更新的字段')
      }
      
      fields.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)
      
      const affectedRows = await databaseService.update(
        `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
        values
      )
      
      if (affectedRows === 0) {
        throw new Error('分类不存在')
      }
      
      const updatedCategory = await this.getCategoryById(id)
      if (!updatedCategory) {
        throw new Error('更新分类失败')
      }
      
      return updatedCategory
    } catch (error) {
      console.error('更新分类失败:', error)
      throw error
    }
  }

  /**
   * 删除分类（软删除）
   * 删除分类时，将该分类下的所有商品的category_id设置为NULL，使其显示为"未分类"
   */
  async deleteCategory(id: number): Promise<void> {
    try {
      // 先将所有使用该分类的商品的category_id设置为NULL
      await databaseService.update(
        'UPDATE products SET category_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?',
        [id]
      )
      
      // 然后删除分类（软删除）
      const affectedRows = await databaseService.update(
        'UPDATE categories SET status = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      )
      
      if (affectedRows === 0) {
        throw new Error('分类不存在')
      }
    } catch (error) {
      console.error('删除分类失败:', error)
      throw error
    }
  }
}

export default new ProductService()