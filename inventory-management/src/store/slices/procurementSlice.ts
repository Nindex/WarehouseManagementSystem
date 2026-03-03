import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import ProcurementService from '@/services/database/ProcurementService'
import type { Supplier, ProcurementOrder as PurchaseOrder, ProcurementReturn as PurchaseReturn } from '@/types'
import type { PaginatedResponse } from '@/types'

interface ProcurementState {
  suppliers: Supplier[]
  orders: PurchaseOrder[]
  returns: PurchaseReturn[]
  loading: boolean
  error: string | null
  currentPage: number
  pageSize: number
  total: number
}

const initialState: ProcurementState = {
  suppliers: [],
  orders: [],
  returns: [],
  loading: false,
  error: null,
  currentPage: 1,
  pageSize: 20,
  total: 0
}

// 获取供应商列表
export const fetchSuppliers = createAsyncThunk<PaginatedResponse<Supplier>, { page?: number; pageSize?: number; search?: string } | undefined>(
  'procurement/fetchSuppliers',
  async ({ page = 1, pageSize = 20, search = '' } = {}) => {
    try {
      const res = await ProcurementService.getAllSuppliers(page, pageSize, search)
      return {
        data: res.data,
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
        totalPages: Math.ceil(res.total / (res.pageSize || pageSize))
      }
    } catch (error) {
      throw new Error('获取供应商列表失败')
    }
  }
)

// 获取采购订单
export const fetchOrders = createAsyncThunk<PaginatedResponse<PurchaseOrder>, { status?: string } | void>(
  'procurement/fetchOrders',
  (async (params?: { status?: string }) => {
    try {
      const status = params?.status || ''
      const res = await ProcurementService.getAllPurchaseOrders(1, 20, status)
      return {
        data: res.data,
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
        totalPages: Math.ceil(res.total / (res.pageSize || 20))
      }
    } catch (error) {
      throw new Error('获取采购订单失败')
    }
  }) as any
)

// 获取采购退货（显示所有退货单）
export const fetchReturns = createAsyncThunk<PaginatedResponse<PurchaseReturn>, void>(
  'procurement/fetchReturns',
  (async () => {
    try {
      // 显示所有退货单
      const res = await ProcurementService.getAllPurchaseReturns(1, 1000, '')
      return {
        data: res.data,
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
        totalPages: Math.ceil(res.total / (res.pageSize || 20))
      }
    } catch (error) {
      throw new Error('获取采购退货失败')
    }
  }) as any
)

// 创建供应商
export const createSupplier = createAsyncThunk(
  'procurement/createSupplier',
  async (supplierData: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>, { rejectWithValue }) => {
    try {
      // 转换数据格式，只传递 CreateSupplierData 需要的字段
      const createData = {
        name: supplierData.name,
        contact_person: supplierData.contact_person,
        phone: supplierData.phone,
        email: supplierData.email,
        address: supplierData.address,
        tax_number: (supplierData as any).tax_number,
        bank_info: (supplierData as any).bank_info
      }
      const newSupplier = await ProcurementService.createSupplier(createData)
      return newSupplier
    } catch (error: any) {
      return rejectWithValue(error.message || '创建供应商失败')
    }
  }
)

