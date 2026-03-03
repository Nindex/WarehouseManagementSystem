import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Space, Input, Select, Tag, Badge, Modal, Form, InputNumber, App, Row, Col, Tabs, Descriptions, Spin, message, Divider, Empty, DatePicker } from 'antd'

const { TextArea } = Input
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined, HistoryOutlined, AppstoreAddOutlined } from '@ant-design/icons'
import ActivityLogModal from '@/components/ActivityLogModal'
import StockTransactionModal from '@/components/StockTransactionModal'
import BatchInventoryModal from '@/components/BatchInventoryModal'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchProducts, createProduct, updateProduct, deleteProduct, adjustStock, setPageSize } from '@/store/slices/inventorySlice'
import { ArrowUpOutlined, ArrowDownOutlined, EditOutlined as AdjustOutlined, AppstoreOutlined as BatchOutlined } from '@ant-design/icons'
import { productAPI, inventoryAPI, customerAPI } from '@/services/api'
import type { Product, Category } from '@/types'
import { formatCurrency } from '@/utils/format'
import dayjs from 'dayjs'

const { Option } = Select
const { RangePicker } = DatePicker

// 过滤中文字符的辅助函数
const filterChineseCharacters = (text: string): string => {
  // 移除所有中文字符（包括中文标点符号）
  return text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g, '')
}

