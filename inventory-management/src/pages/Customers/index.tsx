import React, { useEffect, useState } from 'react'
import { 
  Card, Table, Button, Space, Tag, Modal, Form, Input, 
  App, Row, Col, Typography, Select, Tooltip, DatePicker, message, Switch, Divider, Descriptions
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, HistoryOutlined, ShopOutlined, EyeOutlined, CloseOutlined, MoneyCollectOutlined, ToolOutlined } from '@ant-design/icons'
import ActivityLogModal from '@/components/ActivityLogModal'
import { useNavigate } from 'react-router-dom'
import type { Customer, CustomerStore } from '@/services/database/CustomerService'
import { customerAPI, repairAPI, inventoryAPI, productAPI } from '@/services/api'
import dayjs from 'dayjs'
import type { ServiceFeeRecord } from '@/types'

const { TextArea } = Input
const { Option } = Select
const { Text } = Typography

const Customers: React.FC = () => {
  const navigate = useNavigate()
  const { message } = App.useApp()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [customerForm] = Form.useForm()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined)
  const [feeStatusFilter, setFeeStatusFilter] = useState<string | undefined>(undefined)
  const [sortField, setSortField] = useState<string | undefined>(undefined)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(undefined)
  const [storesModalVisible, setStoresModalVisible] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [stores, setStores] = useState<CustomerStore[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storeForm] = Form.useForm()
  const [storeModalVisible, setStoreModalVisible] = useState(false)
  const [editingStore, setEditingStore] = useState<CustomerStore | null>(null)
  const [outboundRecordsModalVisible, setOutboundRecordsModalVisible] = useState(false)
  const [outboundRecordsLoading, setOutboundRecordsLoading] = useState(false)
  const [outboundRecords, setOutboundRecords] = useState<any[]>([])
  const [outboundRecordsPage, setOutboundRecordsPage] = useState(1)
  const [outboundRecordsPageSize, setOutboundRecordsPageSize] = useState(20)
  const [outboundRecordsTotal, setOutboundRecordsTotal] = useState(0)
  const [selectedStore, setSelectedStore] = useState<CustomerStore | null>(null)
  const [outboundDetailVisible, setOutboundDetailVisible] = useState(false)
  const [selectedOutboundRecord, setSelectedOutboundRecord] = useState<any>(null)
  const [outboundProductInfo, setOutboundProductInfo] = useState<any>(null)
  const [outboundSNCodes, setOutboundSNCodes] = useState<string[]>([])
  const [loadingOutboundDetail, setLoadingOutboundDetail] = useState(false)

  // 服务费管理相关状态
  const [serviceFeeModalVisible, setServiceFeeModalVisible] = useState(false)
  const [selectedCustomerForFee, setSelectedCustomerForFee] = useState<Customer | null>(null)
  const [serviceFeeRecords, setServiceFeeRecords] = useState<ServiceFeeRecord[]>([])
  const [serviceFeeLoading, setServiceFeeLoading] = useState(false)
  const [serviceFeeForm] = Form.useForm()
  const [editingFeeRecord, setEditingFeeRecord] = useState<ServiceFeeRecord | null>(null)
  const [feeRecordModalVisible, setFeeRecordModalVisible] = useState(false)
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null)
  const [customerRepairModalVisible, setCustomerRepairModalVisible] = useState(false)
  const [customerRepairRecords, setCustomerRepairRecords] = useState<any[]>([])
  const [customerRepairLoading, setCustomerRepairLoading] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [currentPage, pageSize, searchKeyword, statusFilter, feeStatusFilter, sortField, sortOrder])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      // 客户管理页面显示所有客户（包括停用的）
      const res = await customerAPI.getCustomers(currentPage, pageSize, searchKeyword, true, statusFilter, feeStatusFilter, sortField, sortOrder)
      if (res.success && res.data) {
        let filteredCustomers = res.data.data || []
        // 如果选择了状态筛选，进行前端过滤
        if (statusFilter !== undefined && statusFilter !== null) {
          filteredCustomers = filteredCustomers.filter(c => c.status === statusFilter)
        }
        setCustomers(filteredCustomers)
        setTotal(statusFilter !== undefined ? filteredCustomers.length : res.data.total || 0)
      }
    } catch (error: any) {
      console.error('加载客户列表失败:', error)
      message.error('加载客户列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingCustomer(null)
    customerForm.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer)
    customerForm.setFieldsValue({
      code: customer.code,
      name: customer.name,
      contact_person: customer.contact_person,
      phone: customer.phone,
      address: customer.address,
      backend_url: customer.backend_url,
      backend_account: customer.backend_account,
      backend_password: customer.backend_password,
      upgrade_password: customer.upgrade_password
    })
    setModalVisible(true)
  }

  const handleViewCustomer = (customer: Customer) => {
    setViewingCustomer(customer)
    setViewModalVisible(true)
  }

  const loadCustomerRepairRecords = async (customerId: number) => {
    try {
      setCustomerRepairLoading(true)
      const res = await repairAPI.getRepairsByCustomerId(customerId)
      if (res.success && res.data) {
        setCustomerRepairRecords(res.data)
      } else {
        setCustomerRepairRecords([])
      }
    } catch (error) {
      console.error('加载客户维修记录失败:', error)
      message.error('加载维修记录失败')
    } finally {
      setCustomerRepairLoading(false)
    }
  }

  const handleViewCustomerRepairs = async (customer: Customer) => {
    setViewModalVisible(false)
    await loadCustomerRepairRecords(customer.id!)
    setCustomerRepairModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await customerForm.validateFields()
      
      if (editingCustomer) {
        // 更新客户
        const res = await customerAPI.updateCustomer(editingCustomer.id, values)
        if (res.success) {
          message.success('客户更新成功')
          setModalVisible(false)
          customerForm.resetFields()
          setEditingCustomer(null)
          loadCustomers()
        } else {
          message.error(res.error || '客户更新失败')
        }
      } else {
        // 创建客户
        const res = await customerAPI.createCustomer(values)
        if (res.success) {
          message.success('客户创建成功')
          setModalVisible(false)
          customerForm.resetFields()
          loadCustomers()
        } else {
          message.error(res.error || '客户创建失败')
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      message.error(error?.message || (editingCustomer ? '客户更新失败' : '客户创建失败')      )
    }
  }

  // 门店管理功能
  const handleManageStores = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setStoresModalVisible(true)
    await loadCustomerStores(customer.id)
  }

  const loadCustomerStores = async (customerId: number) => {
    try {
      setStoresLoading(true)
      const res = await customerAPI.getCustomerStores(customerId)
      if (res.success && res.data) {
        setStores(res.data || [])
      } else {
        setStores([])
      }
    } catch (error) {
      console.error('加载客户门店列表失败:', error)
      setStores([])
    } finally {
      setStoresLoading(false)
    }
  }

  const handleAddStore = () => {
    setEditingStore(null)
    storeForm.resetFields()
    storeForm.setFieldsValue({ customer_id: selectedCustomer?.id })
    setStoreModalVisible(true)
  }

  const handleEditStore = (store: CustomerStore) => {
    setEditingStore(store)
    storeForm.setFieldsValue({
      store_name: store.store_name,
      address: store.address,
      contact_person: store.contact_person,
      phone: store.phone
    })
    setStoreModalVisible(true)
  }

  const handleViewStoreOutbound = async (store: CustomerStore) => {
    setSelectedStore(store)
    setOutboundRecordsModalVisible(true)
    await loadStoreOutboundRecords(store.id, 1, outboundRecordsPageSize)
  }

  const loadStoreOutboundRecords = async (storeId: number, page = 1, pageSize = 20) => {
    try {
      setOutboundRecordsLoading(true)
      const res = await inventoryAPI.getOutboundRecords(page, pageSize, { store_id: storeId })
      if (res.success && res.data) {
        setOutboundRecords(res.data.data || [])
        setOutboundRecordsTotal(res.data.total || 0)
        setOutboundRecordsPage(res.data.page || 1)
        setOutboundRecordsPageSize(res.data.pageSize || 20)
      } else {
        setOutboundRecords([])
      }
    } catch (error) {
      console.error('加载门店出库记录失败:', error)
      message.error('加载门店出库记录失败')
    } finally {
      setOutboundRecordsLoading(false)
    }
  }

  const handleStoreSubmit = async () => {
    try {
      const values = await storeForm.validateFields()
      if (!selectedCustomer) return

      if (editingStore) {
        // 更新门店
        const res = await customerAPI.updateStore(editingStore.id, {
          store_name: values.store_name,
          address: values.address,
          contact_person: values.contact_person,
          phone: values.phone
        })
        if (res.success) {
          message.success('门店更新成功')
          setStoreModalVisible(false)
          storeForm.resetFields()
          setEditingStore(null)
          await loadCustomerStores(selectedCustomer.id)
        } else {
          message.error(res.error || '门店更新失败')
        }
      } else {
        // 创建门店
        const res = await customerAPI.createStore({
          customer_id: selectedCustomer.id,
          store_name: values.store_name,
          address: values.address,
          contact_person: values.contact_person,
          phone: values.phone
        })
        if (res.success) {
          message.success('门店创建成功')
          setStoreModalVisible(false)
          storeForm.resetFields()
          await loadCustomerStores(selectedCustomer.id)
        } else {
          message.error(res.error || '门店创建失败')
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      message.error(error?.message || '操作失败')
    }
  }

  const handleDeleteStore = (store: CustomerStore) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除门店 "${store.store_name}" 吗？`,
      onOk: async () => {
        try {
          const res = await customerAPI.deleteStore(store.id)
          if (res.success) {
            message.success('门店删除成功')
            if (selectedCustomer) {
              await loadCustomerStores(selectedCustomer.id)
            }
          } else {
            message.error(res.error || '门店删除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '门店删除失败')
        }
      }
    })
  }

  const handleViewOutboundDetail = async (record: any) => {
    setSelectedOutboundRecord(record)
    setOutboundDetailVisible(true)
    setOutboundProductInfo(null)
    setOutboundSNCodes([])
    setLoadingOutboundDetail(true)

    try {
      // 加载商品信息
      if (record.product_id) {
        try {
          const productResponse = await productAPI.getProduct(record.product_id)
          if (productResponse.success && productResponse.data) {
            setOutboundProductInfo(productResponse.data)
          }
        } catch (error) {
          console.error('获取商品信息失败:', error)
        }
      }

      // 加载SN码信息
      if (record.id) {
        try {
          const snResponse = await inventoryAPI.getOutboundSNItems(record.id)
          if (snResponse.success && snResponse.data) {
            const sns = (snResponse.data as any[])
              .map(item => (item.serial_number || '').trim())
              .filter((sn: string) => !!sn)
            setOutboundSNCodes(sns)
          }
        } catch (error) {
          console.error('加载出库SN明细失败:', error)
        }
      }
    } finally {
      setLoadingOutboundDetail(false)
    }
  }

  // 服务费管理相关函数
  const handleManageServiceFee = async (customer: Customer) => {
    setSelectedCustomerForFee(customer)
    setServiceFeeModalVisible(true)
    await loadServiceFeeRecords(customer.id)
  }

  const loadServiceFeeRecords = async (customerId: number) => {
    try {
      setServiceFeeLoading(true)
      const res = await customerAPI.getServiceFeeRecords(customerId)
      if (res.success && res.data) {
        setServiceFeeRecords(res.data)
      } else {
        setServiceFeeRecords([])
      }
    } catch (error) {
      console.error('加载服务费记录失败:', error)
      message.error('加载服务费记录失败')
    } finally {
      setServiceFeeLoading(false)
    }
  }

  const handleAddFeeRecord = () => {
    setEditingFeeRecord(null)
    serviceFeeForm.resetFields()
    serviceFeeForm.setFieldsValue({ customer_id: selectedCustomerForFee?.id })
    // 设置默认金额为上次记录的金额
    if (serviceFeeRecords.length > 0) {
      const lastRecord = serviceFeeRecords[0] // 已按时间倒序排列
      if (lastRecord.amount !== undefined && lastRecord.amount !== null) {
        serviceFeeForm.setFieldsValue({ amount: lastRecord.amount })
      }
    }
    setFeeRecordModalVisible(true)
  }

  const handleEditFeeRecord = (record: ServiceFeeRecord) => {
    setEditingFeeRecord(record)
    serviceFeeForm.setFieldsValue({
      customer_id: record.customer_id,
      start_date: record.start_date ? dayjs(record.start_date) : null,
      end_date: record.end_date ? dayjs(record.end_date) : null,
      payment_date: record.payment_date ? dayjs(record.payment_date) : null,
      is_paid: record.is_paid,
      amount: record.amount,
      notes: record.notes
    })
    setFeeRecordModalVisible(true)
  }

  const handleFeeRecordSubmit = async () => {
    try {
      const values = await serviceFeeForm.validateFields()
      const submitData = {
        customer_id: selectedCustomerForFee?.id,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD'),
        payment_date: values.payment_date?.format('YYYY-MM-DD') || null,
        is_paid: values.is_paid ? 1 : 0,
        amount: values.amount || null,
        notes: values.notes
      }

      if (editingFeeRecord) {
        // 更新服务费记录
        const res = await customerAPI.updateServiceFeeRecord(editingFeeRecord.id, submitData)
        if (res.success) {
          message.success('服务费记录更新成功')
          setFeeRecordModalVisible(false)
          serviceFeeForm.resetFields()
          setEditingFeeRecord(null)
          if (selectedCustomerForFee) {
            await loadServiceFeeRecords(selectedCustomerForFee.id)
          }
        } else {
          message.error(res.error || '服务费记录更新失败')
        }
      } else {
        // 创建服务费记录
        const res = await customerAPI.createServiceFeeRecord(submitData)
        if (res.success) {
          message.success('服务费记录创建成功')
          setFeeRecordModalVisible(false)
          serviceFeeForm.resetFields()
          if (selectedCustomerForFee) {
            await loadServiceFeeRecords(selectedCustomerForFee.id)
          }
        } else {
          message.error(res.error || '服务费记录创建失败')
        }
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      message.error(error?.message || '操作失败')
    }
  }

  const handleDeleteFeeRecord = (record: ServiceFeeRecord) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除这条服务费记录吗？\n时间：${record.start_date} 至 ${record.end_date}${record.amount ? '\n金额：¥' + record.amount.toFixed(2) : ''}`,
      onOk: async () => {
        try {
          const res = await customerAPI.deleteServiceFeeRecord(record.id)
          if (res.success) {
            message.success('服务费记录删除成功')
            if (selectedCustomerForFee) {
              await loadServiceFeeRecords(selectedCustomerForFee.id)
            }
          } else {
            message.error(res.error || '服务费记录删除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '服务费记录删除失败')
        }
      }
    })
  }

  const handleToggleStatus = async (customer: Customer) => {
    try {
      const newStatus = customer.status === 1 ? 0 : 1
      const actionText = newStatus === 1 ? '启用' : '停用'
      const res = await customerAPI.updateCustomer(customer.id, { status: newStatus })
      if (res.success) {
        message.success(`客户${actionText}成功`)
        loadCustomers()
      } else {
        message.error(res.error || `客户${actionText}失败`)
      }
    } catch (error: any) {
      message.error(error?.message || '操作失败')
    }
  }

  const columns = [
    {
      title: '客户编码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      align: 'center' as const,
      render: (text: string) => text || '-'
    },
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      align: 'center' as const,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '联系人',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 90,
      align: 'center' as const,
    },
    {
      title: '联系电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      align: 'center' as const,
    },
    {
      title: '到期状态',
      key: 'fee_status',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: Customer & { fee_status?: string }) => {
        const isExpired = record.fee_status === '已到期'
        return (
          <Tag color={isExpired ? 'red' : 'green'}>
            {record.fee_status || '未知'}
          </Tag>
        )
      }
    },
        {
      title: '最后到期时间',
      key: 'last_fee_end_date',
      dataIndex: 'last_fee_end_date',
      width: 130,
      align: 'center' as const,
      sorter: (a: any, b: any) => {
        const aDate = a.last_fee_end_date ? new Date(a.last_fee_end_date).getTime() : 0
        const bDate = b.last_fee_end_date ? new Date(b.last_fee_end_date).getTime() : 0
        return aDate - bDate
      },
      sortOrder: sortField === 'last_fee_end_date' ? sortOrder : undefined,
      render: (text: string) => text || '-'
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 180,
      ellipsis: true,
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: Customer) => (
        <Tag
          color={record.status === 1 ? 'success' : 'default'}
          style={{ cursor: 'pointer' }}
          onClick={() => handleToggleStatus(record)}
        >
          {record.status === 1 ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: Customer) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => handleViewCustomer(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="服务费管理">
            <Button
              type="link"
              icon={<MoneyCollectOutlined />}
              onClick={() => handleManageServiceFee(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="门店管理">
            <Button
              type="link"
              icon={<ShopOutlined />}
              onClick={() => handleManageStores(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="编辑客户">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
              size="small"
            />
          </Tooltip>
        </Space>
      )
    }
  ]

  return (
    <div className="page-transition">
      <Card
        title="客户管理"
        extra={
          <Space>
            <Button 
              type="link" 
              icon={<HistoryOutlined />}
              onClick={() => setLogModalVisible(true)}
              style={{boxShadow:'0 0 1px 0 black', borderRadius: '5px'}}
            >
              查看操作日志
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              新建客户
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Input.Search
              placeholder="搜索客户名称、联系人或电话"
              allowClear
              style={{ width: 300 }}
              onSearch={(value) => {
                setSearchKeyword(value)
                setCurrentPage(1)
              }}
              onChange={(e) => {
                if (e.target.value === '') {
                  setSearchKeyword('')
                  setCurrentPage(1)
                }
              }}
            />
            <Select
              placeholder="状态筛选"
              allowClear
              style={{ width: 120 }}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
            >
              <Option value={1}>启用</Option>
              <Option value={0}>停用</Option>
            </Select>
            <Select
              placeholder="到期状态"
              allowClear
              style={{ width: 120 }}
              value={feeStatusFilter}
              onChange={(value) => {
                setFeeStatusFilter(value)
                setCurrentPage(1)
              }}
            >
              <Option value="未到期">未到期</Option>
              <Option value="已到期">已到期</Option>
            </Select>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={customers}
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
              `第 ${range[0]}-${range[1]} 条/共 ${total} 条`,
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            }
          }}
          onChange={(pagination, filters, sorter) => {
            if (!Array.isArray(sorter) && sorter.field) {
              const field = sorter.field as string
              const order = sorter.order === 'ascend' ? 'asc' : sorter.order === 'descend' ? 'desc' : undefined
              if (field === 'last_fee_end_date') {
                setSortField(field)
                setSortOrder(order)
              }
            } else {
              setSortField(undefined)
              setSortOrder(undefined)
            }
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* 新建/编辑客户模态框 */}
      <Modal
        title={editingCustomer ? '编辑客户' : '新建客户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          setEditingCustomer(null)
          customerForm.resetFields()
        }}
        width={600}
      >
        <Form
          form={customerForm}
          layout="vertical"
        >
          <Form.Item
            label="客户编码"
            name="code"
            tooltip="新建时可填写，建立后不可修改。如不填写，系统将自动生成"
            rules={[
              { pattern: /^\d*$/, message: '只能输入数字' }
            ]}
          >
            <Input 
              placeholder="请输入客户编码（只能输入数字）" 
              disabled={!!editingCustomer}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '')
                customerForm.setFieldsValue({ code: value })
              }}
            />
          </Form.Item>
          <Form.Item
            label="客户名称"
            name="name"
            rules={[{ required: true, message: '请输入客户名称' }]}
          >
            <Input placeholder="请输入客户名称" />
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
            label="地址"
            name="address"
          >
            <TextArea rows={2} placeholder="请输入地址" />
          </Form.Item>
          
          <Divider orientation="left" plain>后台信息</Divider>
          
          <Form.Item
            label="后台网址"
            name="backend_url"
          >
            <Input placeholder="请输入后台网址" />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="后台账号"
                name="backend_account"
              >
                <Input placeholder="请输入后台账号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="后台密码"
                name="backend_password"
              >
                <Input.Password placeholder="请输入后台密码" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            label="升级密码"
            name="upgrade_password"
          >
            <Input.Password placeholder="请输入升级密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看客户详情模态框 */}
      <Modal
        title={`客户详情 - ${viewingCustomer?.name || ''}`}
        open={viewModalVisible}
        onCancel={() => {
          setViewModalVisible(false)
          setViewingCustomer(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setViewModalVisible(false)
            setViewingCustomer(null)
          }}>
            关闭
          </Button>,
          <Button key="repair" type="primary" icon={<ToolOutlined />} onClick={() => {
            if (viewingCustomer) {
              handleViewCustomerRepairs(viewingCustomer)
            }
          }}>
            维修记录
          </Button>
        ]}
        width={600}
      >
        {viewingCustomer && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="客户编码">{viewingCustomer.code || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户名称">{viewingCustomer.name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{viewingCustomer.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{viewingCustomer.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>{viewingCustomer.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="后台网址" span={2}>
                {viewingCustomer.backend_url ? (
                  <a href={viewingCustomer.backend_url} target="_blank" rel="noopener noreferrer">{viewingCustomer.backend_url}</a>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="后台账号">{viewingCustomer.backend_account || '-'}</Descriptions.Item>
              <Descriptions.Item label="后台密码">{viewingCustomer.backend_password || '-'}</Descriptions.Item>
              <Descriptions.Item label="升级密码">{viewingCustomer.upgrade_password || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
      
      {/* 客户维修记录查看模态框 */}
      <Modal
        title={`维修记录 - ${viewingCustomer?.name || ''}`}
        open={customerRepairModalVisible}
        onCancel={() => {
          setCustomerRepairModalVisible(false)
          setCustomerRepairRecords([])
        }}
        footer={[
          <Button key="close" onClick={() => {
            setCustomerRepairModalVisible(false)
            setCustomerRepairRecords([])
          }}>
            关闭
          </Button>
        ]}
        width={900}
      >
        <Table
          columns={[
            { title: 'SN码', dataIndex: 'serial_number', key: 'serial_number', width: 150, align: 'center' as const },
            { title: '商品ID', dataIndex: 'product_id', key: 'product_id', width: 80, align: 'center' as const },
            { title: '门店', dataIndex: 'store_name', key: 'store_name', width: 120, align: 'center' as const, render: (text: string) => text || '-' },
            { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, align: 'center' as const, render: (val: number) => val ? `¥${val.toFixed(2)}` : '-' },
            { title: '维修日期', key: 'repair_date', width: 120, align: 'center' as const, render: (_: any, record: any) => {
              if (record.parts && record.parts.length > 0) {
                return record.parts[0].repair_date || '-'
              }
              return '-'
            }},
            { title: '质保截止', key: 'warranty_end_date', width: 120, align: 'center' as const, render: (_: any, record: any) => {
              if (record.parts && record.parts.length > 0) {
                return record.parts[0].warranty_end_date || '-'
              }
              return '-'
            }},
          ]}
          dataSource={customerRepairRecords}
          loading={customerRepairLoading}
          rowKey="id"
          pagination={false}
          scroll={{ y: 400 }}
        />
      </Modal>
      
      {/* 门店管理模态框 */}
      <Modal
        title={`门店管理 - ${selectedCustomer?.name || ''}`}
        open={storesModalVisible}
        onCancel={() => {
          setStoresModalVisible(false)
          setSelectedCustomer(null)
          setStores([])
        }}
        footer={[
          <Button key="close" onClick={() => {
            setStoresModalVisible(false)
            setSelectedCustomer(null)
            setStores([])
          }}>
            关闭
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAddStore}>
            新建门店
          </Button>
        ]}
        width={800}
      >
        <Table
          columns={[
            {
              title: '门店名称',
              dataIndex: 'store_name',
              key: 'store_name',
              width: 150,
              align: 'center' as const,
              render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
            },
            {
              title: '地址',
              dataIndex: 'address',
              key: 'address',
              width: 200,
              ellipsis: true,
              align: 'center' as const,
            },
            {
              title: '联系人',
              dataIndex: 'contact_person',
              key: 'contact_person',
              width: 120,
              align: 'center' as const,
            },
            {
              title: '联系电话',
              dataIndex: 'phone',
              key: 'phone',
              width: 130,
              align: 'center' as const,
            },
            {
              title: '操作',
              key: 'action',
              width: 100,
              align: 'center' as const,
              render: (_: any, record: CustomerStore) => (
                <Space size="small">
                  <Tooltip title="编辑门店">
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEditStore(record)}
                      size="small"
                    />
                  </Tooltip>
                  <Tooltip title="出库记录">
                    <Button
                      type="link"
                      icon={<EyeOutlined />}
                      onClick={() => handleViewStoreOutbound(record)}
                      size="small"
                    />
                  </Tooltip>
                  <Tooltip title="删除门店">
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteStore(record)}
                      size="small"
                    />
                  </Tooltip>
                </Space>
              )
            }
          ]}
          dataSource={stores}
          loading={storesLoading}
          rowKey="id"
          pagination={false}
        />
      </Modal>

      {/* 新建/编辑门店模态框 */}
      <Modal
        title={editingStore ? '编辑门店' : '新建门店'}
        open={storeModalVisible}
        onOk={handleStoreSubmit}
        style={{ top: 20 }}       // 距离顶部的距离
        onCancel={() => {
          setStoreModalVisible(false)
          setEditingStore(null)
          storeForm.resetFields()
        }}
        width={500}
      >
        <Form
          form={storeForm}
          layout="vertical"
        >
          <Form.Item name="customer_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            label="门店名称"
            name="store_name"
            rules={[{ required: true, message: '请输入门店名称' }]}
          >
            <Input placeholder="请输入门店名称" />
          </Form.Item>
          <Form.Item
            label="地址"
            name="address"
          >
            <TextArea rows={2} placeholder="请输入门店地址" />
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
        </Form>
      </Modal>

      {/* 门店出库记录 */}
      <Modal
        title={`出库记录 - ${selectedStore?.store_name || ''}`}
        open={outboundRecordsModalVisible}
        onCancel={() => {
          setOutboundRecordsModalVisible(false)
          setSelectedStore(null)
          setOutboundRecords([])
        }}
        footer={null}
        width={1300}
      >
        <Table
          columns={[
            { title: '商品名称', dataIndex: 'product_name', key: 'product_name', width: 180, align: 'center' as const },
            { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 160, align: 'center' as const },
            { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120, align: 'center' as const },
            { title: '门店', dataIndex: 'store_name', key: 'store_name', width: 120, render: (text: string) => text || '-', align: 'center' as const },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' as const },
            { title: '出库日期', dataIndex: 'outbound_date', key: 'outbound_date', width: 180, render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-', align: 'center' as const },
            { title: '存放位置', dataIndex: 'location', key: 'location', width: 140, align: 'center' as const },
            { title: '备注', dataIndex: 'notes', key: 'notes', ellipsis: true, width: 140, align: 'center' as const },
            {
              title: '操作',
              key: 'action',
              width: 100,
              align: 'center' as const,
              fixed: 'right' as const,
              render: (_: any, record: any) => (
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => handleViewOutboundDetail(record)}
                >
                  查看
                </Button>
              )
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
            showQuickJumper: true,
            showTotal: (t: number, range: [number, number]) => `第 ${range[0]}-${range[1]} 条/共 ${t} 条`,
            onChange: (page: number, size: number) => {
              if (selectedStore) {
                loadStoreOutboundRecords(selectedStore.id, page, size)
              }
            }
          }}
        />
      </Modal>

      {/* 出库记录详情弹窗 */}
      <Modal
        title="操作描述详情"
        open={outboundDetailVisible}
        onCancel={() => {
          setOutboundDetailVisible(false)
          setSelectedOutboundRecord(null)
          setOutboundProductInfo(null)
          setOutboundSNCodes([])
        }}
        footer={[
          <Button key="close" onClick={() => {
            setOutboundDetailVisible(false)
            setSelectedOutboundRecord(null)
            setOutboundProductInfo(null)
            setOutboundSNCodes([])
          }}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedOutboundRecord && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>出库时间：</Text>
                <Text>
                  {selectedOutboundRecord.outbound_date 
                    ? dayjs(selectedOutboundRecord.outbound_date).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Text>
              </div>
              <div>
                <Text strong>操作类型：</Text>
                <Tag color="orange">商品出库</Tag>
              </div>
              <div>
                <Text strong>操作描述：</Text>
                <div style={{ 
                  marginTop: 8, 
                  padding: 12, 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {selectedOutboundRecord.product_name 
                    ? `出库: ${selectedOutboundRecord.product_name}, 数量 ${selectedOutboundRecord.quantity || 0}, 客户: ${selectedOutboundRecord.customer_name || '-'}, 门店: ${selectedOutboundRecord.store_name || '-'}${selectedOutboundRecord.batch_number ? `, 批次号: ${selectedOutboundRecord.batch_number}` : ''}${selectedOutboundRecord.notes ? `, 备注: ${selectedOutboundRecord.notes}` : ''}`
                    : '无描述'}
                </div>
              </div>
              <div>
                <Text strong>详细内容：</Text>
                <div style={{ 
                  marginTop: 8, 
                  padding: 12, 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: 4,
                  maxHeight: 300,
                  overflowY: 'auto'
                }}>
                  {loadingOutboundDetail ? (
                    <div>加载中...</div>
                  ) : (
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      <div>
                        <Text strong>商品名称：</Text>
                        <Text>{outboundProductInfo?.name ? `${outboundProductInfo.name} (SKU: ${outboundProductInfo.sku})` : selectedOutboundRecord.product_name || '-'}</Text>
                      </div>
                      {outboundProductInfo?.category_name && (
                        <div>
                          <Text strong>商品分类：</Text>
                          <Text>{outboundProductInfo.category_name}</Text>
                        </div>
                      )}
                      <div>
                        <Text strong>出库数量：</Text>
                        <Text>{selectedOutboundRecord.quantity || 0}</Text>
                      </div>
                      {selectedOutboundRecord.outbound_price && (
                        <div>
                          <Text strong>出库价格：</Text>
                          <Text>¥{Number(selectedOutboundRecord.outbound_price).toFixed(2)}</Text>
                        </div>
                      )}
                      {selectedOutboundRecord.batch_number && (
                        <div>
                          <Text strong>批次号：</Text>
                          <Text>{selectedOutboundRecord.batch_number}</Text>
                        </div>
                      )}
                      {selectedOutboundRecord.customer_name && (
                        <div>
                          <Text strong>客户：</Text>
                          <Text>{selectedOutboundRecord.customer_name}</Text>
                        </div>
                      )}
                      {selectedOutboundRecord.store_name && (
                        <div>
                          <Text strong>门店：</Text>
                          <Text>{selectedOutboundRecord.store_name}</Text>
                        </div>
                      )}
                      {selectedOutboundRecord.location && (
                        <div>
                          <Text strong>存放位置：</Text>
                          <Text>{selectedOutboundRecord.location}</Text>
                        </div>
                      )}
                      {outboundSNCodes.length > 0 && (
                        <div>
                          <Text strong>SN码：</Text>
                          <div style={{ marginTop: 4 }}>
                            <Text style={{ wordBreak: 'break-all' }}>
                              {outboundSNCodes.join('、')}
                            </Text>
                          </div>
                        </div>
                      )}
                      {selectedOutboundRecord.notes && (
                        <div>
                          <Text strong>备注：</Text>
                          <Text>{selectedOutboundRecord.notes}</Text>
                        </div>
                      )}
                    </Space>
                  )}
                </div>
              </div>
            </Space>
          </div>
        )}
      </Modal>

      <ActivityLogModal
        visible={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        filters={{
          table_name: 'customers'
        }}
      />

      {/* 服务费管理弹窗 */}
      <Modal
        title={`服务费管理 - ${selectedCustomerForFee?.name || ''}`}
        open={serviceFeeModalVisible}
        onCancel={() => {
          setServiceFeeModalVisible(false)
          setSelectedCustomerForFee(null)
          setServiceFeeRecords([])
        }}
        footer={[
          <Button key="close" onClick={() => {
            setServiceFeeModalVisible(false)
            setSelectedCustomerForFee(null)
            setServiceFeeRecords([])
          }}>
            关闭
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAddFeeRecord}>
            新增记录
          </Button>
        ]}
        width={1200}
      >
        <Table
          columns={[
            {
              title: '开始日期',
              dataIndex: 'start_date',
              key: 'start_date',
              width: 120,
              align: 'center' as const,
              render: (text: string) => text || '-'
            },
            {
              title: '结束日期',
              dataIndex: 'end_date',
              key: 'end_date',
              width: 120,
              align: 'center' as const,
              render: (text: string) => text || '-'
            },
            {
              title: '交款日期',
              dataIndex: 'payment_date',
              key: 'payment_date',
              width: 120,
              align: 'center' as const,
              render: (text: string) => text || '-'
            },
            {
              title: '金额',
              dataIndex: 'amount',
              key: 'amount',
              width: 100,
              align: 'center' as const,
              render: (amount: number) => amount ? `¥${amount.toFixed(2)}` : '-'
            },
            {
              title: '是否交款',
              dataIndex: 'is_paid',
              key: 'is_paid',
              width: 100,
              align: 'center' as const,
              render: (isPaid: number) => (
                <Tag color={isPaid === 1 ? 'green' : 'red'}>
                  {isPaid === 1 ? '已交款' : '未交款'}
                </Tag>
              )
            },
            {
              title: '到期状态',
              key: 'status',
              width: 100,
              align: 'center' as const,
              render: (_: any, record: ServiceFeeRecord) => {
                const today = dayjs().format('YYYY-MM-DD')
                const isExpired = record.end_date < today
                return (
                  <Tag color={isExpired ? 'red' : 'green'}>
                    {isExpired ? '已到期' : '未到期'}
                  </Tag>
                )
              }
            },
            {
              title: '备注',
              dataIndex: 'notes',
              key: 'notes',
              width: 150,
              ellipsis: true,
              align: 'center' as const,
              render: (text: string) => text || '-'
            },
            {
              title: '操作',
              key: 'action',
              width: 100,
              align: 'center' as const,
              render: (_: any, record: ServiceFeeRecord) => (
                <Space size="small">
                  <Tooltip title="编辑">
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => handleEditFeeRecord(record)}
                      size="small"
                    />
                  </Tooltip>
                  <Tooltip title="删除">
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteFeeRecord(record)}
                      size="small"
                    />
                  </Tooltip>
                </Space>
              )
            }
          ]}
          dataSource={serviceFeeRecords}
          loading={serviceFeeLoading}
          rowKey="id"
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Modal>

      {/* 服务费记录编辑弹窗 */}
      <Modal
        title={editingFeeRecord ? '编辑服务费记录' : '新增服务费记录'}
        open={feeRecordModalVisible}
        onOk={handleFeeRecordSubmit}
        onCancel={() => {
          setFeeRecordModalVisible(false)
          setEditingFeeRecord(null)
          serviceFeeForm.resetFields()
        }}
        width={600}
      >
        <Form
          form={serviceFeeForm}
          layout="vertical"
        >
          <Form.Item name="customer_id" hidden>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="开始日期"
                name="start_date"
                rules={[{ required: true, message: '请选择开始日期' }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="结束日期"
                name="end_date"
                rules={[{ required: true, message: '请选择结束日期' }]}
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="交款日期"
                name="payment_date"
              >
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="金额"
                name="amount"
                rules={[{ required: true, message: '请输入金额' }]}
              >
                <Input type="number" placeholder="请输入金额" style={{ width: '100%' }} suffix="元" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="是否交款"
            name="is_paid"
            valuePropName="checked"
          >
            <Switch checkedChildren="已交款" unCheckedChildren="未交款" />
          </Form.Item>
          <Form.Item
            label="备注"
            name="notes"
          >
            <TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Customers

