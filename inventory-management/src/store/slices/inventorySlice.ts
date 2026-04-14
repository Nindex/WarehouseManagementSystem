import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { productAPI, inventoryAPI } from '@/services/api'

interface Product {
  id: number
  sku: string
  name: string
  category_name?: string
  category_id?: number
  unit: string
  cost_price: number
  selling_price: number
  min_stock: number
  max_stock: number
  // optional stock quantity from inventory table
  stock_quantity?: number
  current_stock?: number
  status: number
  created_at: string
  updated_at: string
}

interface StockAlert {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  current_stock: number
  min_stock: number
  alert_type: 'low_stock' | 'out_of_stock'
  created_at: string
}

interface InventoryState {
  products: Product[]
  stockAlerts: StockAlert[]
  loading: boolean
  error: string | null
  currentPage: number
  pageSize: number
  total: number
  totalPages: number
}

const initialState: InventoryState = {
  products: [],
  stockAlerts: [],
  loading: false,
  error: null,
  currentPage: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0
}

// 获取产品列表
export const fetchProducts = createAsyncThunk<
  { data: Product[]; total: number; page: number; pageSize: number; totalPages: number },
  { page?: number; pageSize?: number; search?: string; categoryId?: number; includeDisabled?: boolean }
>(
  'inventory/fetchProducts',
  async ({ page = 1, pageSize = 20, search = '', categoryId, includeDisabled }: { page?: number; pageSize?: number; search?: string; categoryId?: number; includeDisabled?: boolean } = {}) => {
    let res
    if (includeDisabled) {
      res = await productAPI.getProductsIncludeDisabled(page, pageSize, search, categoryId)
    } else {
      res = await productAPI.getProducts(page, pageSize, search, categoryId)
    }
    if (!res.success || !res.data) {
      throw new Error(res.error || '获取产品列表失败')
    }
    return res.data
  }
)

// 切换商品启用/停用状态
export const toggleProductStatus = createAsyncThunk(
  'inventory/toggleProductStatus',
  async (id: number, { getState, rejectWithValue }) => {
    try {
      const state = getState() as any
      const userId = state.auth?.user?.id
      const response = await productAPI.toggleProductStatus(id, userId)
      if (!response.success) {
        return rejectWithValue(response.error || '切换状态失败')
      }
      return { id, status: response.data?.status }
    } catch (error: any) {
      return rejectWithValue(error?.message || '切换状态失败')
    }
  }
)

// 获取库存预警
export const fetchStockAlerts = createAsyncThunk<StockAlert[]>(
  'inventory/fetchStockAlerts',
  async () => {
    const res = await inventoryAPI.getStockAlerts()
    if (!res.success || !res.data) {
      throw new Error(res.error || '获取库存预警失败')
    }
    return res.data
  }
)

// 创建产品
export const createProduct = createAsyncThunk(
  'inventory/createProduct',
  async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'current_stock'>, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any
      const userId = state.auth?.user?.id
      const response = await productAPI.createProduct(productData, userId)
      if (!response.success) {
        return rejectWithValue(response.error || '创建产品失败')
      }
      return response.data
    } catch (error: any) {
      return rejectWithValue({
        message: error?.message || '创建产品失败'
      })
    }
  }
)

// 更新产品
export const updateProduct = createAsyncThunk(
  'inventory/updateProduct',
  async ({ id, data }: { id: number; data: Partial<Product> }, { getState }) => {
    const state = getState() as any
    const userId = state.auth?.user?.id
    const response = await productAPI.updateProduct(id, data, userId)
    if (!response.success) {
      throw new Error(response.error || '更新产品失败')
    }
    return response.data
  }
)

// 删除产品
export const deleteProduct = createAsyncThunk(
  'inventory/deleteProduct',
  async (id: number, { getState }) => {
    const state = getState() as any
    const userId = state.auth?.user?.id
    const response = await productAPI.deleteProduct(id, userId)
    if (!response.success) {
      throw new Error(response.error || '删除产品失败')
    }
    return id
  }
)