const Inventory: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { products, loading, currentPage, pageSize, total } = useAppSelector((state) => state.inventory)
  const { user } = useAppSelector((state) => state.auth)

  // 获取当前路径，判断显示哪个功能
  const pathname = location.pathname.replace(/^#/, '')
  const isInbound = pathname.includes('/inbound')
  const isOutbound = pathname.includes('/outbound')
  const isCheck = pathname.includes('/check')
  const isProductList = !isInbound && !isOutbound && !isCheck
  const [searchForm] = Form.useForm()
  const [productForm] = Form.useForm()
  const [modalVisible, setModalVisible] = React.useState(false)
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null)
  const [logModalVisible, setLogModalVisible] = React.useState(false)
  const [stockTransactionModalVisible, setStockTransactionModalVisible] = React.useState(false)
  const [selectedProductForTransaction, setSelectedProductForTransaction] = React.useState<Product | null>(null)
  const [batchInventoryModalVisible, setBatchInventoryModalVisible] = React.useState(false)
  const [selectedProductForBatch, setSelectedProductForBatch] = React.useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const { message } = App.useApp()

  // 批次管理相关状态
  const [activeTab, setActiveTab] = useState<string>('products')
  const [batches, setBatches] = useState<any[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchPage, setBatchPage] = useState(1)
  const [batchPageSize, setBatchPageSize] = useState(20)
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchSearchKeyword, setBatchSearchKeyword] = useState('')
  const [selectedBatchProductId, setSelectedBatchProductId] = useState<number | undefined>(undefined)
  const [snStatusFilter, setSnStatusFilter] = useState<'all' | 'out' | 'in'>('all')
  const [snSearchKeyword, setSnSearchKeyword] = useState('')
  const [snTraceModalVisible, setSNTraceModalVisible] = useState(false)
  const [selectedSNForTrace, setSelectedSNForTrace] = useState<string>('')
  const [snTraceData, setSNTraceData] = useState<any>(null)
  const [snTraceLoading, setSNTraceLoading] = useState(false)

  // 类别管理功能状态
  const [categoryListModalVisible, setCategoryListModalVisible] = useState(false)
  const [categoryEditModalVisible, setCategoryEditModalVisible] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm] = Form.useForm()

  useEffect(() => {
    // 如果 pageSize 是 1（可能是从 Dashboard 页面传过来的），重置为默认值 20
    if (pageSize === 1 && isProductList) {
      dispatch(setPageSize(20))
    }
  }, [pageSize, isProductList, dispatch])

  useEffect(() => {
    const actualPageSize = pageSize === 1 ? 20 : pageSize
    dispatch(fetchProducts({ page: currentPage, pageSize: actualPageSize }))
    // 加载分类列表
    loadCategories()
    // 加载客户列表
    loadCustomers()
  }, [dispatch, currentPage, pageSize])

  // 加载批次数据
  useEffect(() => {
    if (activeTab === 'batches') {
      loadBatches()
    }
  }, [activeTab, batchPage, batchPageSize, batchSearchKeyword, selectedBatchProductId, snSearchKeyword, snStatusFilter])

  // 出库成功后刷新批次列表
  useEffect(() => {
    if (activeTab === 'batches') {
      loadBatches()
    }
  }, [products]) // 当商品列表更新时，刷新批次列表（出库会更新商品库存）

  const loadBatches = async () => {
    try {
      setBatchesLoading(true)
      const res = await inventoryAPI.getAllBatchesGrouped(
        batchPage,
        batchPageSize,
        selectedBatchProductId,
        batchSearchKeyword || undefined
      )
      if (res?.success && res.data) {
        setBatches(res.data.data || [])
        setBatchTotal(res.data.total || 0)
      } else {
        setBatches([])
      }
    } catch (error) {
      console.error('加载批次信息失败:', error)
      message.error('加载批次信息失败')
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }

  // 加载分类列表
  const loadCategories = async () => {
    try {
      const res = await productAPI.getCategories()
      if (res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
        setCategories(res.data)
      } else {
        console.log('数据库中没有分类数据')
        setCategories([])
      }
    } catch (error: any) {
      console.error('加载分类列表失败:', error)
      setCategories([])
    }
  }

  // 加载客户列表
  const loadCustomers = async () => {
    try {
      const res = await customerAPI.getCustomers(1, 1000, '')
      if (res.success && res.data && res.data.data) {
        setCustomers(res.data.data)
      } else {
        setCustomers([])
      }
    } catch (error: any) {
      console.error('加载客户列表失败:', error)
      setCustomers([])
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '商品名称',
      align: 'center' as const,
      dataIndex: 'name',
      key: 'name',
      width: '17px',
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: '12px',
      align: 'center' as const,
    },
    {
      title: '分类',
      align: 'center' as const,
      dataIndex: 'category_name',
      key: 'category',
      width: '8px',
      render: (categoryName: string, record: Product) => {
        const category = categoryName || record.category || '未分类'
        return (
          <Tag color="blue">{category}</Tag>
        )
      }
    },
    {
      title: '单价',
      align: 'center' as const,
      dataIndex: 'selling_price',
      key: 'price',
      width: '10px',
      render: (sellingPrice: number, record: Product) => {
        const price = sellingPrice || record.price || 0
        return (
          <span style={{ color: '#28a745', fontWeight: 500 }}>
            {formatCurrency(price)}
          </span>
        )
      }
    },
    {
      title: '库存',
      align: 'center' as const,
      dataIndex: 'stock',
      key: 'stock',
      width: '8px',
      render: (_: any, record: Product) => {
        const stockStatus = getStockStatus(record)
        const currentStock = stockStatus.stock || record.stock_quantity || (record as any).current_stock || 0
        return (
          <span
            onClick={() => {
              setSelectedProductForTransaction(record)
              setStockTransactionModalVisible(true)
            }}
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '4px',
              backgroundColor: stockStatus.color,
              color: '#fff',
              fontWeight: 600,
              fontSize: '13px',
              lineHeight: '1.5',
              minWidth: '40px',
              textAlign: 'center',
              fontFamily: 'Arial, sans-serif',
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              transition: 'all 0.3s',
              userSelect: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.8'
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'scale(1)'
            }}
            title="点击查看库存流水记录"
          >
            {currentStock}
          </span>
        )
      }
    },
    {
      title: '状态',
      align: 'center' as const,
      key: 'status',
      width: '10px',
      render: (_: any, record: Product) => {
        const stockStatus = getStockStatus(record)
        return (
          <Tag
            color={stockStatus.tagColor}
            style={{
              fontWeight: 600,
              fontSize: '13px',
              padding: '4px 12px',
              lineHeight: '1.5',
              fontFamily: 'Arial, sans-serif'
            }}
          >
            {stockStatus.text}
          </Tag>
        )
      }
    },
    {
      title: '操作',
      align: 'center' as const,
      key: 'action',
      width: '10px',
      fixed: 'right' as const,
      render: (_: any, record: Product) => (
        <Space size="small" style={{ justifyContent: 'center' }}>
          <Button
            type="text"
            icon={<AppstoreAddOutlined />}
            style={{ fontSize: '20px' }}
            onClick={() => {
              setSelectedProductForBatch(record)
              setBatchInventoryModalVisible(true)
            }}
            size="small"
            title="查看批次库存"
          />
          <Button
            type="text"
            icon={<EditOutlined />}
            style={{ fontSize: '20px' }}
            onClick={() => handleEdit(record)}
            size="small"
            title="编辑商品"
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            style={{ fontSize: '20px' }}
            onClick={() => handleDelete(record)}
            size="small"
            title="删除商品"
          />
        </Space>
      )
    }
  ]

  // 获取库存状态
  const getStockStatus = (product: Product) => {
    // 从产品数据中获取实际库存
    let currentStock: number

    // 优先使用 stock_quantity，如果没有则尝试 current_stock（从API返回）
    if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
      currentStock = product.stock_quantity
    } else if ((product as any).current_stock !== undefined && (product as any).current_stock !== null) {
      // 使用 current_stock（API返回的字段）
      currentStock = (product as any).current_stock
    } else if ((product as any).stock !== undefined && (product as any).stock !== null) {
      // 兼容 stock 字段
      currentStock = (product as any).stock
    } else {
      // 如果没有库存数据，默认返回0
      currentStock = 0
    }

    if (currentStock <= product.min_stock) {
      return { color: '#dc3545', tagColor: 'error', text: '低库存', stock: currentStock }
    } else if (currentStock >= product.max_stock) {
      return { color: '#ffc107', tagColor: 'warning', text: '高库存', stock: currentStock }
    } else {
      return { color: '#28a745', tagColor: 'success', text: '正常', stock: currentStock }
    }
  }

  // 搜索处理
  const handleSearch = (values: any) => {
    // 获取分类ID（如果选择了分类）
    let categoryId: number | undefined = undefined
    if (values.category) {
      if (values.category === '未分类') {
        // 使用 -1 作为特殊标记表示"未分类"
        categoryId = -1
      } else {
        const selectedCategory = categories.find(cat => cat.name === values.category)
        if (selectedCategory) {
          categoryId = selectedCategory.id
        }
      }
    }

    // 处理搜索关键词：如果为空字符串、undefined、null 或只包含空格，则传递空字符串
    // 后端使用 if (search) 判断，空字符串会被视为 falsy，不会添加搜索条件
    const searchValue = values.search
    const searchKeyword = (searchValue && typeof searchValue === 'string' && searchValue.trim())
      ? searchValue.trim()
      : ''

    dispatch(fetchProducts({
      page: 1,
      pageSize,
      search: searchKeyword,
      categoryId: categoryId
    }))
  }

  // 分类变化处理（自动刷新）
  const handleCategoryChange = (categoryName: string | undefined) => {
    // 获取当前表单值
    const formValues = searchForm.getFieldsValue()
    // 更新分类值
    const updatedValues = {
      ...formValues,
      category: categoryName
    }
    // 自动触发搜索
    handleSearch(updatedValues)
  }

  // 编辑商品
  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setModalVisible(true)
  }

  // 当模态框打开且是编辑模式时，设置表单值
  useEffect(() => {
    if (modalVisible && editingProduct) {
      // 使用 setTimeout 确保表单已经渲染
      setTimeout(() => {
        productForm.setFieldsValue({
          name: editingProduct.name || '',
          sku: editingProduct.sku || '',
          category: editingProduct.category_name || editingProduct.category || '未分类',
          price: editingProduct.selling_price || editingProduct.price || 0,
          min_stock: editingProduct.min_stock || 0,
          max_stock: editingProduct.max_stock || 0,
        })
      }, 0)
    } else if (!modalVisible) {
      // 当模态框关闭时，重置表单
      productForm.resetFields()
    }
  }, [modalVisible, editingProduct])

  // 删除商品
  const handleDelete = async (product: Product) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除商品 "${product.name}" 吗？`,
      onOk: async () => {
        try {
          await dispatch(deleteProduct(product.id)).unwrap()
          message.success('商品删除成功')
          dispatch(fetchProducts({ page: currentPage, pageSize }))
        } catch (error: any) {
          message.error(error?.message || '商品删除失败')
        }
      }
    })
  }

  // 新建商品
  const handleAddNew = () => {
    setEditingProduct(null)
    productForm.resetFields()
    setModalVisible(true)
  }

  // ========== 类别管理功能 ==========
  const handleManageCategory = () => {
    setCategoryListModalVisible(true)
  }

  const handleAddCategory = () => {
    setEditingCategory(null)
    categoryForm.resetFields()
    setCategoryEditModalVisible(true)
  }

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    categoryForm.setFieldsValue({
      name: category.name,
      description: category.description || ''
    })
    setCategoryEditModalVisible(true)
  }

  const handleDeleteCategory = async (category: Category) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除分类 "${category.name}" 吗？删除后该分类下的商品将自动变为"未分类"。`,
      onOk: async () => {
        try {
          const res = await productAPI.deleteCategory(category.id)
          if (res.success) {
            message.success('分类删除成功')
            loadCategories()
            // 刷新商品列表，使分类更新生效
            dispatch(fetchProducts({ page: currentPage, pageSize }))
          } else {
            message.error(res.error || '分类删除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '分类删除失败')
        }
      }
    })
  }

  const handleCategoryModalOk = async () => {
    try {
      const values = await categoryForm.validateFields()

      if (editingCategory) {
        // 更新分类
        const res = await productAPI.updateCategory(editingCategory.id, {
          name: values.name,
          description: values.description
        })
        if (res.success) {
          message.success('分类更新成功')
          setCategoryEditModalVisible(false)
          categoryForm.resetFields()
          setEditingCategory(null)
          // 刷新分类列表
          loadCategories()
          // 刷新商品列表，使所有该分类下的商品显示新的分类名称
          dispatch(fetchProducts({ page: currentPage, pageSize }))
        } else {
          message.error(res.error || '分类更新失败')
        }
      } else {
        // 创建分类
        const res = await productAPI.createCategory({
          name: values.name,
          description: values.description
        })
        if (res.success) {
          message.success('分类创建成功')
          setCategoryEditModalVisible(false)
          categoryForm.resetFields()
          loadCategories()
        } else {
          message.error(res.error || '分类创建失败')
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error?.message || (editingCategory ? '分类更新失败' : '分类创建失败'))
    }
  }

  // 根据分类名称获取分类ID
  const getCategoryIdByName = (categoryName: string | undefined): number | undefined => {
    if (!categoryName || categoryName === '未分类') return undefined
    const category = categories.find(cat => cat.name === categoryName)
    if (category) {
      return category.id
    }
    // 如果找不到分类，返回 undefined（无分类）
    return undefined
  }

  // 模态框确认
  const handleModalOk = async () => {
    try {
      const values = await productForm.validateFields()

      // 验证必填字段
      if (!values.name || values.name.trim() === '') {
        message.error('商品名称不能为空')
        return
      }
      if (!values.sku || values.sku.trim() === '') {
        message.error('商品SKU不能为空')
        return
      }
      if (!values.price && values.price !== 0) {
        message.error('商品单价不能为空')
        return
      }
      if (values.min_stock === undefined || values.min_stock === null) {
        message.error('最低库存不能为空')
        return
      }
      if (values.max_stock === undefined || values.max_stock === null) {
        message.error('最高库存不能为空')
        return
      }

      // 获取分类ID
      const categoryId = getCategoryIdByName(values.category)

      if (editingProduct) {
        // 更新商品
        await dispatch(updateProduct({
          id: editingProduct.id,
          data: {
            name: values.name,
            category_id: categoryId,
            selling_price: values.price,
            min_stock: values.min_stock,
            max_stock: values.max_stock,
          }
        })).unwrap()
        message.success('商品更新成功')
      } else {
        // 创建商品
        try {
          // 确保所有必填字段都有值
          const productData = {
            sku: (values.sku || '').trim(),
            name: (values.name || '').trim(),
            category_id: categoryId,
            unit: '个',
            cost_price: 0,
            selling_price: values.price || 0,
            min_stock: values.min_stock || 0,
            max_stock: values.max_stock || 0,
          }

          // 再次验证必填字段
          if (!productData.name) {
            message.error('商品名称不能为空')
            return
          }
          if (!productData.sku) {
            message.error('商品SKU不能为空')
            return
          }

          await dispatch(createProduct(productData as any)).unwrap()
          message.success('商品创建成功')
        } catch (createError: any) {
          // 显示错误消息
          const errorPayload = createError?.payload
          const errorMessageToShow = typeof errorPayload === 'string'
            ? errorPayload
            : errorPayload?.message || createError?.message || '商品创建失败'
          message.error(errorMessageToShow)
          console.error('商品创建失败:', createError)
        }
      }

      setModalVisible(false)
      setEditingProduct(null)
      productForm.resetFields()
      dispatch(fetchProducts({ page: currentPage, pageSize }))
    } catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误
        return
      }
      const errorMessage = error?.payload || error?.message || (editingProduct ? '商品更新失败' : '商品创建失败')
      message.error(errorMessage)
      console.error(editingProduct ? '商品更新失败:' : '商品创建失败:', error)
    }
  }

  // 分页处理
  const handleTableChange = (pagination: any) => {
    dispatch(fetchProducts({
      page: pagination.current,
      pageSize: pagination.pageSize
    }))
  }

  // 入库功能状态
  const [inboundModalVisible, setInboundModalVisible] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [inboundForm] = Form.useForm()

  // 批量入库功能状态
  const [batchInboundModalVisible, setBatchInboundModalVisible] = useState(false)
  const [batchInboundForm] = Form.useForm()
  const [batchInboundProducts, setBatchInboundProducts] = useState<Array<{
    product_id: number
    product_name: string
    product_sku: string
    serial_numbers: string[]
  }>>([])

  // 出库功能状态
  const [outboundModalVisible, setOutboundModalVisible] = useState(false)
  const [outboundForm] = Form.useForm()
  const [outboundRecordsModalVisible, setOutboundRecordsModalVisible] = useState(false)
  const [outboundRecords, setOutboundRecords] = useState<any[]>([])
  const [outboundRecordsLoading, setOutboundRecordsLoading] = useState(false)
  const [outboundRecordsPage, setOutboundRecordsPage] = useState(1)
  const [outboundRecordsPageSize, setOutboundRecordsPageSize] = useState(20)
  const [outboundRecordsTotal, setOutboundRecordsTotal] = useState(0)
  const [outboundRecordsCustomerFilter, setOutboundRecordsCustomerFilter] = useState<number | undefined>(undefined)
  const [outboundRecordsDateRange, setOutboundRecordsDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [outboundRecordsTotalAmount, setOutboundRecordsTotalAmount] = useState<number>(0)
  const [customerStores, setCustomerStores] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined)
  const [outboundBatchNumbers, setOutboundBatchNumbers] = useState<string[]>([])
  // 批量出库功能状态
  const [batchOutboundModalVisible, setBatchOutboundModalVisible] = useState(false)
  const [batchOutboundForm] = Form.useForm()
  const [selectedProductsForBatch, setSelectedProductsForBatch] = useState<Product[]>([])
  const [batchOutboundProducts, setBatchOutboundProducts] = useState<any[]>([])

  // 盘点功能状态
  const [checkModalVisible, setCheckModalVisible] = useState(false)
  const [checkForm] = Form.useForm()

  // ========== 出库记录加载 ==========
  // 加载出库记录
  const loadOutboundRecords = async (page = 1, pageSize = 20, customerId?: number, dateRange?: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    try {
      setOutboundRecordsLoading(true)

      // 准备筛选条件
      const filters: any = {
        customer_id: customerId
      }

      // 处理时间范围（onChange 已自动设置默认时分秒）
      if (dateRange && dateRange[0] && dateRange[1]) {
        filters.start_date = dateRange[0].format('YYYY-MM-DD HH:mm:ss')
        filters.end_date = dateRange[1].format('YYYY-MM-DD HH:mm:ss')
      }

      const res = await inventoryAPI.getOutboundRecords(page, pageSize, filters)
      if (res.success && res.data) {
        setOutboundRecords(res.data.data || [])
        setOutboundRecordsTotal(res.data.total || 0)
        setOutboundRecordsPage(res.data.page || 1)
        setOutboundRecordsPageSize(res.data.pageSize || 20)
      }

      // 获取筛选后的总金额
      const totalAmountRes = await inventoryAPI.getOutboundRecordsTotalAmount(filters)
      if (totalAmountRes.success && totalAmountRes.data !== undefined) {
        setOutboundRecordsTotalAmount(totalAmountRes.data)
      }
    } catch (error: any) {
      console.error('加载出库记录失败:', error)
      message.error('加载出库记录失败')
    } finally {
      setOutboundRecordsLoading(false)
    }
  }

  // 出库记录模态框打开时加载数据
  useEffect(() => {
    if (isOutbound && outboundRecordsModalVisible) {
      loadOutboundRecords(1, 20, outboundRecordsCustomerFilter, outboundRecordsDateRange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOutbound, outboundRecordsModalVisible, outboundRecordsCustomerFilter, outboundRecordsDateRange])

  // ========== 入库功能 ==========
  const handleInbound = (product: Product) => {
    setSelectedProduct(product)
    // 先打开弹窗，然后设置表单值，确保表单已渲染
    setInboundModalVisible(true)

    // 使用 setTimeout 确保在弹窗完全打开后再设置表单值
    setTimeout(() => {
      // 重置表单并清除所有验证错误
      inboundForm.resetFields()
      // 清除所有字段的错误状态
      inboundForm.setFields([
        { name: 'quantity', errors: [] }
      ])

      // 设置表单值
      inboundForm.setFieldsValue({
        product_id: product.id,
        product_name: product.name,
        current_stock: product.stock_quantity || (product as any).current_stock || 0,
        quantity: undefined,
        location: '',
        batch_number: '',
        notes: '',
        serial_numbers: '' // SN码输入
      })
    }, 100)
  }

  const handleInboundSubmit = async () => {
    try {
      // 先触发表单验证，确保所有字段值都已同步
      await inboundForm.validateFields()

      // 获取表单值，确保获取到最新的值
      const values = inboundForm.getFieldsValue()
      if (!selectedProduct) return

      // 检查是否输入了SN码
      const serialNumbersText = values.serial_numbers || ''
      const serialNumbers = serialNumbersText
        .split('\n')
        .map((sn: string) => sn.trim())
        .filter((sn: string) => sn)

      // 如果输入了SN码，按SN码入库
      if (serialNumbers.length > 0) {
        // 如果用户没有输入批次号，先生成一个批次号，所有SN码共用这个批次号
        let batchNumber = values.batch_number
        if (!batchNumber || !batchNumber.trim()) {
          const batchResponse = await inventoryAPI.generateBatchNumber()
          if (batchResponse.success && batchResponse.data) {
            batchNumber = batchResponse.data
          } else {
            message.error('生成批次号失败，请手动输入批次号')
            return
          }
        }

        let successCount = 0
        let failCount = 0
        const errors: string[] = []

        // 所有SN码使用同一个批次号
        // 先检查本次提交的SN码是否有重复
        const duplicateInBatch = serialNumbers.filter((sn: string, index: number) => serialNumbers.indexOf(sn) !== index)
        if (duplicateInBatch.length > 0) {
          message.error(`本次提交的SN码中有重复：${[...new Set(duplicateInBatch)].join(', ')}`)
          return
        }

        for (const snCode of serialNumbers) {
          try {
            // 每个SN码作为一个独立的入库记录，数量为1，但使用同一个批次号
            await dispatch(adjustStock({
              product_id: selectedProduct.id,
              quantity: 1,
              type: 'in',
              location: values.location,
              batch_number: batchNumber, // 所有SN码使用同一个批次号
              notes: values.notes || undefined, // 不将SN码填入notes
              serial_numbers: [snCode], // 传递SN码数组
              created_by: user?.id
            })).unwrap()
            successCount++
          } catch (error: any) {
            console.error(`SN码 ${snCode} 入库失败:`, error)
            failCount++
            errors.push(`${snCode}: ${error?.message || '入库失败'}`)
          }
        }

        if (successCount > 0) {
          message.success(`SN码入库完成：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ''}`)
          if (failCount > 0 && errors.length > 0) {
            Modal.warning({
              title: `SN码入库失败详情（失败 ${failCount} 个）`,
              width: 600,
              content: (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {errors.map((error, index) => (
                      <li key={index} style={{ marginBottom: 8, color: '#ff4d4f' }}>
                        <strong>{error}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
              okText: '我知道了'
            })
          }
        } else {
          Modal.error({
            title: '所有SN码入库失败',
            width: 600,
            content: (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <p style={{ color: '#ff4d4f', marginBottom: 12 }}>请检查以下SN码：</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {errors.map((error, index) => (
                    <li key={index} style={{ marginBottom: 8, color: '#ff4d4f' }}>
                      <strong>{error}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            okText: '我知道了'
          })
          return
        }
      } else {
        // 如果没有输入SN码，按原来的逻辑入库
        // 确保 quantity 是数字类型，InputNumber 可能返回 null 或 undefined
        const quantity = values.quantity !== null && values.quantity !== undefined
          ? Number(values.quantity)
          : null

        if (quantity === null || isNaN(quantity) || quantity <= 0) {
          message.error('请输入有效的入库数量或SN码')
          // 触发表单字段的错误提示
          inboundForm.setFields([{
            name: 'quantity',
            errors: ['请输入有效的入库数量或SN码']
          }])
          return
        }

        // 如果批次号为空，系统会自动生成
        let batchNumber = values.batch_number
        if (!batchNumber || !batchNumber.trim()) {
          const batchResponse = await inventoryAPI.generateBatchNumber()
          if (batchResponse.success && batchResponse.data) {
            batchNumber = batchResponse.data
          } else {
            message.error('生成批次号失败，请手动输入批次号')
            return
          }
        }

        await dispatch(adjustStock({
          product_id: selectedProduct.id,
          quantity: quantity,
          type: 'in',
          location: values.location,
          batch_number: batchNumber, // 使用生成的或用户输入的批次号
          notes: values.notes,
          created_by: user?.id
        })).unwrap()

        message.success('入库成功')
      }

      // 清除表单状态和验证错误
      inboundForm.resetFields()
      inboundForm.setFields([
        { name: 'quantity', errors: [] }
      ])
      setInboundModalVisible(false)
      setSelectedProduct(null)
      // 刷新商品列表以获取最新库存
      await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
    } catch (error: any) {
      message.error(error?.message || '入库失败')
    }
  }

  // ========== 批量入库功能 ==========
  const handleBatchInboundSubmit = async () => {
    try {
      const values = await batchInboundForm.validateFields()

      if (batchInboundProducts.length === 0) {
        message.error('请至少选择一个商品')
        return
      }

      // 检查是否有商品输入了SN码
      const hasSerialNumbers = batchInboundProducts.some(p => p.serial_numbers.length > 0)
      if (!hasSerialNumbers) {
        message.error('请至少为一个商品输入SN码')
        return
      }

      // 批量入库每个SN码
      let successCount = 0
      let failCount = 0
      const errors: string[] = []

      for (const productItem of batchInboundProducts) {
        if (productItem.serial_numbers.length === 0) {
          continue
        }

        // 检查当前商品的SN码是否有重复
        const duplicateInProduct = productItem.serial_numbers.filter((sn, index) => productItem.serial_numbers.indexOf(sn) !== index)
        if (duplicateInProduct.length > 0) {
          message.error(`商品 "${productItem.product_name}" 的SN码中有重复：${[...new Set(duplicateInProduct)].join(', ')}`)
          return
        }

        // 如果批次号为空，系统会自动生成（按照规则：YYMMDDHHMM + 自增数字）
        let batchNumber = values.batch_number
        if (!batchNumber || !batchNumber.trim()) {
          const batchResponse = await inventoryAPI.generateBatchNumber()
          if (batchResponse.success && batchResponse.data) {
            batchNumber = batchResponse.data
          } else {
            message.error('生成批次号失败，请手动输入批次号')
            return
          }
        }

        for (const snCode of productItem.serial_numbers) {
          if (!snCode.trim()) {
            continue
          }

          try {
            // 每个SN码作为一个独立的入库记录，数量为1，使用同一个批次号
            await dispatch(adjustStock({
              product_id: productItem.product_id,
              quantity: 1,
              type: 'in',
              location: values.location,
              batch_number: batchNumber,
              notes: values.notes || undefined, // 不将SN码填入notes
              serial_numbers: [snCode.trim()], // 传递SN码数组
              created_by: user?.id
            })).unwrap()
            successCount++
          } catch (error: any) {
            console.error(`商品 ${productItem.product_name} SN码 ${snCode} 入库失败:`, error)
            failCount++
            errors.push(`${productItem.product_name} - ${snCode}: ${error?.message || '入库失败'}`)
          }
        }
      }

      if (successCount > 0) {
        message.success(`批量入库完成：成功 ${successCount} 个，失败 ${failCount} 个`)
        if (failCount > 0 && errors.length > 0) {
          Modal.warning({
            title: `批量入库失败详情（失败 ${failCount} 个）`,
            width: 700,
            content: (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {errors.map((error, index) => (
                    <li key={index} style={{ marginBottom: 8, color: '#ff4d4f' }}>
                      <strong>{error}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ),
            okText: '我知道了'
          })
        }
        setBatchInboundModalVisible(false)
        batchInboundForm.resetFields()
        setBatchInboundProducts([])
        await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
      } else {
        Modal.error({
          title: '批量入库失败',
          width: 700,
          content: (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <p style={{ color: '#ff4d4f', marginBottom: 12 }}>请检查以下商品和SN码：</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {errors.map((error, index) => (
                  <li key={index} style={{ marginBottom: 8, color: '#ff4d4f' }}>
                    <strong>{error}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ),
          okText: '我知道了'
        })
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      message.error(error?.message || '批量入库失败')
    }
  }

  // ========== 出库功能 ==========
  const handleOutbound = (product: Product) => {
    setSelectedProduct(product)
    const currentStock = product.stock_quantity || (product as any).current_stock || 0
    setSelectedCustomerId(undefined)
    setCustomerStores([])
    outboundForm.setFieldsValue({
      product_id: product.id,
      product_name: product.name,
      current_stock: currentStock,
      customer_id: undefined,
      store_id: undefined,
      store_name: undefined,
      quantity: undefined,
      outbound_price: product.selling_price || (product as any).price || undefined,
      location: '',
      notes: ''
    })
    setOutboundModalVisible(true)
  }

  // 加载客户门店列表
  const loadCustomerStores = async (customerId: number) => {
    try {
      const res = await customerAPI.getCustomerStores(customerId)
      if (res.success && res.data) {
        setCustomerStores(res.data || [])
      } else {
        setCustomerStores([])
      }
    } catch (error) {
      console.error('加载客户门店列表失败:', error)
      setCustomerStores([])
    }
  }

  // 客户选择变化处理
  const handleCustomerChange = async (customerId: number) => {
    setSelectedCustomerId(customerId)
    outboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
    if (customerId) {
      await loadCustomerStores(customerId)
    } else {
      setCustomerStores([])
    }
  }

  // 批量出库 - 客户选择变化处理
  const handleBatchCustomerChange = async (customerId: number) => {
    batchOutboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
    if (customerId) {
      const res = await customerAPI.getCustomerStores(customerId)
      if (res.success && res.data) {
        setCustomerStores(res.data || [])
      }
    } else {
      setCustomerStores([])
    }
  }

  // 保证自由输入的门店名称在下拉中存在，以避免失焦后清空
  const buildStoreOptions = (formInstance: any, stores: any[]) => {
    const opts = stores.map(store => ({
      label: store.store_name,
      value: store.id
    }))
    const storeId = formInstance.getFieldValue('store_id')
    const storeName = formInstance.getFieldValue('store_name')
    const typed = typeof storeId === 'string' ? storeId : (typeof storeName === 'string' ? storeName : '')
    if (typed && !opts.find(o => String(o.value) === String(typed))) {
      opts.unshift({ label: typed, value: typed })
    }
    return opts
  }

  // 根据SN码批量获取批次号
  const getBatchNumbersBySerialNumbers = async (serialNumbers: string[], productId: number): Promise<string[]> => {
    if (!serialNumbers || serialNumbers.length === 0) {
      return []
    }

    const batchNumbersSet = new Set<string>()

    // 批量查询每个SN码的批次号
    for (const sn of serialNumbers) {
      try {
        const res = await inventoryAPI.getBatchBySerialNumber(sn, productId)
        if (res.success && res.data && res.data.batch_number) {
          batchNumbersSet.add(res.data.batch_number)
        }
      } catch (error) {
        console.error(`获取SN码 ${sn} 的批次号失败:`, error)
      }
    }

    return Array.from(batchNumbersSet)
  }

  // 删除SN码处理函数
  const handleDeleteSNCode = async (serialNumber: string, productId: number) => {
    // 获取商品信息用于提示
    const product = products.find(p => p.id === productId)
    const productName = product?.name || `商品ID ${productId}`

    Modal.confirm({
      title: '确认删除SN码',
      width: 500,
      content: (
        <div>
          <p style={{ marginBottom: 12 }}>
            确定要删除SN码 <strong style={{ color: '#ff4d4f' }}>{serialNumber}</strong> 吗？
          </p>
          <p style={{ marginBottom: 12 }}>
            商品：{productName}
          </p>
          <p style={{ color: '#ff4d4f', marginBottom: 0 }}>
            注意：此操作将删除该SN码的入库记录，并减少对应批次的库存数量。此操作无法恢复，请谨慎操作。
          </p>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await inventoryAPI.deleteSerialNumber(serialNumber, productId, user?.id)
          if (res.success) {
            message.success('SN码删除成功')
            // 刷新批次列表
            await loadBatches()
            // 刷新商品列表以更新库存数量
            await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
          } else {
            message.error(res.error || '删除SN码失败')
          }
        } catch (error: any) {
          console.error('删除SN码失败:', error)
          message.error(error?.message || '删除SN码失败')
        }
      }
    })
  }

  // 批量出库提交
  const handleBatchOutboundSubmit = async () => {
    try {
      const values = await batchOutboundForm.validateFields()

      if (!values.customer_id) {
        message.error('请选择客户')
        return
      }

      if (!batchOutboundProducts || batchOutboundProducts.length === 0) {
        message.error('请至少选择一个商品')
        return
      }

      // 处理门店：支持选择已有门店或直接输入新门店名称
      let storeId: number | undefined = undefined
      let inputStoreName = values.store_name

      // 如果用户直接在下拉框输入（store_id 为字符串），也视为门店名称
      if (!inputStoreName && typeof values.store_id === 'string') {
        inputStoreName = values.store_id
      }

      if (inputStoreName && inputStoreName.trim()) {
        try {
          const storeRes = await customerAPI.createOrGetStore({
            customer_id: values.customer_id,
            store_name: inputStoreName.trim()
          })
          if (storeRes.success && storeRes.data) {
            storeId = storeRes.data.id
            batchOutboundForm.setFieldsValue({ store_id: storeId })
          }
        } catch (error: any) {
          console.error('创建或获取门店失败:', error)
          message.error('门店处理失败: ' + (error?.message || '未知错误'))
          return
        }
      } else if (values.store_id && typeof values.store_id === 'number') {
        storeId = values.store_id
      }

      // 批量出库每个商品
      let successCount = 0
      let failCount = 0

      for (const productItem of batchOutboundProducts) {
        if (!productItem.product_id || !productItem.quantity || productItem.quantity <= 0) {
          failCount++
          continue
        }

        try {
          // 验证SN码数量与出库数量是否一致（如果填写了SN码）
          if (productItem.serial_numbers && productItem.serial_numbers.length > 0) {
            if (productItem.serial_numbers.length !== productItem.quantity) {
              message.error(`商品 "${productItem.product_name}" 的SN码数量(${productItem.serial_numbers.length})与出库数量(${productItem.quantity})不一致`)
              failCount++
              continue
            }

            // 验证SN码是否存在和是否已出库（与单个出库相同的验证逻辑）
            const invalidSNs: string[] = []
            const outboundSNs: string[] = []

            // 使用批量验证API提高性能
            const validationRes = await inventoryAPI.validateSerialNumbers(
              productItem.serial_numbers,
              productItem.product_id
            )

            const snsWithNoBatchStock: string[] = [] // SN码对应的批次没有库存

            if (validationRes.success && validationRes.data) {
              // 收集所有有效的批次号
              const batchNumbersSet = new Set<string>()
              const snToBatchMap = new Map<string, string>()

              for (const sn of productItem.serial_numbers) {
                const validation = validationRes.data[sn]
                if (validation) {
                  if (!validation.exists) {
                    invalidSNs.push(sn)
                  } else if (validation.isOutbound) {
                    outboundSNs.push(sn)
                  } else if (validation.batchNumber) {
                    // SN码存在且未出库，记录批次号
                    batchNumbersSet.add(validation.batchNumber)
                    snToBatchMap.set(sn, validation.batchNumber)
                  }
                }
              }

              // 检查批次是否有库存
              if (batchNumbersSet.size > 0) {
                try {
                  const batchStockRes = await inventoryAPI.getAllBatchesGrouped(1, 1000, productItem.product_id)
                  if (batchStockRes.success && batchStockRes.data?.data) {
                    const batchStockMap = new Map<string, number>()
                    batchStockRes.data.data.forEach((batch: any) => {
                      if (batch.total_quantity > 0) {
                        batchStockMap.set(batch.batch_number, batch.total_quantity)
                      }
                    })

                    // 检查每个SN码对应的批次是否有库存
                    for (const [sn, batchNumber] of snToBatchMap) {
                      if (!batchStockMap.has(batchNumber)) {
                        snsWithNoBatchStock.push(sn)
                      }
                    }
                  }
                } catch (error) {
                  console.error('检查批次库存失败:', error)
                }
              }
            } else {
              // 如果批量验证失败，回退到单个验证
              for (const sn of productItem.serial_numbers) {
                const res = await inventoryAPI.validateSerialNumber(sn, productItem.product_id)
                if (res.success && res.data) {
                  if (!res.data.exists) {
                    invalidSNs.push(sn)
                  } else if (res.data.isOutbound) {
                    outboundSNs.push(sn)
                  } else if (res.data.batchNumber) {
                    // 检查该批次是否有库存
                    try {
                      const batchStockRes = await inventoryAPI.getAllBatchesGrouped(1, 1000, productItem.product_id)
                      if (batchStockRes.success && batchStockRes.data?.data) {
                        const batch = batchStockRes.data.data.find((b: any) => b.batch_number === res.data.batchNumber)
                        if (!batch || batch.total_quantity <= 0) {
                          snsWithNoBatchStock.push(sn)
                        }
                      }
                    } catch (error) {
                      console.error('检查批次库存失败:', error)
                    }
                  }
                }
              }
            }

            if (invalidSNs.length > 0) {
              message.error(`商品 "${productItem.product_name}" 的以下SN码不存在：${invalidSNs.join(', ')}，请检查后重新输入`)
              failCount++
              continue
            }

            if (outboundSNs.length > 0) {
              message.error(`商品 "${productItem.product_name}" 的以下SN码已出库，不可重复出库：${outboundSNs.join(', ')}，请移除这些SN码后重新提交`)
              failCount++
              continue
            }

            if (snsWithNoBatchStock.length > 0) {
              message.error(`商品 "${productItem.product_name}" 的以下SN码对应的批次没有可用库存：${snsWithNoBatchStock.join(', ')}，请检查批次库存或更改SN码`)
              failCount++
              continue
            }
          }

          // 如果有多个批次号，使用第一个（业务逻辑：FIFO会按批次自动处理）
          // 如果没有批次号但填写了SN码，系统会根据SN码自动识别批次
          const batchNumber = productItem.batch_numbers && productItem.batch_numbers.length > 0
            ? productItem.batch_numbers[0]
            : undefined

          await dispatch(adjustStock({
            product_id: productItem.product_id,
            quantity: productItem.quantity,
            type: 'out',
            customer_id: values.customer_id,
            store_id: storeId,
            location: values.location,
            notes: values.notes,
            outbound_price: productItem.outbound_price ? Number(productItem.outbound_price) : undefined,
            serial_numbers: productItem.serial_numbers || [],
            batch_number: batchNumber, // 使用第一个批次号（如果有多个，FIFO会自动处理）
            created_by: user?.id
          })).unwrap()
          successCount++
        } catch (error: any) {
          console.error(`商品 ${productItem.product_name} 出库失败:`, error)
          failCount++
        }
      }

      if (successCount > 0) {
        message.success(`批量出库完成：成功 ${successCount} 个，失败 ${failCount} 个`)
        setBatchOutboundModalVisible(false)
        batchOutboundForm.resetFields()
        setBatchOutboundProducts([])
        setCustomerStores([])
        await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
      } else {
        message.error('批量出库失败，请检查商品信息')
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      message.error(error?.message || '批量出库失败')
    }
  }

  const handleOutboundSubmit = async () => {
    try {
      const values = await outboundForm.validateFields()
      if (!selectedProduct) return

      // 确保 quantity 是数字类型，InputNumber 可能返回 null 或 undefined
      const quantity = values.quantity !== null && values.quantity !== undefined
        ? Number(values.quantity)
        : null

      if (quantity === null || isNaN(quantity) || quantity <= 0) {
        message.error('请输入有效的出库数量')
        return
      }

      const currentStock = selectedProduct.stock_quantity || (selectedProduct as any).current_stock || 0
      if (quantity > currentStock) {
        message.error(`出库数量不能大于当前库存 ${currentStock}，库存不足，出库失败`)
        return
      }

      // 验证SN码（必填）
      if (!values.serial_numbers || typeof values.serial_numbers !== 'string') {
        message.error('请填写SN码')
        return
      }

      const serialNumbers = values.serial_numbers
        .split(/\r?\n/)
        .map((sn: string) => sn.trim())
        .filter((sn: string) => sn)

      if (serialNumbers.length === 0) {
        message.error('请至少填写一个SN码')
        return
      }

      // 检查是否有重复的SN码
      const duplicates = serialNumbers.filter((sn: string, index: number) => serialNumbers.indexOf(sn) !== index)
      if (duplicates.length > 0) {
        const uniqueDuplicates = [...new Set(duplicates)]
        message.error(`SN码中有重复：${uniqueDuplicates.join(', ')}，请移除重复的SN码后重新提交`)
        return
      }

      // SN码数量与出库数量必须一致
      if (serialNumbers.length !== quantity) {
        message.error(`SN码数量(${serialNumbers.length})与出库数量(${quantity})不一致，请检查`)
        return
      }

      const invalidSNs: string[] = []
      const outboundSNs: string[] = []

      for (const sn of serialNumbers) {
        const res = await inventoryAPI.validateSerialNumber(sn, selectedProduct.id)
        if (res.success && res.data) {
          if (!res.data.exists) {
            invalidSNs.push(sn)
          } else if (res.data.isOutbound) {
            outboundSNs.push(sn)
          }
        }
      }

      if (invalidSNs.length > 0) {
        message.error(`以下SN码不存在：${invalidSNs.join(', ')}，请检查后重新输入`)
        return
      }

      if (outboundSNs.length > 0) {
        message.error(`以下SN码已出库，不可重复出库：${outboundSNs.join(', ')}，请移除这些SN码后重新提交`)
        return
      }

      if (!values.customer_id) {
        message.error('请选择客户')
        return
      }

      // 处理门店：支持选择已有门店或直接输入新门店名称
      let storeId: number | undefined = undefined
      let inputStoreName = values.store_name

      // 如果用户直接在下拉框中输入了文本（store_id 为字符串），也视为门店名称
      if (!inputStoreName && typeof values.store_id === 'string') {
        inputStoreName = values.store_id
      }

      if (inputStoreName && inputStoreName.trim()) {
        try {
          const storeRes = await customerAPI.createOrGetStore({
            customer_id: values.customer_id,
            store_name: inputStoreName.trim()
          })
          if (storeRes.success && storeRes.data) {
            storeId = storeRes.data.id
            // 更新表单中的store_id
            outboundForm.setFieldsValue({ store_id: storeId })
            // 如果门店列表中没有这个门店，添加到列表
            if (!customerStores.find(s => s.id === storeId)) {
              setCustomerStores([...customerStores, storeRes.data])
            }
          }
        } catch (error: any) {
          console.error('创建或获取门店失败:', error)
          message.error('门店处理失败: ' + (error?.message || '未知错误'))
          return
        }
      } else if (values.store_id && typeof values.store_id === 'number') {
        storeId = values.store_id
      }

      const result = await dispatch(adjustStock({
        product_id: selectedProduct.id,
        quantity: quantity,
        type: 'out',
        customer_id: values.customer_id,
        store_id: storeId,
        location: values.location,
        notes: values.notes,
        serial_numbers: serialNumbers,
        outbound_price: values.outbound_price ? Number(values.outbound_price) : undefined,
        created_by: user?.id
      })).unwrap()

      message.success('出库成功')
      setOutboundModalVisible(false)
      outboundForm.resetFields()
      setSelectedProduct(null)
      setSelectedCustomerId(undefined)
      setCustomerStores([])
      setOutboundBatchNumbers([])
      // 刷新商品列表以获取最新库存
      await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
      // 如果当前在批次管理页面，刷新批次列表以更新SN码状态
      if (activeTab === 'batches') {
        loadBatches()
      }
    } catch (error: any) {
      message.error(error?.message || '出库失败')
    }
  }

  // ========== 盘点功能 ==========
  const handleCheck = (product: Product) => {
    setSelectedProduct(product)
    // 获取当前库存，优先使用 stock_quantity，然后是 current_stock
    const currentStock = product.stock_quantity !== undefined && product.stock_quantity !== null
      ? product.stock_quantity
      : ((product as any).current_stock !== undefined && (product as any).current_stock !== null
        ? (product as any).current_stock
        : 0)

    console.log('盘点商品:', {
      productId: product.id,
      productName: product.name,
      stock_quantity: product.stock_quantity,
      current_stock: (product as any).current_stock,
      calculatedStock: currentStock
    })

    // 确保 currentStock 是数字类型
    const stockValue = Number(currentStock) || 0

    // 先打开弹窗，然后设置表单值，确保表单已渲染
    setCheckModalVisible(true)

    // 使用 setTimeout 确保在弹窗完全打开后再设置表单值
    setTimeout(() => {
      // 重置表单并清除所有验证错误
      checkForm.resetFields()
      // 清除所有字段的错误状态
      checkForm.setFields([
        { name: 'actual_stock', errors: [] },
        { name: 'serial_numbers', errors: [] }
      ])

      // 设置表单值
      checkForm.setFieldsValue({
        product_id: product.id,
        product_name: product.name,
        current_stock: stockValue,
        actual_stock: stockValue,
        difference: 0,
        notes: '',
        location: '',
        batch_number: '',
        serial_numbers: ''
      })
    }, 100)
  }

  const handleCheckSubmit = async () => {
    try {
      // 先触发表单验证，确保所有字段值都已同步
      await checkForm.validateFields()

      // 获取表单值，确保获取到最新的值
      const values = checkForm.getFieldsValue()
      if (!selectedProduct) return

      // 检查是否输入了SN码
      const serialNumbersText = values.serial_numbers || ''
      const serialNumbers = serialNumbersText
        .split('\n')
        .map((sn: string) => sn.trim())
        .filter((sn: string) => sn)

      if (serialNumbers.length === 0) {
        message.error('请输入SN码进行盘点')
        checkForm.setFields([{
          name: 'serial_numbers',
          errors: ['请输入SN码进行盘点']
        }])
        return
      }

      // 检查本次提交的SN码是否有重复
      const duplicateInBatch = serialNumbers.filter((sn: string, index: number) => serialNumbers.indexOf(sn) !== index)
      if (duplicateInBatch.length > 0) {
        message.error(`本次提交的SN码中有重复：${[...new Set(duplicateInBatch)].join(', ')}`)
        return
      }

      // 处理批次号（自动生成或使用用户输入的）
      let batchNumber = values.batch_number
      if (!batchNumber || !batchNumber.trim()) {
        const batchResponse = await inventoryAPI.generateBatchNumber()
        if (batchResponse.success && batchResponse.data) {
          batchNumber = batchResponse.data
        } else {
          message.error('生成批次号失败，请手动输入批次号')
          return
        }
      }

      // 调用盘点API
      const result = await inventoryAPI.performInventoryCheck(
        selectedProduct.id,
        serialNumbers,
        batchNumber.trim(),
        values.location,
        values.notes ? `盘点调整: ${values.notes}` : '盘点调整',
        user?.id
      )

      if (result.success) {
        message.success(`盘点完成：成功盘点 ${serialNumbers.length} 个SN码`)
      // 清除表单状态和验证错误
      checkForm.resetFields()
      checkForm.setFields([
          { name: 'actual_stock', errors: [] },
          { name: 'serial_numbers', errors: [] }
      ])
      setCheckModalVisible(false)
      setSelectedProduct(null)
      // 刷新商品列表以获取最新库存
      await dispatch(fetchProducts({ page: currentPage, pageSize: pageSize === 1 ? 20 : pageSize }))
        // 如果当前在批次管理页面，刷新批次列表
        if (activeTab === 'batches') {
          loadBatches()
        }
      } else {
        message.error(result.error || '盘点失败')
      }
    } catch (error: any) {
      console.error('盘点失败:', error)
      message.error(error?.message || '盘点失败')
    }
  }

  // ========== 根据路由渲染不同的内容 ==========
  if (isInbound) {
    // 入库视图
    const inboundColumns = [
      {
        title: '商品名称',
        dataIndex: 'name',
        key: 'name',
        width: '20%',
        align: 'center' as const,
        render: (text: string) => <span style={{ fontWeight: 500, fontSize: 16 }}>{text}</span>
      },
      {
        title: 'SKU',
        dataIndex: 'sku',
        key: 'sku',
        width: '15%',
        align: 'center' as const,
      },
      {
        title: '当前库存',
        key: 'stock',
        width: '12%',
        align: 'center' as const,
        render: (_: any, record: Product) => {
          const stock = record.stock_quantity || 0
          return <span style={{ fontWeight: 500 }}>{stock}</span>
        }
      },
      {
        title: '分类',
        dataIndex: 'category_name',
        key: 'category',
        width: '16%',
        align: 'center' as const,
        render: (categoryName: string) => <Tag color="blue">{categoryName || '未分类'}</Tag>
      },
      {
        title: '操作',
        key: 'action',
        width: '15%',
        fixed: 'right' as const,
        align: 'center' as const,
        render: (_: any, record: Product) => (
          <Button
            type="primary"
            icon={<ArrowUpOutlined />}
            onClick={() => handleInbound(record)}
            title="入库"
          />
        )
      }
    ]

    return (
      <div className="page-transition">
        <Card
          title="商品入库"
          extra={
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setBatchInboundModalVisible(true)}
              >
                批量入库
              </Button>
              <Button
                type="link"
                icon={<HistoryOutlined />}
                onClick={() => setLogModalVisible(true)}
                style={{ boxShadow: '0 0 1px 0 black', borderRadius: '5px' }}
              >
                查看操作日志
              </Button>
            </Space>
          }
        >
          <Table
            columns={inboundColumns}
            dataSource={products}
            loading={loading}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            onChange={handleTableChange}
          />
        </Card>

        <Modal
          title="商品入库"
          open={inboundModalVisible}
          onOk={handleInboundSubmit}
          onCancel={() => {
            // 清除表单状态和验证错误
            inboundForm.resetFields()
            inboundForm.setFields([
              { name: 'quantity', errors: [] }
            ])
            setInboundModalVisible(false)
            setSelectedProduct(null)
          }}
          width={800}
          confirmLoading={loading}
          destroyOnHidden={true}
        >
          <Form form={inboundForm} layout="vertical">
            <Form.Item label="商品名称" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input value={selectedProduct?.name + ' (' + selectedProduct?.sku + ')'} disabled />
            </Form.Item>
            <Form.Item label="当前库存" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <InputNumber value={selectedProduct?.stock_quantity || (selectedProduct as any)?.current_stock || 0} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="存放位置" name="location" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input placeholder="请输入存放位置（可选）" />
            </Form.Item>
            <Form.Item 
              label="入库数量"
              name="quantity"
              style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
              getValueFromEvent={(value) => {
                // 确保值正确转换，处理 null/undefined 的情况
                return value === null || value === undefined ? undefined : Number(value)
              }}
              rules={[
                {
                  validator(_, value) {
                    // 如果输入了SN码，数量字段可以为空
                    const serialNumbers = inboundForm.getFieldValue('serial_numbers') || ''
                    const hasSerialNumbers = serialNumbers.trim().split('\n').filter((sn: string) => sn.trim()).length > 0

                    if (hasSerialNumbers) {
                      // 如果输入了SN码，数量字段可以为空
                      return Promise.resolve()
                    }
                    const quantity = Number(value)
                    if (isNaN(quantity) || quantity <= 0) {
                      return Promise.reject(new Error('入库数量必须大于0'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber
                disabled
                min={1}
                placeholder="(填写SN码自动计算数量)"
                style={{ width: '100%' }}
                precision={0}
                onChange={(value) => {
                  // 确保表单字段值被正确更新
                  const numValue = value === null || value === undefined ? undefined : Number(value)
                  inboundForm.setFieldsValue({ quantity: numValue })
                  // 触发验证，检查SN码字段
                  inboundForm.validateFields(['serial_numbers'])
                }}
              />
            </Form.Item>

            <Form.Item label="批次号" name="batch_number">
              <Input placeholder="请输入批次号（为空则自动生成）" />
            </Form.Item>
            <Form.Item
              label="SN码（每行一个，可选）"
              name="serial_numbers"
              help="输入SN码时，每个SN码将作为数量为1的独立入库记录。输入SN码后，入库数量会自动计算。"
              rules={[
                {
                  validator(_, value) {
                    // 检查是否包含中文字符
                    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(value)
                    if (hasChinese) {
                      return Promise.reject(new Error('SN码不支持中文输入，请移除中文字符'))
                    }

                    const serialNumbers = value.trim().split('\n').filter((sn: string) => sn.trim())
                    if (serialNumbers.length === 0) {
                      return Promise.reject(new Error('请输入至少一个SN码'))
                    }

                    return Promise.resolve()
                  },
                },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="请输入SN码，每行一个。输入SN码后，入库数量会自动计算。SN码不支持中文输入。"
                onChange={(e) => {
                  const originalValue = e.target.value || ''
                  // 过滤中文字符
                  const filteredValue = filterChineseCharacters(originalValue)

                  // 如果过滤后的值与原值不同，说明有中文字符被移除，需要提示并更新输入框
                  if (filteredValue !== originalValue) {
                    message.warning('SN码不支持中文输入，已自动移除中文字符')
                    // 更新输入框的值
                    e.target.value = filteredValue
                  }

                  inboundForm.setFieldsValue({ serial_numbers: filteredValue })

                  // 自动计算SN码数量并更新到quantity字段
                  const serialNumbers = filteredValue
                    .split('\n')
                    .map((sn: string) => sn.trim())
                    .filter((sn: string) => sn)

                  if (serialNumbers.length > 0) {
                    // 如果输入了SN码，自动设置数量为SN码的数量
                    inboundForm.setFieldsValue({ quantity: serialNumbers.length })
                  } else {
                    // 如果清空了SN码，清空数量字段
                    inboundForm.setFieldsValue({ quantity: undefined })
                  }

                  // 触发验证，检查数量字段
                  inboundForm.validateFields(['quantity'])
                }}
                onKeyDown={(e) => {
                  // 阻止全局快捷键/拦截，保证回车、空格、逗号等可以正常输入
                  e.stopPropagation()
                }}
              />
            </Form.Item>
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={3} placeholder="请输入备注（可选）" />
            </Form.Item>
          </Form>
        </Modal>

        {/* 批量入库模态框 */}
        <Modal
          title="批量入库（SN码）"
          open={batchInboundModalVisible}
          onOk={handleBatchInboundSubmit}
          onCancel={() => {
            setBatchInboundModalVisible(false)
            batchInboundForm.resetFields()
            setBatchInboundProducts([])
          }}
          width={900}
          confirmLoading={loading}
        >
          <Form form={batchInboundForm} layout="vertical">
            <Form.Item label="选择商品" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Select
                mode="multiple"
                placeholder="请选择要入库的商品"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                value={batchInboundProducts.map(p => p.product_id)}
                onChange={(productIds) => {
                  const selectedProducts = products.filter(p => productIds.includes(p.id))
                  setBatchInboundProducts(selectedProducts.map(p => ({
                    product_id: p.id,
                    product_name: p.name,
                    product_sku: p.sku,
                    serial_numbers: []
                  })))
                }}
                options={products.map(product => ({
                  label: `${product.name} (${product.sku})`,
                  value: product.id
                }))}
              />
            </Form.Item>
            <Form.Item label="存放位置" name="location" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input placeholder="请输入存放位置（可选）" />
            </Form.Item>
            <Form.Item label="批次号" name="batch_number" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input placeholder="请输入批次号（可选）" />
            </Form.Item>
            <Form.Item label="备注" name="notes" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input.TextArea rows={2} placeholder="请输入备注（可选）" style={{ width: '100%', height: '0' }} />
            </Form.Item>

            {batchInboundProducts.length > 0 && (
              <Form.Item label="输入SN码（每行一个）">
                <div style={{ maxHeight: '400px', overflowY: 'auto', width: '45%', display: 'inline-block' }}>
                  {batchInboundProducts.map((productItem, index) => (
                    <div key={productItem.product_id} style={{ marginBottom: 16, padding: 12, border: '1px solid #f0f0f0', borderRadius: 4 }}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>
                        {productItem.product_name} ({productItem.product_sku})
                      </div>
                      <TextArea
                        rows={4}
                        placeholder={`请输入${productItem.product_name}的SN码，每行一个（不支持中文）`}
                        onChange={(e) => {
                          const originalValue = e.target.value || ''
                          // 过滤中文字符
                          const filteredValue = filterChineseCharacters(originalValue)

                          // 如果过滤后的值与原值不同，说明有中文字符被移除，需要提示并更新输入框
                          if (filteredValue !== originalValue) {
                            message.warning('SN码不支持中文输入，已自动移除中文字符')
                            // 更新输入框的值
                            e.target.value = filteredValue
                          }

                          // 只按「换行」分隔 SN 码，保证空格、逗号等字符可以正常输入和保留
                          const snCodes = filteredValue
                            .split('\n')
                            .map(sn => sn.trim())
                            .filter(sn => sn)
                          const updated = [...batchInboundProducts]
                          updated[index] = { ...updated[index], serial_numbers: snCodes }
                          setBatchInboundProducts(updated)
                        }}
                        onKeyDown={(e) => {
                          // 阻止全局快捷键/拦截，保证回车、空格、逗号等可以正常输入
                          e.stopPropagation()
                        }}
                      />
                      <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                        已输入 {productItem.serial_numbers.length} 个SN码
                      </div>
                    </div>
                  ))}
                </div>
              </Form.Item>
            )}
          </Form>
        </Modal>

        <ActivityLogModal
          visible={logModalVisible}
          onCancel={() => setLogModalVisible(false)}
          filters={{
            table_name: 'inventory',
            operation_type: 'inbound'
          }}
        />
      </div>
    )
  }

  if (isOutbound) {
    // 出库视图
    const outboundColumns = [
      {
        title: '商品名称',
        dataIndex: 'name',
        key: 'name',
        width: '20%',
        align: 'center' as const,
        render: (text: string) => <span style={{ fontWeight: 500, fontSize: 16 }}>{text}</span>
      },
      {
        title: 'SKU',
        dataIndex: 'sku',
        key: 'sku',
        width: '15%',
        align: 'center' as const,
      },
      {
        title: '当前库存',
        key: 'stock',
        width: '12%',
        align: 'center' as const,
        render: (_: any, record: Product) => {
          const stock = record.stock_quantity || 0
          const stockStatus = getStockStatus(record)
          return (
            <span style={{ color: stockStatus.color, fontWeight: 500 }}>{stock}</span>
          )
        }
      },
      {
        title: '分类',
        dataIndex: 'category_name',
        key: 'category',
        width: '15%',
        align: 'center' as const,
        render: (categoryName: string) => <Tag color="blue">{categoryName || '未分类'}</Tag>
      },
      {
        title: '操作',
        key: 'action',
        width: '15%',
        fixed: 'right' as const,
        align: 'center' as const,
        render: (_: any, record: Product) => (
          <Button
            type="primary"
            danger
            icon={<ArrowDownOutlined />}
            onClick={() => handleOutbound(record)}
            disabled={!(record.stock_quantity || (record as any).current_stock) || (record.stock_quantity || (record as any).current_stock || 0) <= 0}
            title="出库"
          />
        )
      }
    ]

    return (
      <div className="page-transition">
        <Card
          title="商品出库"
          extra={
            <Space>
              <Button
                type="primary"
                onClick={() => setBatchOutboundModalVisible(true)}
              >
                批量出库
              </Button>
              <Button
                type="link"
                icon={<HistoryOutlined />}
                onClick={() => setOutboundRecordsModalVisible(true)}
                style={{ boxShadow: '0 0 1px 0 black', borderRadius: '5px' }}
              >
                查看出库记录
              </Button>
            </Space>
          }
        >
          <Table
            columns={outboundColumns}
            dataSource={products}
            loading={loading}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            onChange={handleTableChange}
          />
        </Card>

        <Modal
          title="商品出库"
          open={outboundModalVisible}
          onOk={handleOutboundSubmit}
          onCancel={() => {
            setOutboundModalVisible(false)
            outboundForm.resetFields()
            setSelectedProduct(null)
            setSelectedCustomerId(undefined)
            setCustomerStores([])
            setOutboundBatchNumbers([])
          }}
          width={900}
          confirmLoading={loading}
        >
          <Form form={outboundForm} layout="vertical">
            <Form.Item label="商品名称" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input value={selectedProduct?.name + ' (' + selectedProduct?.sku + ')'} disabled />
            </Form.Item>
            <Form.Item label="当前库存" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <InputNumber value={selectedProduct?.stock_quantity || (selectedProduct as any)?.current_stock || 0} disabled style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="出库数量（自动计算）"
              style={{ width: '35%', display: 'inline-block', marginRight: '10px' }}
              name="quantity"
              rules={[
                { required: true, message: '出库数量不能为空' },
                {
                  validator(_, value) {
                    // InputNumber 返回 null 或 undefined 时表示未输入
                    if (value === null || value === undefined) {
                      return Promise.reject(new Error('出库数量不能为空，请先填写SN码'))
                    }
                    const quantity = Number(value)
                    if (isNaN(quantity) || quantity <= 0) {
                      return Promise.reject(new Error('出库数量必须大于0'))
                    }
                    const currentStock = selectedProduct?.stock_quantity || (selectedProduct as any)?.current_stock || 0
                    if (quantity > currentStock) {
                      return Promise.reject(new Error(`出库数量不能大于当前库存 ${currentStock}，库存不足，出库失败`))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber
                min={1}
                placeholder="自动根据SN码数量计算"
                style={{ width: '100%' }}
                precision={0}
                disabled
              />
            </Form.Item>
            <Form.Item
              label="商品售价"
              style={{ width: '15%', display: 'inline-block', marginRight: '10px' }}
              name="outbound_price"
              rules={[
                { required: false },
                { type: 'number', min: 0, message: '售价不能为负数' }
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                precision={2}
                min={0}
                placeholder="请输入出库售价"
                formatter={(value) => value ? `¥ ${value}` : ''}
                parser={(value) => (value ? value.replace(/¥\s?|(,*)/g, '') : '') as any}
              />
            </Form.Item>
            <Form.Item
              label="小计金额"
              style={{ width: '20%', display: 'inline-block', marginRight: '10px',marginLeft: '20px'}}
              dependencies={['outbound_price', 'quantity']}
            >
              {({ getFieldValue }) => {
                const price = getFieldValue('outbound_price') || 0
                const quantity = getFieldValue('quantity') || 0
                const subtotal = Number(price) * Number(quantity)
                return (
                  <div style={{ fontSize: 18, fontWeight: 500, color: '#1890ff' }}>
                    ¥ {subtotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  </div>
                )
              }}
            </Form.Item>
            <Form.Item
              label="总计金额"
              style={{ width: '22%', display: 'inline-block', marginRight: '10px' }}
              dependencies={['outbound_price', 'quantity']}
            >
              {({ getFieldValue }) => {
                const price = getFieldValue('outbound_price') || 0
                const quantity = getFieldValue('quantity') || 0
                const total = Number(price) * Number(quantity)
                return (
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#ff4d4f' }}>
                    ¥ {total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  </div>
                )
              }}
            </Form.Item>
            <Form.Item
              label="客户"
              name="customer_id"
              rules={[{ required: true, message: '请选择客户' }]}
              style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
            >
              <Select
                placeholder="请选择客户"
                showSearch
                allowClear
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                onChange={handleCustomerChange}
                options={customers.map(customer => ({
                  label: customer.name,
                  value: customer.id
                }))}
              />
            </Form.Item>
            <Form.Item
              label="门店"
              name="store_id"
              dependencies={['customer_id']}
              rules={[{ required: true, message: '请选择门店或输入新门店名称' }]}
              style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
            >
              <Select
                placeholder="请选择门店或输入新门店名称"
                showSearch
                allowClear
                onClear={() => {
                  outboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
                }}
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                notFoundContent={null}
                options={buildStoreOptions(outboundForm, customerStores)}
                onSearch={(value) => {
                  // 保留用户输入，避免失焦后被 onSearch('') 清空
                  if (value) {
                    outboundForm.setFieldsValue({ store_id: value, store_name: value })
                  }
                }}
                onChange={(value) => {
                  const matchedStore = customerStores.find(s => String(s.id) === String(value))
                  if (matchedStore) {
                    outboundForm.setFieldsValue({ store_id: matchedStore.id, store_name: undefined })
                  } else if (typeof value === 'string' && value) {
                    outboundForm.setFieldsValue({ store_id: value, store_name: value })
                  } else {
                    outboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
                  }
                }}
              />
            </Form.Item>
            <Form.Item name="store_name" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
              label="SN码（必填，每行一个）"
              name="serial_numbers"
              rules={[
                { required: true, message: '请填写SN码' },
                {
                  validator(_, value) {
                    if (!value || typeof value !== 'string') {
                      return Promise.reject(new Error('请填写SN码'))
                    }

                    // 检查是否包含中文字符
                    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(value)
                    if (hasChinese) {
                      return Promise.reject(new Error('SN码不支持中文输入，请移除中文字符'))
                    }

                    const lines = value.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line)
                    if (lines.length === 0) {
                      return Promise.reject(new Error('请至少填写一个SN码'))
                    }

                    // 检查是否有重复的SN码
                    const duplicates = lines.filter((sn: string, index: number) => lines.indexOf(sn) !== index)
                    if (duplicates.length > 0) {
                      const uniqueDuplicates = [...new Set(duplicates)]
                      return Promise.reject(new Error(`SN码中有重复：${uniqueDuplicates.join(', ')}，请移除重复的SN码`))
                    }

                    return Promise.resolve()
                  },
                },
              ]}
            >
              <Input.TextArea
                rows={4}
                placeholder="请输入SN码，每行一个。系统将自动计算出库数量（不支持中文）"
                onChange={async (e) => {
                  const originalValue = e.target.value
                  // 过滤中文字符
                  const filteredValue = filterChineseCharacters(originalValue)

                  // 如果过滤后的值与原值不同，说明有中文字符被移除，需要提示并更新输入框
                  if (filteredValue !== originalValue) {
                    message.warning('SN码不支持中文输入，已自动移除中文字符')
                    // 更新输入框的值
                    e.target.value = filteredValue
                  }

                  const lines = filteredValue.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line)

                  // 检查是否有重复的SN码
                  const duplicates = lines.filter((sn: string, index: number) => lines.indexOf(sn) !== index)
                  if (duplicates.length > 0) {
                    const uniqueDuplicates = [...new Set(duplicates)]
                    message.warning(`检测到重复的SN码：${uniqueDuplicates.join(', ')}，请移除重复项`)
                  }

                  // 自动计算出库数量
                  if (lines.length > 0) {
                    outboundForm.setFieldsValue({ quantity: lines.length, serial_numbers: filteredValue })
                  } else {
                    outboundForm.setFieldsValue({ quantity: undefined, serial_numbers: filteredValue })
                    // 如果SN码为空，清空批次号
                    setOutboundBatchNumbers([])
                  }
                }}
                onBlur={async (e) => {
                  // 当SN码输入完成（失焦）时，根据SN码获取批次号
                  const value = e.target.value || ''
                  const filteredValue = filterChineseCharacters(value)
                  const lines = filteredValue.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line)

                  if (lines.length > 0 && selectedProduct) {
                    try {
                      const batchNumbers = await getBatchNumbersBySerialNumbers(lines, selectedProduct.id)
                      setOutboundBatchNumbers(batchNumbers)
                    } catch (error) {
                      console.error('获取批次号失败:', error)
                      setOutboundBatchNumbers([])
                    }
                  } else {
                    setOutboundBatchNumbers([])
                  }
                }}
              />
            </Form.Item>
            {outboundBatchNumbers.length > 0 && (
              <Form.Item label="批次号" help="根据输入的SN码自动识别">
                <div>
                  {outboundBatchNumbers.map((bn, index) => (
                    <Tag key={index} color="blue" style={{ marginBottom: 4, marginRight: 4 }}>{bn}</Tag>
                  ))}
                </div>
              </Form.Item>
            )}

            <Form.Item label="存放位置" name="location" >
              <Input placeholder="请输入存放位置（可选）" />
            </Form.Item>
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={3} placeholder="请输入备注（可选）" />
            </Form.Item>
          </Form>
        </Modal>

        {/* 出库记录模态框 */}
        <Modal
          title="出库记录"
          open={outboundRecordsModalVisible}
          onCancel={() => setOutboundRecordsModalVisible(false)}
          footer={null}
          width={1400}
        >
          <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Select
                style={{ width: 200 }}
                placeholder="按客户筛选"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                value={outboundRecordsCustomerFilter}
                onChange={(value) => {
                  setOutboundRecordsCustomerFilter(value)
                  loadOutboundRecords(1, outboundRecordsPageSize, value, outboundRecordsDateRange)
                }}
                options={customers.map(customer => ({
                  label: customer.name,
                  value: customer.id
                }))}
              />
              <RangePicker
                showTime={{
                  format: 'HH:mm:ss',
                  defaultValue: [
                    dayjs('00:00:00', 'HH:mm:ss'),  // 开始日期默认时分秒
                    dayjs('23:59:59', 'HH:mm:ss')   // 结束日期默认时分秒
                  ]
                }}
                format="YYYY-MM-DD HH:mm:ss"
                value={outboundRecordsDateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    let start = dates[0]
                    let end = dates[1]
                    
                    // 检查开始日期：如果时分秒为0，设置为当天的开始时间
                    if (start.hour() === 0 && start.minute() === 0 && start.second() === 0) {
                      start = start.startOf('day')
                    }
                    
                    // 检查结束日期：如果时分秒为0，说明用户只选择了日期，设置默认值
                    if (end.hour() === 0 && end.minute() === 0 && end.second() === 0) {
                      end = end.endOf('day')  // 设置为 23:59:59
                    }
                    
                    const adjustedDates: [dayjs.Dayjs, dayjs.Dayjs] = [start, end]
                    setOutboundRecordsDateRange(adjustedDates)
                    loadOutboundRecords(1, outboundRecordsPageSize, outboundRecordsCustomerFilter, adjustedDates)
                  } else {
                    setOutboundRecordsDateRange(null)
                    loadOutboundRecords(1, outboundRecordsPageSize, outboundRecordsCustomerFilter, null)
                  }
                }}
                placeholder={['开始日期', '结束日期']}
              />
            </Space>
            <Button onClick={() => loadOutboundRecords(outboundRecordsPage, outboundRecordsPageSize, outboundRecordsCustomerFilter, outboundRecordsDateRange)}>
              刷新
            </Button>
          </Space>
          <Table
            columns={[
              {
                title: '商品名称',
                dataIndex: 'product_name',
                key: 'product_name',
                width: '20%',
                align: 'center' as const,
              },
              {
                title: '批次号',
                dataIndex: 'batch_number',
                key: 'batch_number',
                width: '20%',
                align: 'center' as const,
              },
              {
                title: '客户',
                dataIndex: 'customer_name',
                key: 'customer_name',
                width: '15%',
                align: 'center' as const,
              },
              {
                title: '门店',
                dataIndex: 'store_name',
                key: 'store_name',
                width: '15%',
                align: 'center',
                render: (text: string) => text || '-',
              },
              {
                title: '数量',
                dataIndex: 'quantity',
                key: 'quantity',
                width: '10%',
                align: 'center' as const,
              },
              {
                title: '单价',
                dataIndex: 'outbound_price',
                key: 'outbound_price',
                width: '15%',
                align: 'center',
                render: (price: number) => price ? `¥ ${Number(price).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '-'
              },
              {
                title: '小计',
                key: 'subtotal',
                width: '15%',
                align: 'center',
                render: (_: any, record: any) => {
                  const price = record.outbound_price || 0
                  const quantity = record.quantity || 0
                  const subtotal = Number(price) * Number(quantity)
                  return (
                    <span style={{ fontWeight: 500 }}>
                      ¥ {subtotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    </span>
                  )
                }
              },
              {
                title: '出库日期',
                dataIndex: 'outbound_date',
                key: 'outbound_date',
                width: '20%',
                align: 'center',
                render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-'
              },
              {
                title: '备注',
                dataIndex: 'notes',
                key: 'notes',
                ellipsis: true,
                align: 'center',
                width: '20%',
              }
            ]}
            dataSource={outboundRecords}
            loading={outboundRecordsLoading}
            rowKey="id"
            pagination={{
              current: outboundRecordsPage,
              pageSize: outboundRecordsPageSize,
              total: outboundRecordsTotal,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
              onChange: (page, size) => {
                setOutboundRecordsPage(page)
                setOutboundRecordsPageSize(size)
                loadOutboundRecords(page, size, outboundRecordsCustomerFilter, outboundRecordsDateRange)
              }
            }}
            summary={() => {
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6} align="right">
                      <span style={{ fontSize: 16, fontWeight: 600 }}>总计金额（筛选后）：</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#ff4d4f' }}>
                        ¥ {outboundRecordsTotalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} colSpan={3} />
                  </Table.Summary.Row>
                </Table.Summary>
              )
            }}
          />
        </Modal>

        {/* 批量出库模态框 */}
        <Modal
          title="批量出库"
          open={batchOutboundModalVisible}
          onOk={handleBatchOutboundSubmit}
          onCancel={() => {
            setBatchOutboundModalVisible(false)
            batchOutboundForm.resetFields()
            setBatchOutboundProducts([])
            setCustomerStores([])
          }}
          width={1200}
          confirmLoading={loading}
        >
          <Form form={batchOutboundForm} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="客户"
                  name="customer_id"
                  rules={[{ required: true, message: '请选择客户' }]}
                >
                  <Select
                    placeholder="请选择客户"
                    showSearch
                    allowClear
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={handleBatchCustomerChange}
                    options={customers.map(customer => ({
                      label: customer.name,
                      value: customer.id
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="门店"
                  name="store_id"
                  dependencies={['customer_id']}
                  rules={[{ required: true, message: '请选择门店或输入新门店名称' }]}
                >
                  <Select
                    placeholder="请选择门店或输入新门店名称"
                    showSearch
                    allowClear
                    onClear={() => {
                      batchOutboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
                    }}
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    notFoundContent={null}
                    options={buildStoreOptions(batchOutboundForm, customerStores)}
                    onSearch={(value) => {
                      // 保留用户输入，避免失焦后被 onSearch('') 清空
                      if (value) {
                        batchOutboundForm.setFieldsValue({ store_id: value, store_name: value })
                      }
                    }}
                    onChange={(value) => {
                      const matchedStore = customerStores.find(s => String(s.id) === String(value))
                      if (matchedStore) {
                        batchOutboundForm.setFieldsValue({ store_id: matchedStore.id, store_name: undefined })
                      } else if (typeof value === 'string' && value) {
                        batchOutboundForm.setFieldsValue({ store_id: value, store_name: value })
                      } else {
                        batchOutboundForm.setFieldsValue({ store_id: undefined, store_name: undefined })
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item name="store_name" hidden>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="存放位置" name="location">
                  <Input placeholder="请输入存放位置（可选）" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="备注" name="notes">
                  <Input placeholder="请输入备注（可选）" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="选择商品" >
              <Select
                mode="multiple"
                placeholder="请选择要出库的商品"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
                value={batchOutboundProducts.map(p => p.product_id)}
                onChange={(productIds) => {
                  type ProductWithStock = Product & { stock_quantity?: number; current_stock?: number }
                  const selectedProducts = (products as ProductWithStock[]).filter(p => productIds.includes(p.id))

                  // 批次号将根据SN码动态获取，不在商品选择时获取
                  setBatchOutboundProducts(selectedProducts.map(p => ({
                    product_id: p.id,
                    product_name: p.name,
                    current_stock: p.stock_quantity ?? p.current_stock ?? 0,
                    quantity: undefined,
                    outbound_price: p.selling_price || (p as any).price || undefined,
                    serial_numbers: [], // SN码数组
                    serial_numbers_text: '', // SN码原始文本（保留换行）
                    batch_numbers: [] // 批次号数组（根据SN码动态获取）
                  })))
                }}
                options={products.map(product => {
                  const p = product as Product & { stock_quantity?: number; current_stock?: number }
                  return {
                    label: `${p.name} (库存: ${p.stock_quantity ?? p.current_stock ?? 0})`,
                    value: p.id
                  }
                })}
              />
            </Form.Item>
            {batchOutboundProducts.length > 0 && (
              <Form.Item label="商品明细">
                <Table
                  dataSource={batchOutboundProducts}
                  rowKey="product_id"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '商品名称',
                      dataIndex: 'product_name',
                      key: 'product_name',
                      width: 200,
                      align: 'center' as const,
                    },
                    {
                      title: '当前库存',
                      dataIndex: 'current_stock',
                      key: 'current_stock',
                      width: 100,
                      align: 'center' as const,
                    },
                    {
                      title: '出库数量',
                      key: 'quantity',
                      width: 150,
                      align: 'center' as const,
                      render: (_: any, record: any) => (
                        <InputNumber
                          disabled
                          min={1}
                          max={record.current_stock}
                          placeholder="数量"
                          value={record.quantity}
                          onChange={(value) => {
                            const updated = batchOutboundProducts.map(p =>
                              p.product_id === record.product_id
                                ? { ...p, quantity: value || undefined }
                                : p
                            )
                            setBatchOutboundProducts(updated)
                          }}
                          style={{ width: '100%' }}
                        />
                      )
                    },
                    {
                      title: '出库价格',
                      key: 'outbound_price',
                      width: 150,
                      align: 'center' as const,
                      render: (_: any, record: any) => {
                        const product = products.find(p => p.id === record.product_id)
                        const defaultPrice = product?.selling_price || (product as any)?.price || 0
                        return (
                          <InputNumber
                            min={0}
                            placeholder="价格"
                            value={record.outbound_price ?? defaultPrice}
                            onChange={(value) => {
                              const updated = batchOutboundProducts.map(p =>
                                p.product_id === record.product_id
                                  ? { ...p, outbound_price: value || undefined }
                                  : p
                              )
                              setBatchOutboundProducts(updated)
                            }}
                            style={{ width: '100%' }}
                            precision={2}
                            formatter={(value) => value ? `¥ ${value}` : ''}
                            parser={(value) => (value ? value.replace(/¥\s?|(,*)/g, '') : '') as any}
                          />
                        )
                      }
                    },
                    {
                      title: '批次号',
                      key: 'batch_numbers',
                      width: 150,
                      align: 'center' as const,
                      render: (_: any, record: any) => {
                        if (!record.batch_numbers || record.batch_numbers.length === 0) {
                          return <span>-</span>
                        }
                        return (
                          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, textAlign: 'left' }}>
                            {record.batch_numbers.map((bn: string, index: number) => (
                              <li key={index} style={{ marginBottom: 4 }}>{bn}</li>
                            ))}
                          </ul>
                        )
                      }
                    },
                    {
                      title: 'SN码',
                      key: 'serial_numbers',
                      width: 200,
                      align: 'center' as const,
                      render: (_: any, record: any) => {
                        const recordIndex = batchOutboundProducts.findIndex(p => p.product_id === record.product_id)
                        return (
                          <div>
                            <TextArea
                              rows={3}
                              placeholder={`请输入${record.product_name}的SN码，每行一个（不支持中文）`}
                              value={record.serial_numbers_text !== undefined ? record.serial_numbers_text : (record.serial_numbers?.join('\n') || '')}
                              onChange={(e) => {
                                const inputValue = e.target.value || ''
                                // 过滤中文字符
                                const filteredValue = filterChineseCharacters(inputValue)

                                // 如果过滤后的值与原值不同，说明有中文字符被移除，需要提示
                                if (filteredValue !== inputValue) {
                                  message.warning('SN码不支持中文输入，已自动移除中文字符')
                                }

                                // 保存完整的输入文本（包含换行），以便正确显示
                                // 只按「换行」分隔 SN 码，计算有效的SN码数组用于数量计算
                                const snCodes = filteredValue
                                  .split(/\r?\n/)
                                  .map(sn => sn.trim())
                                  .filter(sn => sn.length > 0) // 过滤掉空行

                                // 检查是否有重复的SN码
                                const duplicates = snCodes.filter((sn: string, index: number) => snCodes.indexOf(sn) !== index)
                                if (duplicates.length > 0) {
                                  const uniqueDuplicates = [...new Set(duplicates)]
                                  message.warning(`检测到重复的SN码：${uniqueDuplicates.join(', ')}，请移除重复项`)
                                }

                                // 根据SN码数量自动设置出库数量
                                const autoQuantity = snCodes.length > 0 ? snCodes.length : undefined

                                const updated = batchOutboundProducts.map(p => {
                                  if (p.product_id === record.product_id) {
                                    return {
                                      ...p,
                                      serial_numbers: snCodes, // 保存有效的SN码数组
                                      serial_numbers_text: filteredValue, // 保存完整的文本（包含换行）
                                      batch_numbers: [],
                                      quantity: autoQuantity // 自动根据SN码数量设置出库数量
                                    }
                                  }
                                  return p
                                })
                                setBatchOutboundProducts(updated)
                              }}
                              onCompositionEnd={(e) => {
                                // 处理中文输入法输入完成事件，确保中文字符被过滤
                                const inputValue = e.currentTarget.value || ''
                                const filteredValue = filterChineseCharacters(inputValue)
                                if (filteredValue !== inputValue) {
                                  const snCodes = filteredValue
                                    .split(/\r?\n/)
                                    .map(sn => sn.trim())
                                    .filter(sn => sn.length > 0)

                                  // 检查是否有重复的SN码
                                  const duplicates = snCodes.filter((sn: string, index: number) => snCodes.indexOf(sn) !== index)
                                  if (duplicates.length > 0) {
                                    const uniqueDuplicates = [...new Set(duplicates)]
                                    message.warning(`检测到重复的SN码：${uniqueDuplicates.join(', ')}，请移除重复项`)
                                  }

                                  const autoQuantity = snCodes.length > 0 ? snCodes.length : undefined
                                  const updated = batchOutboundProducts.map(p => {
                                    if (p.product_id === record.product_id) {
                                      return {
                                        ...p,
                                        serial_numbers: snCodes,
                                        serial_numbers_text: filteredValue,
                                        batch_numbers: [],
                                        quantity: autoQuantity
                                      }
                                    }
                                    return p
                                  })
                                  setBatchOutboundProducts(updated)
                                  message.warning('SN码不支持中文输入，已自动移除中文字符')
                                }
                              }}
                              onBlur={async (e) => {
                                // 当SN码输入完成（失焦）时，根据SN码获取批次号
                                const inputValue = e.target.value || ''
                                const filteredValue = filterChineseCharacters(inputValue)

                                // 解析SN码
                                const snCodes = filteredValue
                                  .split(/\r?\n/)
                                  .map(sn => sn.trim())
                                  .filter(sn => sn.length > 0)

                                if (snCodes.length > 0) {
                                  try {
                                    const batchNumbers = await getBatchNumbersBySerialNumbers(
                                      snCodes,
                                      record.product_id
                                    )
                                    setBatchOutboundProducts(prev =>
                                      prev.map(p =>
                                        p.product_id === record.product_id
                                          ? { ...p, batch_numbers: batchNumbers }
                                          : p
                                      )
                                    )
                                  } catch (error) {
                                    console.error('获取批次号失败:', error)
                                  }
                                } else {
                                  // 如果SN码为空，清空批次号
                                  setBatchOutboundProducts(prev =>
                                    prev.map(p =>
                                      p.product_id === record.product_id
                                        ? { ...p, batch_numbers: [] }
                                        : p
                                    )
                                  )
                                }
                              }}
                              onKeyDown={(e) => {
                                // 阻止全局快捷键/拦截，保证回车、空格、逗号等可以正常输入
                                e.stopPropagation()
                              }}
                              style={{ fontSize: 12 }}
                            />
                            <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                              已输入 {record.serial_numbers?.length || 0} 个SN码
                            </div>
                          </div>
                        )
                      }
                    },
                    {
                      title: '小计',
                      key: 'subtotal',
                      width: 150,
                      align: 'center' as const,
                      render: (_: any, record: any) => {
                        const price = record.outbound_price ?? (() => {
                          const product = products.find(p => p.id === record.product_id)
                          return product?.selling_price || (product as any)?.price || 0
                        })()
                        const quantity = record.quantity || 0
                        const subtotal = Number(price) * Number(quantity)
                        return (
                          <span style={{ fontWeight: 500 }}>
                            ¥ {subtotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          </span>
                        )
                      }
                    },
                    {
                      title: '操作',
                      key: 'action',
                      width: 80,
                      align: 'center' as const,
                      render: (_: any, record: any) => (
                        <Button
                          type="link"
                          danger
                          size="small"
                          onClick={() => {
                            setBatchOutboundProducts(batchOutboundProducts.filter(p => p.product_id !== record.product_id))
                          }}
                        >
                          删除
                        </Button>
                      )
                    }
                  ]}
                />
                {batchOutboundProducts.length > 0 && (
                  <Row justify="end" style={{ marginTop: 16, paddingRight: 8 }}>
                    <Col>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        总计金额：¥ {
                          batchOutboundProducts.reduce((total, record) => {
                            const price = record.outbound_price ?? (() => {
                              const product = products.find(p => p.id === record.product_id)
                              return product?.selling_price || (product as any)?.price || 0
                            })()
                            const quantity = record.quantity || 0
                            return total + (Number(price) * Number(quantity))
                          }, 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        }
                      </span>
                    </Col>
                  </Row>
                )}
              </Form.Item>
            )}
          </Form>
        </Modal>
      </div>
    )
  }

  if (isCheck) {
    // 盘点视图
    const checkColumns = [
      {
        title: '商品名称',
        dataIndex: 'name',
        key: 'name',
        width: '20%',
        align: 'center' as const,
        render: (text: string) => <span style={{ fontWeight: 500, fontSize: 16 }}>{text}</span>
      },
      {
        title: 'SKU',
        dataIndex: 'sku',
        key: 'sku',
        width: '15%',
        align: 'center' as const,
      },
      {
        title: '当前库存',
        key: 'stock',
        width: '12%',
        align: 'center' as const,
        render: (_: any, record: Product) => {
          const stock = record.stock_quantity || (record as any).current_stock || 0
          return <span style={{ fontWeight: 500 }}>{stock}</span>
        },
      },
      {
        title: '分类',
        dataIndex: 'category_name',
        key: 'category',
        width: '15%',
        align: 'center' as const,
        render: (categoryName: string) => <Tag color="blue">{categoryName || '未分类'}</Tag>
      },
      {
        title: '操作',
        key: 'action',
        width: '15%',
        fixed: 'right' as const,
        render: (_: any, record: Product) => (
          <Button
            type="primary"
            icon={<AdjustOutlined />}
            onClick={() => handleCheck(record)}
            title="盘点"
          />
        )
      }
    ]

    return (
      <div className="page-transition">
        <Card
          title="库存盘点"
          extra={
            <Button
              type="link"
              icon={<HistoryOutlined />}
              onClick={() => setLogModalVisible(true)}
              style={{ boxShadow: '0 0 1px 0 black', borderRadius: '5px' }}
            >
              查看操作日志
            </Button>
          }
        >
          <Table
            columns={checkColumns}
            dataSource={products}
            loading={loading}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            onChange={handleTableChange}
          />
        </Card>

        <Modal
          title="库存盘点"
          open={checkModalVisible}
          onOk={handleCheckSubmit}
          onCancel={() => {
            // 清除表单状态和验证错误
            checkForm.resetFields()
            checkForm.setFields([
              { name: 'actual_stock', errors: [] },
              { name: 'serial_numbers', errors: [] }
            ])
            setCheckModalVisible(false)
            setSelectedProduct(null)
          }}
          width={800}
          confirmLoading={loading}
          destroyOnHidden={true}
        >
          <Form form={checkForm} layout="vertical">
            <Form.Item label="商品名称" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input value={selectedProduct?.name + ' (' + selectedProduct?.sku + ')'} disabled />
            </Form.Item>
            <Form.Item
              label="系统库存"
              name="current_stock"
              style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
            >
              <InputNumber
                disabled
                style={{ width: '100%' }}
                min={0}
                precision={0}
                value={selectedProduct ? (selectedProduct.stock_quantity !== undefined && selectedProduct.stock_quantity !== null
                  ? selectedProduct.stock_quantity
                  : ((selectedProduct as any).current_stock !== undefined && (selectedProduct as any).current_stock !== null
                    ? (selectedProduct as any).current_stock
                    : 0)) : 0}
              />
            </Form.Item>
            <Form.Item label="批次号" name="batch_number" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input placeholder="请输入批次号（输入SN码时自动生成）" />
            </Form.Item>
            <Form.Item style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}
              label="实际库存"
              name="actual_stock"
              getValueFromEvent={(value) => {
                // 确保值正确转换，处理 null/undefined 的情况
                return value === null || value === undefined ? undefined : Number(value)
              }}
              rules={[
                { required: true, message: '请输入实际数量' },
                {
                  validator(_, value) {
                    // InputNumber 返回 null 或 undefined 时表示未输入
                    if (value === null || value === undefined) {
                      return Promise.reject(new Error('请输入实际数量'))
                    }
                    const stock = Number(value)
                    if (isNaN(stock)) {
                      return Promise.reject(new Error('请输入有效的库存数量'))
                    }
                    if (stock < 0) {
                      return Promise.reject(new Error('库存不能为负数'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber
                min={0}
                disabled
                placeholder="根据SN码自动计算"
                style={{ width: '100%' }}
                precision={0}
              />
            </Form.Item>
            <Form.Item label="存放位置" name="location" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <Input placeholder="请输入存放位置（可选）" />
            </Form.Item>
            <Form.Item label="差异数量" name="difference" style={{ width: '45%', display: 'inline-block', marginRight: '10px' }}>
              <InputNumber disabled style={{ width: '100%' }} value={0} />
            </Form.Item>
            <Form.Item
              label="SN码（每行一个）"
              name="serial_numbers"
              help="输入SN码时，每个SN码将作为数量为1的独立盘点记录。输入SN码后，盘点数量会自动计算。"
              rules={[
                {
                  validator(_, value) {
                    // 盘点必须输入SN码
                    if (!value || !value.trim()) {
                      return Promise.reject(new Error('请输入SN码进行盘点'))
                    }

                    // 检查是否包含中文字符
                    const hasChinese = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/.test(value)
                    if (hasChinese) {
                      return Promise.reject(new Error('SN码不支持中文输入，请移除中文字符'))
                    }

                    const serialNumbers = value.trim().split('\n').filter((sn: string) => sn.trim())
                    if (serialNumbers.length === 0) {
                      return Promise.reject(new Error('请输入至少一个SN码'))
                    }

                    return Promise.resolve()
                  },
                },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="请输入SN码，每行一个。输入SN码后，盘点数量会自动计算。SN码不支持中文输入。"
                onChange={(e) => {
                  const originalValue = e.target.value || ''
                  // 过滤中文字符
                  const filteredValue = filterChineseCharacters(originalValue)

                  // 如果过滤后的值与原值不同，说明有中文字符被移除，需要提示并更新输入框
                  if (filteredValue !== originalValue) {
                    message.warning('SN码不支持中文输入，已自动移除中文字符')
                    // 更新输入框的值
                    e.target.value = filteredValue
                  }

                  checkForm.setFieldsValue({ serial_numbers: filteredValue })

                  // 自动计算SN码数量并更新到actual_stock字段
                  const serialNumbers = filteredValue
                    .split('\n')
                    .map((sn: string) => sn.trim())
                    .filter((sn: string) => sn)

                  if (serialNumbers.length > 0) {
                    // 如果输入了SN码，自动设置数量为SN码的数量
                    const currentStock = checkForm.getFieldValue('current_stock') || 0
                    const difference = serialNumbers.length - currentStock
                    checkForm.setFieldsValue({
                      actual_stock: serialNumbers.length,
                      difference: difference
                    })
                  } else {
                    // 如果清空了SN码，清空数量字段
                    const currentStock = checkForm.getFieldValue('current_stock') || 0
                    checkForm.setFieldsValue({
                      actual_stock: currentStock,
                      difference: 0
                    })
                  }

                  // 触发验证
                  checkForm.validateFields(['actual_stock'])
                }}
                onKeyDown={(e) => {
                  // 阻止全局快捷键/拦截，保证回车、空格、逗号等可以正常输入
                  e.stopPropagation()
                }}
              />
            </Form.Item>
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={3} placeholder="请输入盘点备注（可选）" />
            </Form.Item>
          </Form>
        </Modal>

        <ActivityLogModal
          visible={logModalVisible}
          onCancel={() => setLogModalVisible(false)}
          filters={{
            table_name: isInbound ? 'inventory' : isOutbound ? 'inventory' : isCheck ? 'inventory' : 'products',
            operation_type: isInbound ? 'inbound' : isOutbound ? 'outbound' : isCheck ? 'inventory_check' : undefined
          }}
        />
      </div>
    )
  }

  // 默认显示商品列表
  // 批次管理表格列定义
  const batchColumns = [
    {
      title: '商品名称',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 150,
      render: (text: string, record: any) => (
        <div>
          <div style={{ fontWeight: 500 }}>{text}</div>
          <div style={{ fontSize: 12, color: '#999' }}>SKU: {record.product_sku}</div>
        </div>
      )
    },
    {
      title: '批次号',
      dataIndex: 'batch_number',
      key: 'batch_number',
      width: 150
    },
    {
      title: 'SN码数量',
      key: 'sn_count',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Tag color="blue">{record.sn_items?.length || 0}</Tag>
      )
    },
    {
      title: '存放位置',
      dataIndex: 'location',
      key: 'location',
      width: 120,
      render: (text: string) => text || '-'
    },
    {
      title: '入库日期',
      dataIndex: 'inbound_date',
      key: 'inbound_date',
      width: 110,
      align: 'center' as const,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '过期日期',
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      width: 120,
      align: 'center' as const,
      render: (text: string) => {
        if (!text) return '-'
        const expiry = dayjs(text)
        const daysUntilExpiry = expiry.diff(dayjs(), 'day')
        if (daysUntilExpiry < 0) {
          return <Tag color="red">已过期 ({Math.abs(daysUntilExpiry)}天)</Tag>
        } else if (daysUntilExpiry <= 30) {
          return <Tag color="orange">即将过期 ({daysUntilExpiry}天)</Tag>
        }
        return dayjs(text).format('YYYY-MM-DD')
      }
    }
  ]

  // SN码商品表格列定义（含出库状态和出库日期）
  const snItemColumns = [
    {
      title: 'SN码',
      dataIndex: 'serial_number',
      key: 'serial_number',
      width: 200,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'center' as const
    },
    {
      title: '入库日期',
      dataIndex: 'inbound_date',
      key: 'inbound_date',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '出库日期',
      dataIndex: 'outbound_date',
      key: 'outbound_date',
      width: 160,
      render: (text: string | undefined | null) =>
        text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center' as const,
      render: (status: 'out' | 'in' | undefined, record: any) => {
        const handleStatusClick = async (e: React.MouseEvent) => {
          // 阻止事件冒泡，避免被Table行点击事件拦截
          e.stopPropagation()
          e.preventDefault()

          console.log('点击状态标签，record:', record)

          // 从记录中获取 product_id（优先使用直接属性，否则从 __expandedRowData 获取）
          const productId = record.product_id || record.__expandedRowData?.product_id
          const serialNumber = record.serial_number

          console.log('productId:', productId, 'serialNumber:', serialNumber)

          if (!serialNumber) {
            console.warn('SN码为空，无法查看溯源记录', record)
            message.warning('SN码信息缺失，无法查看溯源记录')
            return
          }

          if (!productId) {
            console.warn('商品ID缺失，无法查看溯源记录', record)
            message.warning('商品信息缺失，无法查看溯源记录')
            return
          }

          console.log('准备打开溯源记录弹窗，serialNumber:', serialNumber, 'productId:', productId)

          setSelectedSNForTrace(serialNumber)
          setSNTraceLoading(true)
          setSNTraceModalVisible(true)
          try {
            const res = await inventoryAPI.getSNTraceRecord(serialNumber, productId)
            console.log('溯源记录API响应:', res)
            if (res.success && res.data) {
              setSNTraceData(res.data)
            } else {
              message.error(res.error || '获取溯源记录失败')
              setSNTraceData(null)
            }
          } catch (error: any) {
            console.error('获取SN码溯源记录失败:', error)
            message.error('获取溯源记录失败: ' + (error?.message || '未知错误'))
            setSNTraceData(null)
          } finally {
            setSNTraceLoading(false)
          }
        }

        if (status === 'out') {
          return (
            <span onClick={handleStatusClick} style={{ display: 'inline-block' }}>
              <Tag
                color="red"
                style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}
              >
                已出库
              </Tag>
            </span>
          )
        }
        return (
          <span onClick={handleStatusClick} style={{ display: 'inline-block' }}>
            <Tag
              color="green"
              style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}
            >
              未出库
            </Tag>
          </span>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: any) => {
        // 从record中获取status
        const status = record.status

        // 仅对未出库的SN码显示删除按钮
        if (status === 'out') {
          return <span>-</span>
        }

        const productId = record.product_id || record.__expandedRowData?.product_id
        const serialNumber = record.serial_number

        if (!productId || !serialNumber) {
          return <span>-</span>
        }

        return (
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              handleDeleteSNCode(serialNumber, productId)
            }}
          >
            删除
          </Button>
        )
      }
    }
  ]

  return (
    <div className="page-transition">
      <Card
        title="商品管理"
        extra={
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setLogModalVisible(true)}
            style={{ boxShadow: '0 0 1px 0 black', borderRadius: '5px' }}
          >
            查看操作日志
          </Button>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}

          items={[
            {
              key: 'products',
              label: (
                <span style={{
                  display: 'inline-block',
                  fontSize: 16,
                }}>
                  商品列表
                </span>
              ),
              icon: <AppstoreOutlined />,
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Row gutter={16} align="middle">
                      <Col flex="auto">
                        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
                          <Form.Item name="search">
                            <Space.Compact style={{ width: 300 }}>
                              <Input
                                placeholder="搜索商品名称或SKU"
                                allowClear
                                onPressEnter={() => searchForm.submit()}
                                onChange={(e) => {
                                  // 当输入框被清空时，立即触发搜索以显示全部商品
                                  if (e.target.value === '') {
                                    searchForm.setFieldsValue({ search: '' })
                                    // 延迟一下确保表单值已更新
                                    setTimeout(() => {
                                      searchForm.submit()
                                    }, 0)
                                  }
                                }}
                              />
                              <Button type="primary" icon={<SearchOutlined />} htmlType="submit" />
                            </Space.Compact>
                          </Form.Item>
                          <Form.Item name="category">
                            <Select
                              placeholder="选择分类"
                              style={{ width: 150 }}
                              allowClear
                              showSearch
                              filterOption={(input, option) =>
                                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                              }
                              onChange={handleCategoryChange}
                              options={[
                                { label: '未分类', value: '未分类' },
                                ...categories.map(category => ({
                                  label: category.name,
                                  value: category.name
                                }))
                              ]}
                            />
                          </Form.Item>
                        </Form>
                      </Col>
                      <Col>
                        <Space>
                          <Button
                            icon={<AppstoreOutlined />}
                            onClick={handleManageCategory}
                          >
                            管理分类
                          </Button>
                          <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleAddNew}
                          >
                            新建商品
                          </Button>
                        </Space>
                      </Col>
                    </Row>
                  </div>

                  <Table
                    columns={columns}
                    dataSource={products}
                    loading={loading}
                    rowKey="id"
                    pagination={{
                      current: currentPage,
                      pageSize: pageSize,
                      total: total,
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showQuickJumper: true,
                      showTotal: (total, range) =>
                        `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
                    }}
                    onChange={handleTableChange}
                    scroll={{ x: 800 }}
                  />
                </>
              )
            },
            {
              key: 'batches',
              label: (
                <span style={{
                  display: 'inline-block',
                  fontSize: 16,
                }}>
                  批次管理
                </span>
              ),
              icon: <BatchOutlined />,
              children: (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Row gutter={16} align="middle">
                      <Col flex="auto">
                        <Space>
                          <Select
                            allowClear
                            placeholder="按商品筛选"
                            style={{ width: 200 }}
                            showSearch
                            optionFilterProp="label"
                            value={selectedBatchProductId}
                            onChange={(value) => {
                              setSelectedBatchProductId(value)
                              setBatchPage(1)
                            }}
                            options={products.map(p => ({
                              label: `${p.name} (${p.sku})`,
                              value: p.id
                            }))}
                          />
                          <Input.Search
                            placeholder="按SN码搜索"
                            allowClear
                            style={{ width: 220 }}
                            value={snSearchKeyword}
                            onSearch={(value) => {
                              setSnSearchKeyword(value.trim())
                              setBatchPage(1)
                            }}
                            onChange={(e) => {
                              const value = e.target.value.trim()
                              setSnSearchKeyword(value)
                              if (value === '') {
                                setBatchPage(1)
                              }
                            }}
                          />
                          <Select
                            placeholder="按SN状态筛选"
                            style={{ width: 180 }}
                            value={snStatusFilter}
                            onChange={(value) => setSnStatusFilter(value)}
                            options={[
                              { label: '全部SN', value: 'all' },
                              { label: '未出库', value: 'in' },
                              { label: '已出库', value: 'out' }
                            ]}
                          />
                          <Input.Search
                            placeholder="搜索批次号"
                            allowClear
                            style={{ width: 260 }}
                            onSearch={(value) => {
                              setBatchSearchKeyword(value)
                              setBatchPage(1)
                            }}
                            onChange={(e) => {
                              if (e.target.value === '') {
                                setBatchSearchKeyword('')
                                setBatchPage(1)
                              }
                            }}
                          />
                        </Space>
                      </Col>
                    </Row>
                  </div>

                  {/* 根据 SN 搜索关键字和出库状态在前端过滤批次 */}
                  {(() => {
                    let filteredBatches = batches

                    // SN码搜索过滤
                    if (snSearchKeyword) {
                      const searchLower = snSearchKeyword.toLowerCase().trim()
                      filteredBatches = filteredBatches.filter((b: any) => {
                        const snItems = b.sn_items || []
                        if (snItems.length === 0) {
                          return false
                        }
                        return snItems.some(
                          (item: any) => {
                            const sn = item?.serial_number
                            if (!sn || typeof sn !== 'string') {
                              return false
                            }
                            return sn.toLowerCase().includes(searchLower)
                          }
                        )
                      })
                    }

                    // 出库状态筛选：只保留包含符合状态SN码的批次
                    if (snStatusFilter !== 'all') {
                      filteredBatches = filteredBatches.filter((b: any) => {
                        const snItems = b.sn_items || []
                        if (snStatusFilter === 'in') {
                          // 至少有一个未出库的SN码
                          return snItems.some((item: any) => item.status !== 'out')
                        } else if (snStatusFilter === 'out') {
                          // 至少有一个已出库的SN码
                          return snItems.some((item: any) => item.status === 'out')
                        }
                        return true
                      })
                    }

                    return (
                      <Table
                        columns={batchColumns}
                        dataSource={filteredBatches}
                        loading={batchesLoading}
                        rowKey={(record) => `${record.product_id}-${record.batch_number}`}
                        pagination={{
                          current: batchPage,
                          pageSize: batchPageSize,
                          total: (snSearchKeyword || snStatusFilter !== 'all') ? filteredBatches.length : batchTotal,
                          showSizeChanger: true,
                          pageSizeOptions: ['10', '20', '50', '100'],
                          showQuickJumper: true,
                          showTotal: (total, range) =>
                            `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
                          onChange: (page, size) => {
                            setBatchPage(page)
                            setBatchPageSize(size || 20)
                          }
                        }}
                        expandable={{
                          expandedRowRender: (record) => {
                            let data = record.sn_items || []
                            if (snStatusFilter === 'in') {
                              data = data.filter((item: any) => item.status !== 'out')
                            } else if (snStatusFilter === 'out') {
                              data = data.filter((item: any) => item.status === 'out')
                            }
                            // 为每个SN码项添加 product_id 信息，以便在状态点击时使用
                            const dataWithProductId = data.map((item: any) => ({
                              ...item,
                              product_id: record.product_id, // 直接添加 product_id 到 item
                              __expandedRowData: { product_id: record.product_id } // 保留兼容性
                            }))
                            return (
                              <Table
                                columns={snItemColumns}
                                dataSource={dataWithProductId}
                                rowKey={(item: any) => `${item.id ?? ''}-${(item as any).serial_number ?? item}`}
                                pagination={false}
                                size="small"
                                onRow={(record) => ({
                                  onClick: (e) => {
                                    // 如果点击的不是Tag，允许默认行为（例如行选择）
                                    const target = e.target as HTMLElement
                                    if (target.closest('.ant-tag')) {
                                      e.stopPropagation()
                                    }
                                  }
                                })}
                              />
                            )
                          },
                          rowExpandable: (record) => (record.sn_items?.length || 0) > 0
                        }}
                        scroll={{ x: 'max-content' ,}}
                      />
                    )
                  })()}
                </>
              )
            }
          ]}
        />
      </Card>

      {/* 新建/编辑商品模态框 */}
      <Modal
        title={editingProduct ? '编辑商品' : '新建商品'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setModalVisible(false)
          setEditingProduct(null)
          productForm.resetFields()
        }}
        width={600}
        confirmLoading={loading}
        afterOpenChange={(open) => {
          if (!open) {
            // 当模态框关闭时，重置状态
            setEditingProduct(null)
            productForm.resetFields()
          }
        }}
      >
        <Form
          form={productForm}
          layout="vertical"
        >
          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="请输入商品名称" />
          </Form.Item>

          <Form.Item
            label="SKU"
            name="sku"
            rules={[{ required: true, message: '请输入SKU' }]}
          >
            <Input placeholder="请输入SKU" disabled={!!editingProduct} />
          </Form.Item>

          <Form.Item
            label="分类"
            name="category"
          >
            <Select placeholder="请选择分类" allowClear>
              <Option value="未分类">未分类</Option>
              {categories.map(category => (
                <Option key={category.id} value={category.name}>
                  {category.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="单价"
                name="price"
                rules={[{ required: true, message: '请输入单价' }]}
              >
                <InputNumber
                  placeholder="单价"
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="最低库存"
                name="min_stock"
                rules={[{ required: true, message: '请输入最低库存' }]}
              >
                <InputNumber
                  placeholder="最低库存"
                  min={0}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="最高库存"
                name="max_stock"
                dependencies={['min_stock']}
                rules={[
                  { required: true, message: '请输入最高库存' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value) {
                        return Promise.resolve()
                      }
                      const minStock = getFieldValue('min_stock')
                      if (minStock !== undefined && minStock !== null && value < minStock) {
                        return Promise.reject(new Error('最高库存不能小于最低库存'))
                      }
                      return Promise.resolve()
                    },
                  }),
                ]}
              >
                <InputNumber
                  placeholder="最高库存"
                  min={0}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 类别管理列表模态框 */}
      <Modal
        title="商品分类管理"
        open={categoryListModalVisible}
        onCancel={() => {
          setCategoryListModalVisible(false)
        }}
        footer={[
          <Button key="close" onClick={() => setCategoryListModalVisible(false)}>
            关闭
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAddCategory}>
            新建分类
          </Button>
        ]}
        width={700}
      >
        <Table
          columns={[
            {
              title: '分类名称',
              dataIndex: 'name',
              key: 'name',
              width: '30%',
              render: (text: string) => <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>{text}</Tag>
            },
            {
              title: '描述',
              dataIndex: 'description',
              key: 'description',
              width: '40%'
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: '15%',
              render: (status: number) => (
                <Tag color={status === 1 ? 'success' : 'default'}>
                  {status === 1 ? '启用' : '禁用'}
                </Tag>
              )
            },
            {
              title: '操作',
              key: 'action',
              width: '15%',
              fixed: 'right' as const,
              render: (_: any, record: Category) => (
                <Space size="small">
                  <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setCategoryListModalVisible(false)
                      handleEditCategory(record)
                    }}
                    size="small"
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteCategory(record)}
                    size="small"
                  >
                    删除
                  </Button>
                </Space>
              )
            }
          ]}
          dataSource={categories}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>

      {/* 新建/编辑分类模态框 */}
      <Modal
        title={editingCategory ? '编辑分类' : '新建分类'}
        open={categoryEditModalVisible}
        onOk={handleCategoryModalOk}
        onCancel={() => {
          setCategoryEditModalVisible(false)
          setEditingCategory(null)
          categoryForm.resetFields()
        }}
        width={500}
      >
        <Form
          form={categoryForm}
          layout="vertical"
        >
          <Form.Item
            label="分类名称"
            name="name"
            rules={[{ required: true, message: '请输入分类名称' }]}
          >
            <Input placeholder="请输入分类名称" />
          </Form.Item>

          <Form.Item
            label="分类描述"
            name="description"
          >
            <Input.TextArea
              rows={4}
              placeholder="请输入分类描述（可选）"
            />
          </Form.Item>
        </Form>
      </Modal>

      <ActivityLogModal
        visible={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        filters={{
          table_name: activeTab === 'batches' ? 'sn_status' : 'products'
        }}
      />

      <StockTransactionModal
        visible={stockTransactionModalVisible}
        onCancel={() => {
          setStockTransactionModalVisible(false)
          setSelectedProductForTransaction(null)
        }}
        productId={selectedProductForTransaction?.id || 0}
        productName={selectedProductForTransaction?.name}
      />

      <BatchInventoryModal
        visible={batchInventoryModalVisible}
        onCancel={() => {
          setBatchInventoryModalVisible(false)
          setSelectedProductForBatch(null)
        }}
        productId={selectedProductForBatch?.id || 0}
        productName={selectedProductForBatch?.name}
      />

      {/* SN码溯源记录Modal */}
      <Modal
        title={`SN码溯源记录 - ${selectedSNForTrace}`}
        open={snTraceModalVisible}
        onCancel={() => {
          setSNTraceModalVisible(false)
          setSelectedSNForTrace('')
          setSNTraceData(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setSNTraceModalVisible(false)
            setSelectedSNForTrace('')
            setSNTraceData(null)
          }}>
            关闭
          </Button>
        ]}
        width={900}
      >
        {snTraceLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>加载溯源记录中...</div>
          </div>
        ) : snTraceData ? (
          <div>
            <Descriptions bordered column={2} style={{ marginBottom: 24, textAlign: 'center' }}>
              <Descriptions.Item label="SN码">{snTraceData.serial_number}</Descriptions.Item>
              <Descriptions.Item label="商品名称">{snTraceData.product_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="商品SKU">{snTraceData.product_sku || '-'}</Descriptions.Item>
              <Descriptions.Item label="批次号">{snTraceData.batch_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="入库日期" span={2} style={{ textAlign: 'left' }}>
                {snTraceData.inbound_date ? dayjs(snTraceData.inbound_date).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>出库记录</Divider>

            {snTraceData.outbound_records && snTraceData.outbound_records.length > 0 ? (
              <Table
                columns={[
                  {
                    title: '出库日期',
                    dataIndex: 'outbound_date',
                    key: 'outbound_date',
                    align: 'center' as const,
                    width: '15%',
                    render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
                  },
                  {
                    title: '客户',
                    dataIndex: 'customer_name',
                    key: 'customer_name',
                    width: '15%',
                    align: 'center' as const
                  },
                  {
                    title: '门店',
                    dataIndex: 'store_name',
                    key: 'store_name',
                    width: '15%',
                    align: 'center' as const,
                    render: (text: string) => text || '-'
                  },
                  {
                    title: '数量',
                    dataIndex: 'quantity',
                    key: 'quantity',
                    width: 80,
                    align: 'center' as const
                  },
                  {
                    title: '出库价格',
                    dataIndex: 'outbound_price',
                    key: 'outbound_price',
                    width: 120,
                    align: 'center' as const,
                    render: (price: number) => price ? `¥${price.toFixed(2)}` : '-',
                  },
                  {
                    title: '位置',
                    dataIndex: 'location',
                    key: 'location',
                    width: 120,
                    align: 'center' as const,
                    render: (text: string) => text || '-',
                  },
                  {
                    title: '备注',
                    dataIndex: 'notes',
                    key: 'notes',
                    width: 120,
                    align: 'center' as const,
                    render: (text: string) => text || '-',
                  }
                ]}
                dataSource={snTraceData.outbound_records}
                rowKey="outbound_id"
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description="暂无出库记录" />
            )}
          </div>
        ) : (
          <Empty description="暂无溯源数据" />
        )}
      </Modal>
    </div>
  )
}

export default Inventory