// 更新供应商
export const updateSupplier = createAsyncThunk(
  'procurement/updateSupplier',
  async ({ id, data }: { id: number; data: Partial<Supplier> }, { rejectWithValue }) => {
    try {
      const updatedSupplier = await ProcurementService.updateSupplier(id, data)
      return { id, data: updatedSupplier }
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 删除供应商
export const deleteSupplier = createAsyncThunk(
  'procurement/deleteSupplier',
  async (id: number, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any
      const userId = state.auth?.user?.id
      await ProcurementService.deleteSupplier(id, userId)
      return id
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 创建采购订单
export const createPurchaseOrder = createAsyncThunk<PurchaseOrder, { orderData: any; createdBy: number }>(
  'procurement/createPurchaseOrder',
  (async ({ orderData, createdBy }: { orderData: any; createdBy: number }, { rejectWithValue }: any) => {
    try {
      const newOrder = await ProcurementService.createPurchaseOrder(orderData, createdBy)
      return newOrder
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }) as any
)

// 更新采购订单状态
export const updatePurchaseOrderStatus = createAsyncThunk(
  'procurement/updatePurchaseOrderStatus',
  async ({ id, status, approvedBy, receivedQuantities }: { 
    id: number; 
    status: string; 
    approvedBy?: number;
    receivedQuantities?: Record<number, number>
  }, { rejectWithValue }) => {
    try {
      const updatedOrder = await ProcurementService.updatePurchaseOrderStatus(id, status, approvedBy, receivedQuantities)
      return { id, data: updatedOrder }
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 采购订单收货
export const receivePurchaseOrder = createAsyncThunk<{ success: boolean }, { id: number; approvedBy?: number }>(
  'procurement/receivePurchaseOrder',
  async ({ id, approvedBy }, { rejectWithValue }) => {
    try {
      await ProcurementService.updatePurchaseOrderStatus(id, 'received', approvedBy)
      return { success: true }
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

// 创建采购退货
export const createPurchaseReturn = createAsyncThunk<PurchaseReturn, { returnData: any; createdBy: number }>(
  'procurement/createPurchaseReturn',
  (async ({ returnData, createdBy }: { returnData: any; createdBy: number }, { rejectWithValue }: any) => {
    try {
      const newReturn = await ProcurementService.createPurchaseReturn(returnData, createdBy)
      return newReturn
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }) as any
)

// 更新采购退货状态
export const updatePurchaseReturnStatus = createAsyncThunk(
  'procurement/updatePurchaseReturnStatus',
  async ({ id, status, approvedBy }: { 
    id: number; 
    status: string; 
    approvedBy?: number 
  }, { rejectWithValue }) => {
    try {
      const updatedReturn = await ProcurementService.updatePurchaseReturnStatus(id, status, approvedBy)
      return { id, data: updatedReturn }
    } catch (error: any) {
      return rejectWithValue(error.message)
    }
  }
)

const procurementSlice = createSlice({
  name: 'procurement',
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
      // 获取供应商列表
      .addCase(fetchSuppliers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        state.loading = false
        state.suppliers = action.payload.data
        state.total = action.payload.total
        state.currentPage = action.payload.page || 1
        state.pageSize = action.payload.pageSize || 20
      })
      .addCase(fetchSuppliers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '获取供应商列表失败'
      })
      
      // 获取采购订单
      .addCase(fetchOrders.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.loading = false
        state.orders = action.payload.data
        state.total = action.payload.total
        state.currentPage = action.payload.page || 1
        state.pageSize = action.payload.pageSize || 20
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '获取采购订单失败'
      })
      
      // 获取采购退货
      .addCase(fetchReturns.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchReturns.fulfilled, (state, action) => {
        state.loading = false
        state.returns = action.payload.data
        state.total = action.payload.total
        state.currentPage = action.payload.page || 1
        state.pageSize = action.payload.pageSize || 20
      })
      .addCase(fetchReturns.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || '获取采购退货失败'
      })
      
      // 创建供应商
      .addCase(createSupplier.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createSupplier.fulfilled, (state, action) => {
        state.loading = false
        state.suppliers.unshift(action.payload)
      })
      .addCase(createSupplier.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      
      // 更新供应商
      .addCase(updateSupplier.fulfilled, (state, action) => {
        const { id, data } = action.payload
        const index = state.suppliers.findIndex(supplier => supplier.id === id)
        if (index !== -1) {
          state.suppliers[index] = { ...state.suppliers[index], ...data }
        }
      })
      .addCase(updateSupplier.rejected, (state, action) => {
        state.error = action.payload as string
      })
      
      // 删除供应商
      .addCase(deleteSupplier.fulfilled, (state, action) => {
        state.suppliers = state.suppliers.filter(supplier => supplier.id !== action.payload)
      })
      .addCase(deleteSupplier.rejected, (state, action) => {
        state.error = action.payload as string
      })
      
      // 创建采购订单
      .addCase(createPurchaseOrder.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createPurchaseOrder.fulfilled, (state, action) => {
        state.loading = false
        state.orders.unshift(action.payload as any)
      })
      .addCase(createPurchaseOrder.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      
      // 更新采购订单状态
      .addCase(updatePurchaseOrderStatus.fulfilled, (state, action) => {
        const { id, data } = action.payload
        const index = state.orders.findIndex(order => order.id === id)
        if (index !== -1) {
          state.orders[index] = { ...state.orders[index], ...data }
        }
      })
      .addCase(updatePurchaseOrderStatus.rejected, (state, action) => {
        state.error = action.payload as string
      })
      
      // 采购订单收货
      .addCase(receivePurchaseOrder.fulfilled, (state) => {
        // 可以在这里刷新订单列表
      })
      .addCase(receivePurchaseOrder.rejected, (state, action) => {
        state.error = action.payload as string
      })
      
      // 创建采购退货
      .addCase(createPurchaseReturn.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createPurchaseReturn.fulfilled, (state, action) => {
        state.loading = false
        state.returns.unshift(action.payload as any)
      })
      .addCase(createPurchaseReturn.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
      
      // 更新采购退货状态
      .addCase(updatePurchaseReturnStatus.fulfilled, (state, action) => {
        const { id, data } = action.payload
        const index = state.returns.findIndex(returnItem => returnItem.id === id)
        if (index !== -1) {
          state.returns[index] = { ...state.returns[index], ...data }
        }
      })
      .addCase(updatePurchaseReturnStatus.rejected, (state, action) => {
        state.error = action.payload as string
      })
  }
})

export const { setCurrentPage, setPageSize, clearError } = procurementSlice.actions
export default procurementSlice.reducer