// 调整库存
export const adjustStock = createAsyncThunk(
  'inventory/adjustStock',
  async (data: {
    product_id: number
    quantity: number
    type: 'in' | 'out' | 'adjust'
    location?: string
    batch_number?: string
    production_date?: string
    expiry_date?: string
    notes?: string
    serial_numbers?: string[]
    customer_id?: number
    store_id?: number
    outbound_price?: number
    reference_type?: string
    reference_id?: number
    created_by?: number
  }) => {
    const response = await inventoryAPI.adjustStock(data)
    if (!response.success) {
      throw new Error(response.error || '调整库存失败')
    }
    return data
  }
)

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pageSize = action.payload
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      // 获取产品列表
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false
        // 将 current_stock 映射到 stock_quantity，确保字段名称一致
        state.products = action.payload.data.map((product: any) => ({
          ...product,
          stock_quantity: product.current_stock !== undefined ? product.current_stock : product.stock_quantity
        }))
        state.total = action.payload.total
        state.totalPages = action.payload.totalPages
        state.currentPage = action.payload.page
        state.pageSize = action.payload.pageSize
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '获取产品列表失败'
      })
      // 获取库存预警
      .addCase(fetchStockAlerts.pending, (state) => {
        state.loading = true
      })
      .addCase(fetchStockAlerts.fulfilled, (state, action) => {
        state.loading = false
        state.stockAlerts = action.payload
      })
      .addCase(fetchStockAlerts.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '获取库存预警失败'
      })
      // 创建产品
      .addCase(createProduct.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createProduct.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.products.unshift(action.payload)
        }
        state.total += 1
      })
      .addCase(createProduct.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '创建产品失败'
      })
      // 更新产品
      .addCase(updateProduct.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.products.findIndex(p => p.id === (action.payload as any).id)
          if (index !== -1) {
            state.products[index] = action.payload
          }
        }
      })
      .addCase(updateProduct.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '更新产品失败'
      })
      // 删除产品
      .addCase(deleteProduct.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.loading = false
        state.products = state.products.filter(p => p.id !== action.payload)
        state.total -= 1
      })
      .addCase(deleteProduct.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '删除产品失败'
      })
      // 切换商品状态
      .addCase(toggleProductStatus.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(toggleProductStatus.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.products.findIndex(p => p.id === action.payload.id)
          if (index !== -1) {
            state.products[index].status = action.payload.status
          }
        }
      })
      .addCase(toggleProductStatus.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || action.payload as string || '切换状态失败'
      })
      // 调整库存
      .addCase(adjustStock.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(adjustStock.fulfilled, (state, action) => {
        state.loading = false
        // 更新对应产品的库存数量（使用 stock_quantity 字段）
        const product = state.products.find(p => p.id === action.payload.product_id)
        if (product) {
          // 优先使用 stock_quantity，如果没有则使用 current_stock，都没有则使用 0
          const currentStock = product.stock_quantity !== undefined && product.stock_quantity !== null 
            ? product.stock_quantity 
            : ((product as any).current_stock !== undefined && (product as any).current_stock !== null 
              ? (product as any).current_stock 
              : 0)
          let newStock = currentStock
          
          if (action.payload.type === 'in') {
            newStock = currentStock + action.payload.quantity
          } else if (action.payload.type === 'out') {
            newStock = Math.max(0, currentStock - action.payload.quantity)
          } else if (action.payload.type === 'adjust') {
            // 对于 adjust 类型，直接使用传入的 quantity 作为新库存值
            newStock = action.payload.quantity
          }
          
          // 同时更新 stock_quantity 和 current_stock（兼容性）
          product.stock_quantity = newStock
          ;(product as any).current_stock = newStock
        }
      })
      .addCase(adjustStock.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '调整库存失败'
      })
  }
})

export const { setCurrentPage, setPageSize, clearError } = inventorySlice.actions
export default inventorySlice.reducer
