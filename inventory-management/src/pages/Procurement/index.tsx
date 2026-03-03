import React, { useEffect, useState } from 'react'
import { 
  Card, Table, Button, Space, Tag, Badge, Tabs, Modal, Form, Input, 
  InputNumber, Select, DatePicker, Descriptions, Row, Col, App, Dropdown, Tooltip
} from 'antd'
import { PlusOutlined, EyeOutlined, DeleteOutlined, HistoryOutlined, CheckOutlined, CloseOutlined, MoreOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import ActivityLogModal from '@/components/ActivityLogModal'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { 
  fetchSuppliers, fetchOrders, fetchReturns, 
  createPurchaseOrder, createPurchaseReturn, createSupplier, deleteSupplier,
  updatePurchaseReturnStatus, updatePurchaseOrderStatus
} from '@/store/slices/procurementSlice'
import { fetchProducts } from '@/store/slices/inventorySlice'
import { procurementAPI, productAPI } from '@/services/api'
import type { Supplier, ProcurementOrder, ProcurementReturn, Product } from '@/types'
import { formatCurrency } from '@/utils/format'

const { TextArea } = Input
const { Option } = Select

interface OrderItem {
  product_id: number
  quantity: number
  unit_price: number
  notes?: string
}

const Procurement: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const dispatch = useAppDispatch()
  const { suppliers, orders, returns, loading } = useAppSelector((state) => state.procurement)
  const { products } = useAppSelector((state) => state.inventory)
  const { user } = useAppSelector((state) => state.auth)
  const app = App.useApp()
  const { message } = app
  
  // 表单实例
  const [orderForm] = Form.useForm()
  const [returnForm] = Form.useForm()
  const [supplierForm] = Form.useForm()
  
  // 状态管理
  const [orderModalVisible, setOrderModalVisible] = useState(false)
  const [returnModalVisible, setReturnModalVisible] = useState(false)
  const [supplierModalVisible, setSupplierModalVisible] = useState(false)
  const [supplierDetailVisible, setSupplierDetailVisible] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [orderDetailVisible, setOrderDetailVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<ProcurementOrder | null>(null)
  const [returnDetailVisible, setReturnDetailVisible] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<ProcurementReturn | null>(null)
  const [receivedQuantities, setReceivedQuantities] = useState<Record<number, number>>({})
  const [ordersWithApprovedReturns, setOrdersWithApprovedReturns] = useState<Set<number>>(new Set())
  const [orderStatusFilter, setOrderStatusFilter] = useState<string | undefined>(undefined)
  const [selectedOrderForReturn, setSelectedOrderForReturn] = useState<ProcurementOrder | null>(null)
  const [availableProductsForReturn, setAvailableProductsForReturn] = useState<Product[]>([])
  
  // 根据路由确定默认激活的Tab
  const pathname = location.pathname.replace(/^#/, '')
  const getDefaultTab = () => {
    if (pathname.includes('/suppliers')) return 'suppliers'
    if (pathname.includes('/returns')) return 'returns'
    return 'orders' // 默认显示订单
  }
  const [activeTab, setActiveTab] = useState(getDefaultTab())

  // 从URL参数中读取status筛选
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const statusParam = searchParams.get('status')
    if (statusParam) {
      setOrderStatusFilter(statusParam)
      // 确保切换到订单tab
      if (activeTab !== 'orders') {
        setActiveTab('orders')
      }
    }
  }, [location.search, activeTab])

  useEffect(() => {
    dispatch(fetchSuppliers())
    dispatch(fetchOrders({ status: orderStatusFilter }))
    dispatch(fetchReturns())
    loadAllProducts()
  }, [dispatch, orderStatusFilter])

  // 当URL参数变化时，重新加载订单（确保从仪表盘跳转时能正确显示筛选结果）
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const statusParam = searchParams.get('status')
    if (statusParam && activeTab === 'orders') {
      // 如果URL中有status参数且当前在订单tab，确保筛选器已设置并重新加载
      if (orderStatusFilter !== statusParam) {
        setOrderStatusFilter(statusParam)
      }
      dispatch(fetchOrders({ status: statusParam }))
    }
  }, [location.search, activeTab, dispatch])

  // 当退货单列表更新时，更新已有已审核退货单的订单ID集合
  useEffect(() => {
    const approvedReturns = returns.filter(r => r.status === 'approved')
    const orderIds = new Set<number>(approvedReturns.map(r => r.order_id).filter((id): id is number => id !== undefined && id !== null))
    setOrdersWithApprovedReturns(orderIds)
  }, [returns])

  useEffect(() => {
    // 当路由变化时，切换Tab
    setActiveTab(getDefaultTab())
    
    // 检查是否需要打开新建或详情弹窗
    if (pathname.includes('/orders/new')) {
      setOrderModalVisible(true)
    } else if (pathname.includes('/returns/new')) {
      setReturnModalVisible(true)
    } else if (pathname.includes('/suppliers/new')) {
      setSupplierModalVisible(true)
    } else if (params.id && pathname.includes('/suppliers/')) {
      handleViewSupplierDetail(parseInt(params.id))
    } else if (params.id && pathname.includes('/orders/')) {
      handleViewOrderDetail(parseInt(params.id))
    }
  }, [pathname, params])

  const loadAllProducts = async () => {
    try {
      const res = await productAPI.getProducts(1, 1000, '')
      if (res.success && res.data) {
        setAllProducts(res.data.data || [])
      }
    } catch (error) {
      console.error('加载商品列表失败:', error)
    }
  }

  // 查看采购订单详情
  const handleViewOrderDetail = async (id: number) => {
    try {
      const res = await procurementAPI.getPurchaseOrder(id)
      if (res.success && res.data) {
        // 类型转换，确保 created_by 有默认值
        const orderData: ProcurementOrder = {
          ...res.data,
          created_by: res.data.created_by || 0
        } as ProcurementOrder
        setSelectedOrder(orderData)
        
        // 初始化已收货数量，默认为采购数量
        if (orderData.items) {
          const initialQuantities: Record<number, number> = {}
          orderData.items.forEach(item => {
            initialQuantities[item.id] = item.received_quantity || item.quantity
          })
          setReceivedQuantities(initialQuantities)
        }
        
        setOrderDetailVisible(true)
      } else {
        message.error(res.error || '获取订单详情失败')
      }
    } catch (error) {
      message.error('获取订单详情失败')
    }
  }

  // 查看采购退货详情
  const handleViewReturnDetail = async (id: number) => {
    try {
      const res = await procurementAPI.getPurchaseReturn(id)
      if (res.success && res.data) {
        setSelectedReturn(res.data)
        setReturnDetailVisible(true)
      } else {
        message.error(res.error || '获取退货详情失败')
      }
    } catch (error) {
      message.error('获取退货详情失败')
    }
  }

  // 审核退货（通过）
  const handleApproveReturn = async (id: number) => {
    Modal.confirm({
      title: '确认审核',
      content: '确定要审核通过此退货单吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await dispatch(updatePurchaseReturnStatus({ 
            id, 
            status: 'approved',
            approvedBy: user?.id
          })).unwrap()
          message.success('退货单审核通过')
          dispatch(fetchReturns())
          dispatch(fetchOrders({ status: orderStatusFilter })) // 刷新订单列表
        } catch (error: any) {
          message.error(error?.payload || error?.message || '审核失败')
        }
      }
    })
  }

  // 拒绝退货
  const handleRejectReturn = async (id: number) => {
    Modal.confirm({
      title: '确认拒绝',
      content: '确定要拒绝此退货单吗？',
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await dispatch(updatePurchaseReturnStatus({ 
            id, 
            status: 'rejected',
            approvedBy: user?.id
          })).unwrap()
          message.success('退货单已拒绝')
          dispatch(fetchReturns())
        } catch (error: any) {
          message.error(error?.payload || error?.message || '操作失败')
        }
      }
    })
  }

  // 审核采购订单（通过）
  const handleApproveOrder = async (id: number) => {
    if (!selectedOrder || !selectedOrder.items) {
      message.error('订单信息不完整')
      return
    }

    // 验证已收货数量（只检查不能为负数，允许大于采购数量）
    for (const item of selectedOrder.items) {
      const receivedQty = receivedQuantities[item.id] || 0
      const productName = (item as any).product_name || (item as any).product?.name || `商品ID:${item.product_id}`
      const productSku = (item as any).product_sku || (item as any).product?.sku || ''
      if (receivedQty < 0) {
        message.error(`商品 ${productName || productSku} 的已收货数量不能为负数`)
        return
      }
    }

    Modal.confirm({
      title: '确认审核',
      content: '确定要审核通过此采购订单吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await dispatch(updatePurchaseOrderStatus({ 
            id, 
            status: 'approved',
            approvedBy: user?.id,
            receivedQuantities: receivedQuantities
          })).unwrap()
          message.success('采购订单审核通过')
          setOrderDetailVisible(false)
          setSelectedOrder(null)
          setReceivedQuantities({})
          dispatch(fetchOrders({ status: orderStatusFilter }))
        } catch (error: any) {
          message.error(error?.payload || error?.message || '审核失败')
        }
      }
    })
  }

  // 拒绝采购订单
  const handleRejectOrder = async (id: number) => {
    Modal.confirm({
      title: '确认拒绝',
      content: '确定要拒绝此采购订单吗？',
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await dispatch(updatePurchaseOrderStatus({ 
            id, 
            status: 'cancelled', // 数据库中使用 cancelled，前端显示为"已退货"
            approvedBy: user?.id
          })).unwrap()
          message.success('采购订单已拒绝')
          setOrderDetailVisible(false)
          setSelectedOrder(null)
          dispatch(fetchOrders({ status: orderStatusFilter }))
        } catch (error: any) {
          message.error(error?.payload || error?.message || '操作失败')
        }
      }
    })
  }

  const handleViewSupplierDetail = async (id: number) => {
    try {
      const res = await procurementAPI.getSupplier(id)
      if (res.success && res.data) {
        setSelectedSupplier(res.data)
        setSupplierDetailVisible(true)
      } else {
        message.error(res.error || '获取供应商详情失败')
        navigate('/procurement/suppliers')
      }
    } catch (error) {
      message.error('获取供应商详情失败')
      navigate('/procurement/suppliers')
    }
  }

  // 新建采购订单
  const handleCreateOrder = async () => {
    try {
      const values = await orderForm.validateFields()
      if (orderItems.length === 0) {
        message.error('请至少添加一个商品')
        return
      }

      const orderData = {
        supplier_id: values.supplier_id,
        expected_date: values.expected_date ? (typeof values.expected_date === 'string' ? values.expected_date : values.expected_date.format('YYYY-MM-DD')) : undefined,
        notes: values.notes,
        items: orderItems
      }

      await dispatch(createPurchaseOrder({ 
        orderData, 
        createdBy: user?.id || 1
      })).unwrap()

      message.success('采购订单创建成功')
      setOrderModalVisible(false)
      orderForm.resetFields()
      setOrderItems([])
      navigate('/procurement/orders')
      dispatch(fetchOrders())
    } catch (error: any) {
      const errorMessage = error?.payload || error?.message || '创建采购订单失败'
      message.error(errorMessage)
      console.error('创建采购订单失败:', error)
    }
  }

  // 新建退货单
  const handleCreateReturn = async () => {
    try {
      const values = await returnForm.validateFields()

      // #region agent log
      console.log('🔍 [调试] 表单提交的值:', {
        values,
        order_id: values.order_id,
        product_id: values.product_id,
        order_id类型: typeof values.order_id,
        product_id类型: typeof values.product_id,
        order_id值: values.order_id,
        product_id值: values.product_id
      })
      fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Procurement/index.tsx:330',message:'handleCreateReturn form values',data:{values,order_id:values.order_id,product_id:values.product_id,order_id_type:typeof values.order_id,product_id_type:typeof values.product_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      // 确保 quantity 是数字类型，InputNumber 可能返回 null 或 undefined
      const quantity = values.quantity !== null && values.quantity !== undefined 
        ? Number(values.quantity) 
        : null
      
      if (quantity === null || isNaN(quantity) || quantity <= 0) {
        message.error('请输入有效的退货数量')
        return
      }

      const returnData = {
        order_id: values.order_id,
        product_id: values.product_id,
        quantity: quantity,
        reason: values.reason
      }

      // #region agent log
      console.log('🔍 [调试] 准备发送到后端的returnData:', {
        returnData,
        order_id: returnData.order_id,
        product_id: returnData.product_id,
        order_id类型: typeof returnData.order_id,
        product_id类型: typeof returnData.product_id,
        quantity: returnData.quantity,
        reason: returnData.reason
      })
      fetch('http://127.0.0.1:7242/ingest/4f707f82-f5b2-493b-9443-3c9dfac287fa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Procurement/index.tsx:348',message:'before createPurchaseReturn dispatch',data:{returnData,order_id_type:typeof returnData.order_id,product_id_type:typeof returnData.product_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      await dispatch(createPurchaseReturn({ 
        returnData, 
        createdBy: user?.id || 1
      })).unwrap()

      message.success('退货单创建成功')
      setReturnModalVisible(false)
      returnForm.resetFields()
      navigate('/procurement/returns')
      dispatch(fetchReturns())
    } catch (error: any) {
      const errorMessage = error?.payload || error?.message || '创建退货单失败'
      message.error(errorMessage)
      console.error('创建退货单失败:', error)
    }
  }

  // 新建供应商
  const handleCreateSupplier = async () => {
    try {
      const values = await supplierForm.validateFields()

      await dispatch(createSupplier({
        name: values.name,
        contact_person: values.contact_person,
        phone: values.phone,
        email: values.email,
        address: values.address
      } as any)).unwrap()

      message.success('供应商创建成功')
      setSupplierModalVisible(false)
      supplierForm.resetFields()
      navigate('/procurement/suppliers')
      dispatch(fetchSuppliers())
    } catch (error: any) {
      message.error(error?.payload || error?.message || '创建供应商失败')
    }
  }

  // 删除供应商
  const handleDeleteSupplier = (id: number, name: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除供应商 "${name}" 吗？此操作不可恢复。`,
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await dispatch(deleteSupplier(id)).unwrap()
          message.success('供应商删除成功')
          dispatch(fetchSuppliers())
        } catch (error: any) {
          message.error(error?.payload || error?.message || '删除供应商失败')
        }
      }
    })
  }

  // 添加订单项
  const handleAddOrderItem = () => {
    setOrderItems([...orderItems, { product_id: 0, quantity: 1, unit_price: 0 }])
  }

  // 删除订单项
  const handleRemoveOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index))
  }

  // 更新订单项
  const handleUpdateOrderItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...orderItems]
    newItems[index] = { ...newItems[index], [field]: value }
    setOrderItems(newItems)
  }

  // 计算订单总金额
  const calculateOrderTotal = () => {
    return orderItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  }

  // 供应商表格列
  const supplierColumns = [
    {
      title: '供应商代码',
      dataIndex: 'code',
      key: 'code',
      width: '12%'
    },
    {
      title: '供应商名称',
      dataIndex: 'name',
      key: 'name',
      width: '20%',
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '联系人',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: '12%'
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
      width: '20%'
    },
    {
      title: '操作',
      key: 'action',
      width: '8%',
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: Supplier) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewSupplierDetail(record.id)}
            />
          </Tooltip>
          <Tooltip title="删除供应商">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteSupplier(record.id, record.name)}
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  // 采购订单表格列
  const orderColumns = [
    {
      title: '订单编号',
      dataIndex: 'order_number',
      key: 'order_number',
      width: '12%',
      align: 'center' as const,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier',
      width: '10%',
      align: 'center' as const,
      render: (text: string, record: ProcurementOrder) => {
        return text || record.supplier?.name || '-'
      }
    },
    {
      title: '订单金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: '12%',
      align: 'center' as const,
      render: (amount: number) => (
        <span style={{ color: '#28a745', fontWeight: 500 }}>
          {formatCurrency(amount)}
        </span>
      )
    },
    {
      title: '订单状态',
      dataIndex: 'status',
      key: 'status',
      width: '12%',
      align: 'center' as const,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          draft: { color: 'default', text: '草稿' },
          pending: { color: 'processing', text: '待审批' },
          approved: { color: 'success', text: '已批准' },
          rejected: { color: 'error', text: '已拒绝' },
          completed: { color: 'success', text: '已完成' },
          received: { color: 'processing', text: '已收货' },
          cancelled: { color: 'warning', text: '已退货' }
        }
        const statusInfo = statusMap[status] || { color: 'default', text: status }
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
      }
    },
    {
      title: '审批状态',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: '12%',
      align: 'center' as const,
      render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'warning', text: '待审批' },
          approved: { color: 'success', text: '已批准' },
          rejected: { color: 'error', text: '已拒绝' }
        }
        const statusInfo = statusMap[status] || { color: 'default', text: status }
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
      }
    },
    {
      title: '期望到货',
      dataIndex: 'expected_date',
      key: 'expected_date',
      width: '12%',
      align: 'center' as const,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '12%',
      align: 'center' as const,
    },
    {
      title: '操作',
      key: 'action',
      width: '9%',
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: ProcurementOrder) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewOrderDetail(record.id)}
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  // 采购退货表格列
  const returnColumns = [
    {
      title: '退货编号',
      dataIndex: 'return_number',
      key: 'return_number',
      width: '16%',
      align: 'center' as const,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '原订单',
      key: 'order_number',
      width: '15%',
      align: 'center' as const,
      render: (_: any, record: ProcurementReturn) => {
        return record.order?.order_number || '-'
      }
    },
    {
      title: '商品',
      key: 'product',
      width: '10%',
      align: 'center' as const,
      render: (_: any, record: ProcurementReturn) => {
        return record.product?.name || (record as any).product_name || '-'
      }
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '6%',
      align: 'center' as const,
      render: (quantity: number) => (
        <span style={{ color: '#dc3545', fontWeight: 500 }}>{quantity}</span>
      )
    },
    {
      title: '退货原因',
      dataIndex: 'reason',
      key: 'reason',
      width: '15%',
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '8%',
      align: 'center' as const,
        render: (status: string) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'warning', text: '待审核' },
          approved: { color: 'success', text: '已审核' },
          completed: { color: 'success', text: '已完成' },
          rejected: { color: 'error', text: '已拒绝' }
        }
        const statusInfo = statusMap[status] || { color: 'default', text: status }
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '15%',
      align: 'center' as const,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: ProcurementReturn) => {
        // 如果是待审核状态，显示审核按钮和更多操作下拉菜单
        if (record.status === 'pending') {
          const menuItems: MenuProps['items'] = [
            {
              key: 'view',
              label: '查看',
              icon: <EyeOutlined />,
              onClick: () => handleViewReturnDetail(record.id)
            },
            {
              key: 'reject',
              label: '拒绝',
              icon: <CloseOutlined />,
              danger: true,
              onClick: () => handleRejectReturn(record.id)
            }
          ]

          return (
            <Space size="small" style={{ display: 'flex', justifyContent: 'center' }}>
              {/* 审核通过按钮 */}
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handleApproveReturn(record.id)}
                title="审核通过"
              />
              {/* 更多操作下拉菜单 */}
              <Dropdown
                menu={{ items: menuItems }}
                trigger={['hover']}
                placement="bottomRight"
              >
                <Button
                  type="link"
                  size="small"
                  icon={<MoreOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  title="更多操作"
                />
              </Dropdown>
            </Space>
          )
        }

        // 已审核状态，直接显示查看按钮
        return (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewReturnDetail(record.id)}
            title="查看详情"
          />
        )
      }
    }
  ]

  const tabItems = [
    {
      key: 'suppliers',
      label: '供应商管理',
      children: (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => navigate('/procurement/suppliers/new')}
            >
              新建供应商
            </Button>
          </div>
          
          <Table
            columns={supplierColumns}
            dataSource={suppliers}
            loading={loading}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            scroll={{ x: 800 }}
          />
        </Card>
      )
    },
    {
      key: 'orders',
      label: '采购订单',
      children: (
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Select
                placeholder="筛选状态"
                style={{ width: 150 }}
                allowClear
                value={orderStatusFilter}
                onChange={(value) => setOrderStatusFilter(value || undefined)}
              >
                <Option value="pending">待审批</Option>
                <Option value="approved">已批准</Option>
                <Option value="received">已收货</Option>
                <Option value="cancelled">已退货</Option>
              </Select>
            </Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => navigate('/procurement/orders/new')}
            >
              新建采购订单
            </Button>
          </div>
          
          <Table
            columns={orderColumns}
            dataSource={orders}
            loading={loading}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            scroll={{ x: 800 }}
          />
        </Card>
      )
    },
    {
      key: 'returns',
      label: '采购退货',
      children: (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => navigate('/procurement/returns/new')}
            >
              新建退货单
            </Button>
          </div>
          
          <Table
            columns={returnColumns}
            dataSource={returns}
            loading={loading}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showQuickJumper: true,
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条/共 ${total} 条`
            }}
            scroll={{ x: 1000 }}
          />
        </Card>
      )
    }
  ]

  return (
    <div className="page-transition">
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        type="card" 
        items={tabItems}
        tabBarExtraContent={
          <Button 
            type="link" 
            icon={<HistoryOutlined />}
            onClick={() => setLogModalVisible(true)}
            style={{boxShadow:'0 0 1px 0 black', borderRadius: '5px', marginLeft: 10}}
          >
            查看操作日志
          </Button>
        }
      />
      
      {/* 采购订单详情弹窗 */}
      <Modal
        title="采购订单详情"
        open={orderDetailVisible}
        onCancel={() => {
          setOrderDetailVisible(false)
          navigate('/procurement/orders')
          setSelectedOrder(null)
        }}
        footer={selectedOrder?.status === 'pending' ? (
          <Space>
            <Button onClick={() => {
              setOrderDetailVisible(false)
              navigate('/procurement/orders')
              setSelectedOrder(null)
            }}>
              关闭
            </Button>
            <Button 
              type="primary" 
              icon={<CheckOutlined />}
              onClick={() => selectedOrder && handleApproveOrder(selectedOrder.id)}
            >
              审核通过
            </Button>
            <Button 
              danger
              icon={<CloseOutlined />}
              onClick={() => selectedOrder && handleRejectOrder(selectedOrder.id)}
            >
              拒绝
            </Button>
          </Space>
        ) : (
          <Button onClick={() => {
            setOrderDetailVisible(false)
            navigate('/procurement/orders')
            setSelectedOrder(null)
          }}>
            关闭
          </Button>
        )}
        width={800}
      >
        {selectedOrder && (
          <div>
            <Descriptions column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="订单编号">
                {selectedOrder.order_number}
              </Descriptions.Item>
              <Descriptions.Item label="供应商">
                {selectedOrder.supplier_name || selectedOrder.supplier?.name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="订单金额">
                <span style={{ color: '#28a745', fontWeight: 500 }}>
                  {formatCurrency(selectedOrder.total_amount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="订单状态">
                <Tag color={
                  selectedOrder.status === 'pending' ? 'processing' : 
                  selectedOrder.status === 'approved' ? 'success' : 
                  selectedOrder.status === 'received' ? 'processing' :
                  selectedOrder.status === 'cancelled' ? 'warning' : 
                  'default'
                }>
                  {selectedOrder.status === 'pending' ? '待审批' : 
                   selectedOrder.status === 'approved' ? '已批准' : 
                   selectedOrder.status === 'received' ? '已收货' : 
                   selectedOrder.status === 'cancelled' ? '已退货' : 
                   selectedOrder.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="期望到货日期">
                {selectedOrder.expected_date || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedOrder.created_at}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedOrder.notes || '-'}
              </Descriptions.Item>
            </Descriptions>
            
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <Table
                columns={[
                  { 
                    title: '商品名称', 
                    key: 'product_name', 
                    render: (_: any, record: any) => (record.product_name || record.product?.name || '-') as string
                  },
                  { 
                    title: '商品编码', 
                    key: 'product_sku', 
                    render: (_: any, record: any) => (record.product_sku || record.product?.sku || '-') as string
                  },
                  { title: '采购数量', dataIndex: 'quantity', key: 'quantity' },
                  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', render: (price: number) => formatCurrency(price) },
                  { title: '总价', dataIndex: 'total_price', key: 'total_price', render: (price: number) => formatCurrency(price) },
                  { 
                    title: '已收货数量', 
                    key: 'received_quantity',
                    render: (_: any, record: any) => {
                      if (selectedOrder.status === 'pending') {
                        return (
                          <InputNumber
                            min={0}
                            value={receivedQuantities[record.id] ?? record.quantity}
                            onChange={(value) => {
                              setReceivedQuantities({
                                ...receivedQuantities,
                                [record.id]: value || 0
                              })
                            }}
                            style={{ width: '100px' }}
                          />
                        )
                      } else {
                        return record.received_quantity || 0
                      }
                    }
                  }
                ]}
                dataSource={selectedOrder.items}
                rowKey="id"
                pagination={false}
                size="small"
              />
            )}
          </div>
        )}
      </Modal>

      <ActivityLogModal
        visible={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        filters={{
          table_name: activeTab === 'suppliers' ? 'suppliers' : activeTab === 'orders' ? 'purchase_orders' : 'purchase_returns'
        }}
      />

      {/* 新建采购订单弹窗 */}
      <Modal
        title="新建采购订单"
        open={orderModalVisible}
        onOk={handleCreateOrder}
        onCancel={() => {
          setOrderModalVisible(false)
          navigate('/procurement/orders')
          orderForm.resetFields()
          setOrderItems([])
        }}
        width={800}
        okText="创建"
        cancelText="取消"
      >
        <Form form={orderForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="供应商"
                name="supplier_id"
                rules={[{ required: true, message: '请选择供应商' }]}
              >
                <Select placeholder="请选择供应商">
                  {suppliers.map(supplier => (
                    <Option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="期望到货日期"
                name="expected_date"
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="订单明细">
            <Button 
              type="dashed" 
              onClick={handleAddOrderItem}
              style={{ width: '100%', marginBottom: 16 }}
            >
              添加商品
            </Button>
            {orderItems.map((item, index) => (
              <Card key={index} size="small" style={{ marginBottom: 8 }}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Select
                      placeholder="选择商品"
                      value={item.product_id || undefined}
                      onChange={(value) => handleUpdateOrderItem(index, 'product_id', value)}
                      style={{ width: '100%' }}
                    >
                      {allProducts.map(product => (
                        <Option key={product.id} value={product.id}>
                          {product.name} ({product.sku})
                        </Option>
                      ))}
                    </Select>
                  </Col>
                  <Col span={5}>
                    <InputNumber
                      placeholder="数量"
                      value={item.quantity}
                      onChange={(value) => handleUpdateOrderItem(index, 'quantity', value || 0)}
                      min={1}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={5}>
                    <InputNumber
                      placeholder="单价"
                      value={item.unit_price}
                      onChange={(value) => handleUpdateOrderItem(index, 'unit_price', value || 0)}
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={4}>
                    <span>小计: {formatCurrency(item.quantity * item.unit_price)}</span>
                  </Col>
                  <Col span={2}>
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveOrderItem(index)}
                    />
                  </Col>
                </Row>
              </Card>
            ))}
            {orderItems.length > 0 && (
              <div style={{ marginTop: 16, textAlign: 'right', fontSize: 16, fontWeight: 'bold' }}>
                订单总额: {formatCurrency(calculateOrderTotal())}
              </div>
            )}
          </Form.Item>

          <Form.Item
            label="备注"
            name="notes"
          >
            <TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建退货单弹窗 */}
      <Modal
        title="新建退货单"
        open={returnModalVisible}
        onOk={handleCreateReturn}
        onCancel={() => {
          setReturnModalVisible(false)
          navigate('/procurement/returns')
          returnForm.resetFields()
          setSelectedOrderForReturn(null)
          setAvailableProductsForReturn([])
        }}
        width={600}
        okText="创建"
        cancelText="取消"
      >
        <Form form={returnForm} layout="vertical">
          <Form.Item
            label="原采购订单"
            name="order_id"
            rules={[{ required: true, message: '请选择原采购订单' }]}
          >
            <Select 
              placeholder="请选择原采购订单"
              onChange={async (orderId) => {
                // 清空已选择的商品
                returnForm.setFieldsValue({ product_id: undefined })
                setAvailableProductsForReturn([])
                
                if (orderId) {
                  try {
                    // 获取订单详情（包含订单项）
                    const res = await procurementAPI.getPurchaseOrder(orderId)
                    if (res.success && res.data) {
                      const orderData = res.data as ProcurementOrder
                      setSelectedOrderForReturn(orderData)
                      
                      // 根据订单项获取可退货的商品列表
                      if (orderData.items && orderData.items.length > 0) {
                        // 获取订单项中的商品ID列表
                        const productIds = orderData.items.map(item => item.product_id)
                        // 从所有商品中筛选出订单包含的商品
                        const availableProducts = allProducts.filter(product => 
                          productIds.includes(product.id)
                        )
                        setAvailableProductsForReturn(availableProducts)
                        
                      } else {
                        setAvailableProductsForReturn([])
                        message.warning('该订单没有订单项')
                      }
                    }
                  } catch (error) {
                    console.error('获取订单详情失败:', error)
                    message.error('获取订单详情失败')
                  }
                } else {
                  setSelectedOrderForReturn(null)
                  setAvailableProductsForReturn([])
                }
              }}
            >
              {orders
                .filter(order => {
                  // 只显示已审核的订单
                  if (order.status !== 'approved') {
                    return false
                  }
                  // 排除已有已审核退货单的订单
                  if (ordersWithApprovedReturns.has(order.id)) {
                    return false
                  }
                  return true
                })
                .map(order => (
                  <Option key={order.id} value={order.id}>
                    {order.order_number} - {order.supplier?.name || ''}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="退货商品"
            name="product_id"
            rules={[{ required: true, message: '请选择退货商品' }]}
          >
            <Select 
              placeholder={selectedOrderForReturn ? "请选择退货商品" : "请先选择原采购订单"}
              disabled={!selectedOrderForReturn || availableProductsForReturn.length === 0}
            >
              {availableProductsForReturn.map(product => (
                <Option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="退货数量"
            name="quantity"
            rules={[
              { required: true, message: '请输入退货数量' },
              {
                validator(_, value) {
                  // InputNumber 返回 null 或 undefined 时表示未输入
                  if (value === null || value === undefined) {
                    return Promise.reject(new Error('请输入退货数量'))
                  }
                  const quantity = Number(value)
                  if (isNaN(quantity) || quantity <= 0) {
                    return Promise.reject(new Error('退货数量必须大于0'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <InputNumber min={1} style={{ width: '100%' }} precision={0} />
          </Form.Item>

          <Form.Item
            label="退货原因"
            name="reason"
            rules={[{ required: true, message: '请输入退货原因' }]}
          >
            <TextArea rows={3} placeholder="请输入退货原因" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建供应商弹窗 */}
      <Modal
        title="新建供应商"
        open={supplierModalVisible}
        onOk={handleCreateSupplier}
        onCancel={() => {
          setSupplierModalVisible(false)
          navigate('/procurement/suppliers')
          supplierForm.resetFields()
        }}
        width={600}
        okText="创建"
        cancelText="取消"
      >
        <Form form={supplierForm} layout="vertical">
          <Form.Item
            label="供应商名称"
            name="name"
            rules={[{ required: true, message: '请输入供应商名称' }]}
          >
            <Input placeholder="请输入供应商名称" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="联系人"
                name="contact_person"
              >
                <Input placeholder="请输入联系人" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="联系电话"
                name="phone"
              >
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="邮箱"
            name="email"
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            label="地址"
            name="address"
          >
            <TextArea rows={2} placeholder="请输入地址" />
          </Form.Item>

        </Form>
      </Modal>

      {/* 供应商详情弹窗 */}
      <Modal
        title="供应商详情"
        open={supplierDetailVisible}
        onCancel={() => {
          setSupplierDetailVisible(false)
          navigate('/procurement/suppliers')
          setSelectedSupplier(null)
        }}
        footer={null}
        width={600}
      >
        {selectedSupplier && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="供应商代码">
              {selectedSupplier.code || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="供应商名称">
              {selectedSupplier.name}
            </Descriptions.Item>
            <Descriptions.Item label="联系人">
              {selectedSupplier.contact_person || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="联系电话">
              {selectedSupplier.phone || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="邮箱">
              {selectedSupplier.email || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="地址">
              {selectedSupplier.address || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="账期">
              {selectedSupplier.payment_terms || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="评级">
              <Badge
                count={selectedSupplier.rating || 0}
                style={{ 
                  backgroundColor: (selectedSupplier.rating || 0) >= 8 ? '#28a745' : 
                                  (selectedSupplier.rating || 0) >= 6 ? '#ffc107' : '#dc3545'
                }}
              />
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>
              {selectedSupplier.created_at}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 采购退货详情弹窗 */}
      <Modal
        title="采购退货详情"
        open={returnDetailVisible}
        onCancel={() => {
          setReturnDetailVisible(false)
          navigate('/procurement/returns')
          setSelectedReturn(null)
        }}
        footer={null}
        width={800}
      >
        {selectedReturn ? (
          <div>
            <Descriptions column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="退货编号">
                {selectedReturn.return_number}
              </Descriptions.Item>
              <Descriptions.Item label="原订单号">
                {selectedReturn.order?.order_number || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="退货日期">
                {(selectedReturn as any).return_date || selectedReturn.created_at}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={
                  selectedReturn.status === 'pending' ? 'warning' : 
                  selectedReturn.status === 'approved' ? 'success' : 
                  selectedReturn.status === 'completed' ? 'success' :
                  selectedReturn.status === 'rejected' ? 'error' : 
                  'default'
                }>
                  {selectedReturn.status === 'pending' ? '待审核' : 
                   selectedReturn.status === 'approved' ? '已审核' : 
                   selectedReturn.status === 'completed' ? '已完成' : 
                   selectedReturn.status === 'rejected' ? '已拒绝' : 
                   selectedReturn.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="退货原因" span={2}>
                {selectedReturn.reason || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedReturn.created_at}
              </Descriptions.Item>
            </Descriptions>
            
            <Table
              columns={[
                { 
                  title: '商品名称', 
                  key: 'product_name', 
                  render: (_: any, record: any) => (record.product_name || record.product?.name || '-') as string
                },
                { 
                  title: '商品编码', 
                  key: 'product_sku', 
                  render: (_: any, record: any) => (record.product_sku || record.product?.sku || '-') as string
                },
                { title: '退货数量', dataIndex: 'quantity', key: 'quantity' },
                { title: '单价', dataIndex: 'unit_price', key: 'unit_price', render: (price: number) => formatCurrency(price) },
                { title: '总价', dataIndex: 'total_price', key: 'total_price', render: (price: number) => formatCurrency(price) }
              ]}
              dataSource={[
                {
                  product_name: selectedReturn.product?.name || (selectedReturn as any).product_name,
                  product_sku: selectedReturn.product?.sku || (selectedReturn as any).product_sku,
                  quantity: selectedReturn.quantity,
                  unit_price: (selectedReturn as any).unit_price || 0,
                  total_price: (selectedReturn as any).total_price || (selectedReturn as any).total_amount || 0
                }
              ]}
              rowKey="product_name"
              pagination={false}
              size="small"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export default Procurement
