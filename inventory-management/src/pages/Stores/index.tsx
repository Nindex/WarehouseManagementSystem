import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Space, Input, Tag, Modal, App, Select, Tooltip, Form } from 'antd'
import { HistoryOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import ActivityLogModal from '@/components/ActivityLogModal'
import { customerAPI, inventoryAPI } from '@/services/api'
import type { CustomerStore } from '@/services/database/CustomerService'
import type { Customer } from '@/services/database/CustomerService'

interface OutboundRecord {
  id: number
  product_id?: number
  product_name?: string
  batch_number?: string
  customer_name?: string
  store_name?: string
  quantity: number
  outbound_date?: string
  location?: string
  notes?: string
}

const Stores: React.FC = () => {
  const { message } = App.useApp()

  const [stores, setStores] = useState<CustomerStore[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const [outboundVisible, setOutboundVisible] = useState(false)
  const [outboundLoading, setOutboundLoading] = useState(false)
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([])
  const [outboundPage, setOutboundPage] = useState(1)
  const [outboundPageSize, setOutboundPageSize] = useState(20)
  const [outboundTotal, setOutboundTotal] = useState(0)
  const [activeStore, setActiveStore] = useState<CustomerStore | null>(null)
  const [logModalVisible, setLogModalVisible] = useState(false)
  const [storeModalVisible, setStoreModalVisible] = useState(false)
  const [editingStore, setEditingStore] = useState<CustomerStore | null>(null)
  const [storeForm] = Form.useForm()
  const [snItemsCache, setSnItemsCache] = useState<Record<number, string[]>>({})
  const [snLoadingIds, setSnLoadingIds] = useState<Record<number, boolean>>({})

  useEffect(() => {
    loadStores()
  }, [currentPage, pageSize, searchKeyword, selectedCustomerId, statusFilter])

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadStores = async () => {
    try {
      setLoading(true)
      // 门店管理页面显示所有门店（包括停用的）
      const res: any = await (customerAPI as any).getStores(currentPage, pageSize, searchKeyword, selectedCustomerId, true, statusFilter)
      if (res?.success && res.data) {
        setStores(res.data.data || [])
        setTotal(res.data.total || 0)
        setCurrentPage(res.data.page || currentPage)
        setPageSize(res.data.pageSize || pageSize)
      } else {
        setStores([])
      }
    } catch (error) {
      console.error('加载门店失败:', error)
      message.error('加载门店失败')
      setStores([])
    } finally {
      setLoading(false)
    }
  }

  const loadCustomers = async () => {
    try {
      // 门店管理页面的客户筛选需要显示所有客户（包括停用的）
      const res: any = await customerAPI.getCustomers(1, 1000, '', true)
      if (res?.success && res.data) {
        const list = res.data.data ?? res.data?.data?.data ?? res.data?.data ?? []
        setCustomers(list)
      }
    } catch (error) {
      console.error('加载客户列表失败:', error)
    }
  }

  const loadOutboundRecords = async (storeId: number, page = 1, size = 20) => {
    try {
      setOutboundLoading(true)
      const res = await inventoryAPI.getOutboundRecords(page, size, { store_id: storeId })
      if (res.success && res.data) {
        setOutboundRecords(res.data.data || [])
        setOutboundTotal(res.data.total || 0)
        setOutboundPage(res.data.page || 1)
        setOutboundPageSize(res.data.pageSize || 20)
      } else {
        setOutboundRecords([])
      }
    } catch (error) {
      console.error('加载出库记录失败:', error)
      message.error('加载出库记录失败')
      setOutboundRecords([])
    } finally {
      setOutboundLoading(false)
    }
  }

  const handleViewOutbound = (store: CustomerStore) => {
    setActiveStore(store)
    setOutboundVisible(true)
    loadOutboundRecords(store.id, 1, outboundPageSize)
  }

  const handleToggleStoreStatus = async (store: CustomerStore) => {
    try {
      const newStatus = store.status === 1 ? 0 : 1
      const res = await customerAPI.updateStore(store.id, { status: newStatus })
      if (res.success) {
        message.success(`门店${newStatus === 1 ? '启用' : '停用'}成功`)
        loadStores()
      } else {
        message.error(res.error || '操作失败')
      }
    } catch (error: any) {
      message.error(error?.message || '操作失败')
    }
  }

  const handleAddStore = () => {
    setEditingStore(null)
    storeForm.resetFields()
    // 如果上方已经按某个客户筛选，则默认选中该客户
    if (selectedCustomerId) {
      storeForm.setFieldsValue({
        customer_id: selectedCustomerId
      })
    }
    setStoreModalVisible(true)
  }

  const handleEditStore = (store: CustomerStore) => {
    setEditingStore(store)
    storeForm.resetFields()
    storeForm.setFieldsValue({
      customer_id: store.customer_id,
      store_name: store.store_name,
      address: store.address,
      contact_person: store.contact_person,
      phone: store.phone
    })
    setStoreModalVisible(true)
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
            loadStores()
          } else {
            message.error(res.error || '门店删除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '门店删除失败')
        }
      }
    })
  }

  const handleStoreSubmit = async () => {
    try {
      const values = await storeForm.validateFields()

      if (!values.customer_id) {
        message.error('客户不能为空，请重新选择')
        return
      }

      if (editingStore) {
        // 更新门店
        const res = await customerAPI.updateStore(editingStore.id, {
          customer_id: values.customer_id,
          store_name: values.store_name,
          address: values.address,
          contact_person: values.contact_person,
          phone: values.phone
        })
        if (res.success) {
          message.success('门店更新成功')
          setStoreModalVisible(false)
          setEditingStore(null)
          storeForm.resetFields()
          loadStores()
        } else {
          message.error(res.error || '门店更新失败')
        }
      } else {
        // 创建门店
        const res = await customerAPI.createStore({
          customer_id: values.customer_id,
          store_name: values.store_name,
          address: values.address,
          contact_person: values.contact_person,
          phone: values.phone
        })
        if (res.success) {
          message.success('门店创建成功')
          setStoreModalVisible(false)
          storeForm.resetFields()
          loadStores()
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

  // 加载某条出库记录的 SN 明细（从 outbound_sn_items 表），按 outbound_id
  const loadSNItemsForOutbound = async (record: OutboundRecord) => {
    if (!record.id) return
    if (snItemsCache[record.id] || snLoadingIds[record.id]) {
      return
    }
    setSnLoadingIds(prev => ({ ...prev, [record.id]: true }))
    try {
      const res = await inventoryAPI.getOutboundSNItems(record.id)
      if (res.success && res.data) {
        const sns = (res.data as any[])
          .map(item => (item.serial_number || '').trim())
          .filter((sn: string) => !!sn)
        setSnItemsCache(prev => ({ ...prev, [record.id]: sns }))
      } else {
        setSnItemsCache(prev => ({ ...prev, [record.id]: [] }))
      }
    } catch (error) {
      console.error('加载出库SN明细失败:', error)
      setSnItemsCache(prev => ({ ...prev, [record.id]: [] }))
    } finally {
      setSnLoadingIds(prev => ({ ...prev, [record.id]: false }))
    }
  }

  const columns = [
    {
      title: '门店名称',
      dataIndex: 'store_name',
      key: 'store_name',
      width: 160,
      align: 'center' as const,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '客户',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 140,
      align: 'center' as const,
      render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-'
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 150,
      ellipsis: true,
      align: 'center' as const,
    },
    {
      title: '联系人',
      dataIndex: 'contact_person',
      key: 'contact_person',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: CustomerStore) => (
        <Tag
          color={record.status === 1 ? 'success' : 'default'}
          style={{ cursor: 'pointer' }}
          onClick={() => handleToggleStoreStatus(record)}
        >
          {record.status === 1 ? '启用' : '停用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center' as const,
      fixed: 'right' as const,
      render: (_: any, record: CustomerStore) => (
        <Space size="small">
          <Tooltip title="出库记录">
            <Button
              type="link"
              icon={<HistoryOutlined />}
              onClick={() => handleViewOutbound(record)}
              size="small"
            />
          </Tooltip>
          <Tooltip title="编辑门店">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEditStore(record)}
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
        title="门店管理"
        extra={
          <Space>
            <Button
              type="link"
              icon={<HistoryOutlined />}
              onClick={() => setLogModalVisible(true)}
              size="small"
              style={{ boxShadow: '0 0 1px 0 black', borderRadius: '5px' }}
            >
              查看操作日志
            </Button>
            <Select
              allowClear
              placeholder="按客户筛选"
              style={{ width: 200 }}
              showSearch
              optionFilterProp="label"
              value={selectedCustomerId}
              onChange={(value) => {
                setSelectedCustomerId(value)
                setCurrentPage(1)
              }}
              options={customers.map(c => ({
                label: c.name,
                value: c.id
              }))}
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
              <Select.Option value={1}>启用</Select.Option>
              <Select.Option value={0}>停用</Select.Option>
            </Select>
            <Input.Search
              placeholder="搜索门店或客户"
              allowClear
              style={{ width: 260 }}
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddStore}
              size="small"
              style={{ marginLeft: 10, width: 110, height: 32 }}
            >
              新建门店
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={stores}
          loading={loading}
          rowKey="id"
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条/共 ${t} 条`,
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            }
          }}
          scroll={{ x: 750 }}
        />
      </Card>

      <Modal
        title={`出库记录 - ${activeStore?.store_name || ''}`}
        open={outboundVisible}
        onCancel={() => {
          setOutboundVisible(false)
          setActiveStore(null)
          setOutboundRecords([])
        }}
        footer={null}
        width={1000}
      >
        <Table
          columns={[
            { title: '商品名称', dataIndex: 'product_name', key: 'product_name', width: 160, align: 'center' as const },
            { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 120, align: 'center' as const },
            { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 120, align: 'center' as const },
            { title: '门店', dataIndex: 'store_name', key: 'store_name', width: 120, render: (text: string) => text || '-', align: 'center' as const },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' as const },
            { title: '出库日期', dataIndex: 'outbound_date', key: 'outbound_date', width: 180, render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-', align: 'center' as const },
            { title: '存放位置', dataIndex: 'location', key: 'location', width: 140, align: 'center' as const },
            { title: '备注', dataIndex: 'notes', key: 'notes', ellipsis: true, align: 'center' as const }
          ]}
          dataSource={outboundRecords}
          loading={outboundLoading}
          rowKey="id"
          pagination={{
            current: outboundPage,
            pageSize: outboundPageSize,
            total: outboundTotal,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条/共 ${t} 条`,
            onChange: (page, size) => {
              if (activeStore) {
                setOutboundPage(page)
                setOutboundPageSize(size)
                loadOutboundRecords(activeStore.id, page, size)
              }
            },
            onShowSizeChange: (current, size) => {
              if (activeStore) {
                setOutboundPage(1)
                setOutboundPageSize(size)
                loadOutboundRecords(activeStore.id, 1, size)
              }
            }
          }}
          expandable={{
            expandedRowRender: (record: OutboundRecord) => {
              const sns = snItemsCache[record.id]
              const loading = snLoadingIds[record.id]
              if (loading) {
                return <span style={{ color: '#999' }}>SN加载中...</span>
              }
              if (!sns.length) {
                return <span style={{ color: '#999' }}>此记录没有 SN 码</span>
              }
              return (
                <Space size="small" wrap>
                  {sns.map(sn => (
                    <Tag color="blue" key={sn}>{sn}</Tag>
                  ))}
                </Space>
              )
            },
            // 所有记录都允许展开
            rowExpandable: () => true,
            onExpand: (expanded, record: OutboundRecord) => {
              if (expanded) {
                loadSNItemsForOutbound(record)
              }
            }
          }}
        />
      </Modal>

      {/* 新建/编辑门店模态框 */}
      <Modal
        title={editingStore ? '编辑门店' : '新建门店'}
        open={storeModalVisible}
        onOk={handleStoreSubmit}
        onCancel={() => {
          setStoreModalVisible(false)
          setEditingStore(null)
          storeForm.resetFields()
        }}
        width={500}
      >
        <Form form={storeForm} layout="vertical">
          <Form.Item
            label="所属客户"
            name="customer_id"
            rules={[{ required: true, message: '请选择客户' }]}
          >
            <Select
              placeholder="请选择客户"
              showSearch
              optionFilterProp="label"
              options={customers.map(c => ({
                label: c.name,
                value: c.id
              }))}
            />
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
            <Input placeholder="请输入门店地址" />
          </Form.Item>
          <Form.Item
            label="联系人"
            name="contact_person"
          >
            <Input placeholder="请输入联系人" />
          </Form.Item>
          <Form.Item
            label="联系电话"
            name="phone"
          >
            <Input placeholder="请输入联系电话" />
          </Form.Item>
        </Form>
      </Modal>

      <ActivityLogModal
        visible={logModalVisible}
        onCancel={() => setLogModalVisible(false)}
        filters={{
          table_name: 'customer_stores'
        }}
      />
    </div>
  )
}

export default Stores

