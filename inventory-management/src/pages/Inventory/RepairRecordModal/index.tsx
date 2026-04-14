import React, { useEffect, useState } from 'react'
import {
  Modal, Button, Table, Space, Tag, Typography, Empty, Spin, Divider,
  Form, DatePicker, InputNumber, Input, Select, Row, Col, App, Descriptions, Tooltip
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ToolOutlined, ExclamationCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { repairAPI, customerAPI } from '@/services/api'
import type { RepairRecord, RepairPart } from '@/services/database/RepairService'

const { Text } = Typography

interface Props {
  open: boolean
  serialNumber: string
  productId: number
  onClose: () => void
}

const RepairRecordModal: React.FC<Props> = ({ open, serialNumber, productId, onClose }) => {
  const { message, modal } = App.useApp()

  // 列表视图状态
  const [records, setRecords] = useState<RepairRecord[]>([])
  const [loading, setLoading] = useState(false)

  // 新增维修弹窗状态
  const [addVisible, setAddVisible] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [form] = Form.useForm()

  // 详情查看弹窗
  const [detailRecord, setDetailRecord] = useState<RepairRecord | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)

  // 客户与门店
  const [customers, setCustomers] = useState<any[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>()

  // 维修部件列表（新增弹窗内动态行）
  const [parts, setParts] = useState<Partial<RepairPart>[]>([])

  // ========== 加载数据 ==========
  const loadRecords = async () => {
    if (!serialNumber) return
    setLoading(true)
    try {
      const res = await repairAPI.getRepairsBySN(serialNumber)
      if (res.success) {
        setRecords(res.data || [])
      } else {
        message.error(res.error || '获取维修记录失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadCustomers = async () => {
    try {
      const res = await customerAPI.getCustomers(1, 200, '', true)
      if (res.success) setCustomers(res.data?.data || [])
    } catch (e) {
      console.error('加载客户失败', e)
    }
  }

  const loadStores = async (customerId: number) => {
    try {
      const res = await customerAPI.getCustomerStores(customerId)
      if (res.success) setStores(res.data || [])
    } catch (e) {
      console.error('加载门店失败', e)
    }
  }

  useEffect(() => {
    if (open) {
      loadRecords()
      loadCustomers()
    }
  }, [open, serialNumber])

  // ========== 工具函数 ==========

  /** 根据维修日期 + 质保数/单位，计算截止日期 */
  const calcWarrantyEnd = (repairDate: dayjs.Dayjs | null, value: number, unit: 'month' | 'year'): string => {
    if (!repairDate || !value) return ''
    if (unit === 'year') return repairDate.add(value, 'year').format('YYYY-MM-DD')
    return repairDate.add(value, 'month').format('YYYY-MM-DD')
  }

  const partSubtotal = (p: Partial<RepairPart>) =>
    (p.repair_amount || 0) + (p.accessory_amount || 0) + (p.other_amount || 0)

  const totalAmount = parts.reduce((s, p) => s + partSubtotal(p), 0)

  // ========== 维修部件行操作 ==========

  const addPart = () => {
    setParts(prev => [
      ...prev,
      { part_name: '', part_sn: '', repair_amount: 0, accessory_amount: 0, other_amount: 0, warranty_value: 0, warranty_unit: 'month' }
    ])
  }

  const removePart = (idx: number) => {
    setParts(prev => prev.filter((_, i) => i !== idx))
  }

  const updatePart = (idx: number, field: keyof RepairPart, value: any) => {
    setParts(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      // 如果修改了维修日期或质保相关字段，自动重算截止日期
      if (['repair_date', 'warranty_value', 'warranty_unit'].includes(field)) {
        const p = next[idx]
        const rd = p.repair_date ? dayjs(p.repair_date) : null
        next[idx].warranty_end_date = calcWarrantyEnd(rd, p.warranty_value || 0, p.warranty_unit || 'month')
      }
      return next
    })
  }

  // ========== 提交新增维修 ==========

  const handleAddSubmit = async () => {
    try {
      await form.validateFields()
      if (parts.length === 0) {
        message.warning('请至少添加一个维修部件')
        return
      }
      // 验证部件必填项
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        if (!p.part_sn?.trim()) {
          message.warning(`第 ${i + 1} 个部件的SN码不能为空`)
          return
        }
        if (!p.repair_date) {
          message.warning(`第 ${i + 1} 个部件的维修日期为必填项`)
          return
        }
      }

      setAddLoading(true)
      const formValues = form.getFieldsValue()
      const selectedCustomer = customers.find(c => c.id === formValues.customer_id)
      const selectedStore = stores.find(s => s.id === formValues.store_id)

      const payload: RepairRecord = {
        serial_number: serialNumber,
        product_id: productId,
        customer_id: formValues.customer_id,
        store_id: formValues.store_id,
        customer_name: selectedCustomer?.name || selectedCustomer?.company_name || '',
        store_name: selectedStore?.store_name || '',
        parts: parts.map(p => ({
          part_name: p.part_name || '',
          part_sn: p.part_sn!,
          repair_amount: p.repair_amount || 0,
          accessory_amount: p.accessory_amount || 0,
          other_amount: p.other_amount || 0,
          notes: p.notes,
          repair_date: p.repair_date!,
          warranty_value: p.warranty_value || 0,
          warranty_unit: p.warranty_unit || 'month',
          warranty_end_date: p.warranty_end_date || ''
        }))
      }

      const res = await repairAPI.createRepair(payload)
      if (res.success) {
        message.success('维修记录新增成功')
        setAddVisible(false)
        form.resetFields()
        setParts([])
        setSelectedCustomerId(undefined)
        setStores([])
        await loadRecords()
      } else {
        message.error(res.error || '新增失败')
      }
    } catch (e: any) {
      if (e?.errorFields) return // 表单校验失败，antd 已提示
      message.error(e?.message || '新增失败')
    } finally {
      setAddLoading(false)
    }
  }

  // ========== 删除维修记录 ==========

  const handleDelete = (id: number) => {
    modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除这条维修记录吗？此操作不可恢复。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await repairAPI.deleteRepair(id)
        if (res.success) {
          message.success('已删除')
          await loadRecords()
        } else {
          message.error(res.error || '删除失败')
        }
      }
    })
  }

  // ========== 列表列定义 ==========

  const listColumns = [
    {
      title: '最近维修日期',
      key: 'repair_date',
      width: 140,
      render: (_: any, record: RepairRecord) => {
        const latestPart = (record.parts || []).sort((a, b) =>
          dayjs(b.repair_date).valueOf() - dayjs(a.repair_date).valueOf()
        )[0]
        return latestPart?.repair_date ? dayjs(latestPart.repair_date).format('YYYY-MM-DD') : '-'
      }
    },
    {
      title: '维修金额',
      key: 'total_amount',
      width: 100,
      render: (_: any, record: RepairRecord) => (
        <Text strong style={{ color: '#1677ff' }}>
          ¥ {(record.total_amount || 0).toFixed(2)}
        </Text>
      )
    },
    {
      title: '质保截止',
      key: 'warranty_end',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: RepairRecord) => {
        const parts = record.parts || []
        if (parts.length === 0) return '-'
        const latestEnd = parts
          .filter(p => p.warranty_end_date)
          .sort((a, b) => dayjs(b.warranty_end_date).valueOf() - dayjs(a.warranty_end_date).valueOf())[0]
        if (!latestEnd) return '-'
        const isExpired = dayjs(latestEnd.warranty_end_date).isBefore(dayjs(), 'day')
        return (
          <Tag color={isExpired ? 'red' : 'green'}>
            {latestEnd.warranty_end_date}
          </Tag>
        )
      }
    },
    {
      title: '客户名称',
      dataIndex: 'customer_name',
      key: 'customer_name',
      width: 120,
      render: (v: string) => v || '-'
    },
    {
      title: '门店名称',
      dataIndex: 'store_name',
      key: 'store_name',
      width: 120,
      render: (v: string) => v || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: RepairRecord) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            onClick={() => { setDetailRecord(record); setDetailVisible(true) }}
          >
            查看
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id!)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  // ========== 部件列定义（新增弹窗内） ==========

  const partColumns = [
    {
      title: '部件名称',
      key: 'part_name',
      width: 140,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <Input
          size="small"
          placeholder="部件名称"
          value={parts[idx]?.part_name || ''}
          onChange={e => updatePart(idx, 'part_name', e.target.value)}
        />
      )
    },
    {
      title: <span><span style={{ color: '#ff4d4f' }}>*</span> 部件SN码</span>,
      key: 'part_sn',
      width: 160,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <Input
          size="small"
          placeholder="请输入部件SN码"
          value={parts[idx]?.part_sn || ''}
          onChange={e => updatePart(idx, 'part_sn', e.target.value)}
        />
      )
    },
    {
      title: '维修金额',
      key: 'repair_amount',
      width: 110,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          prefix="¥"
          style={{ width: '100%' }}
          value={parts[idx]?.repair_amount || 0}
          onChange={v => updatePart(idx, 'repair_amount', v || 0)}
        />
      )
    },
    {
      title: '配件金额',
      key: 'accessory_amount',
      width: 110,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          prefix="¥"
          style={{ width: '100%' }}
          value={parts[idx]?.accessory_amount || 0}
          onChange={v => updatePart(idx, 'accessory_amount', v || 0)}
        />
      )
    },
    {
      title: '其他费用',
      key: 'other_amount',
      width: 110,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          prefix="¥"
          style={{ width: '100%' }}
          value={parts[idx]?.other_amount || 0}
          onChange={v => updatePart(idx, 'other_amount', v || 0)}
        />
      )
    },
    {
      title: <span><span style={{ color: '#ff4d4f' }}>*</span> 维修日期</span>,
      key: 'repair_date',
      width: 140,
      align: 'center' as const,
      render: (_: any, __: any, idx: number) => (
        <DatePicker
          size="small"
          style={{ width: '100%' }}
          value={parts[idx]?.repair_date ? dayjs(parts[idx].repair_date) : null}
          onChange={d => updatePart(idx, 'repair_date', d ? d.format('YYYY-MM-DD') : '')}
        />
      )
    },
    {
      title: '质保时间',
      key: 'warranty',
      width: 160,
      align: 'center' as const, 
      render: (_: any, __: any, idx: number) => (
        <Space.Compact style={{ width: '100%' }}>
          <InputNumber
            size="small"
            min={0}
            style={{ width: '65%' }}
            value={parts[idx]?.warranty_value || 0}
            onChange={v => updatePart(idx, 'warranty_value', v || 0)}
          />
          <Select
            size="small"
            style={{ width: '35%' }}
            value={parts[idx]?.warranty_unit || 'month'}
            onChange={v => updatePart(idx, 'warranty_unit', v)}
          >
            <Select.Option value="month">月</Select.Option>
            <Select.Option value="year">年</Select.Option>
          </Select>
        </Space.Compact>
      )
    },
    {
      title: '质保截止',
      key: 'warranty_end_date',
      width: 110,
      align: 'center' as const, 
      render: (_: any, __: any, idx: number) => {
        const d = parts[idx]?.warranty_end_date
        return d ? <Tag color="blue">{d}</Tag> : <Text type="secondary">-</Text>
      }
    },
    {
      title: '备注',
      key: 'notes',
      width: 140,
      align: 'center' as const, 
      render: (_: any, __: any, idx: number) => (
        <Input
          size="small"
          placeholder="备注"
          value={parts[idx]?.notes || ''}
          onChange={e => updatePart(idx, 'notes', e.target.value)}
        />
      )
    },
    {
      title: '小计',
      key: 'subtotal',
      width: 90,
      align: 'right' as const,
      render: (_: any, __: any, idx: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          ¥{partSubtotal(parts[idx]).toFixed(2)}
        </Text>
      )
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, __: any, idx: number) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removePart(idx)}
        />
      )
    }
  ]

  // ========== 渲染 ==========

  return (
    <>
      {/* ===== 维修记录列表弹窗 ===== */}
      <Modal
        title={
          <Space>
            <ToolOutlined style={{ color: '#1677ff' }} />
            <span>维修记录</span>
            <Tag color="blue">{serialNumber}</Tag>
          </Space>
        }
        open={open}
        onCancel={onClose}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields()
                setParts([])
                setSelectedCustomerId(undefined)
                setStores([])
                setAddVisible(true)
              }}
            >
              新增维修
            </Button>
            <Button onClick={onClose}>关闭</Button>
          </div>
        }
        width={860}
        destroyOnClose={false}
      >
        <Spin spinning={loading}>
          {records.length === 0 && !loading ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text type="secondary">暂无维修记录</Text>}
              style={{ padding: '40px 0' }}
            />
          ) : (
            <Table
              columns={listColumns}
              dataSource={records}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />
          )}
        </Spin>
      </Modal>

      {/* ===== 新增维修弹窗 ===== */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>新增维修记录</span>
            <Tag color="blue">{serialNumber}</Tag>
          </Space>
        }
        open={addVisible}
        onCancel={() => { setAddVisible(false); form.resetFields(); setParts([]) }}
        width={1200}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              总计金额：<Text strong style={{ color: '#1677ff', fontSize: 16 }}>¥ {totalAmount.toFixed(2)}</Text>
            </Text>
            <Space>
              <Button onClick={() => { setAddVisible(false); form.resetFields(); setParts([]) }}>取消</Button>
              <Button type="primary" loading={addLoading} onClick={handleAddSubmit}>提交</Button>
            </Space>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginBottom: 0 }}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="customer_id" label="客户">
                <Select
                  placeholder="选择客户"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={customers.map(c => ({
                    value: c.id,
                    label: c.name || c.company_name
                  }))}
                  onChange={(v) => {
                    setSelectedCustomerId(v)
                    form.setFieldValue('store_id', undefined)
                    if (v) loadStores(v)
                    else setStores([])
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="store_id" label="门店">
                <Select
                  placeholder={selectedCustomerId ? '选择门店' : '请先选择客户'}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  disabled={!selectedCustomerId}
                  options={stores.map(s => ({
                    value: s.id,
                    label: s.store_name
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider style={{ margin: '8px 0 12px' }}>
          <Space>
            <span style={{ color: '#666' }}>维修部件列表</span>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={addPart}
            >
              添加部件
            </Button>
          </Space>
        </Divider>

        {parts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">点击「添加部件」新增维修部件</Text>}
            style={{ padding: '20px 0' }}
          />
        ) : (
          <>
            <Table
              columns={partColumns}
              dataSource={parts}
              rowKey={(_, idx) => String(idx)}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              bordered
            />
            <div style={{ textAlign: 'right', marginTop: 8, paddingRight: 8 }}>
              <Text type="secondary">总计：</Text>
              <Text strong style={{ color: '#1677ff', fontSize: 15 }}>
                ¥ {totalAmount.toFixed(2)}
              </Text>
            </div>
          </>
        )}
      </Modal>

      {/* ===== 详情查看弹窗 ===== */}
      <Modal
        title={
          <Space>
            <ToolOutlined style={{ color: '#1677ff' }} />
            <span>维修详情</span>
            <Tag color="blue">{serialNumber}</Tag>
          </Space>
        }
        open={detailVisible}
        onCancel={() => { setDetailVisible(false); setDetailRecord(null) }}
        footer={<Button onClick={() => { setDetailVisible(false); setDetailRecord(null) }}>关闭</Button>}
        width={1500}
        destroyOnClose
      >
        {detailRecord && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="SN码">{detailRecord.serial_number}</Descriptions.Item>
              <Descriptions.Item label="总金额">
                <Text strong style={{ color: '#1677ff' }}>
                  ¥ {(detailRecord.total_amount || 0).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="客户">{detailRecord.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="门店">{detailRecord.store_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="记录时间" span={2}>
                {detailRecord.created_at ? dayjs(detailRecord.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>
            <Divider style={{ margin: '8px 0 12px' }}>维修部件明细</Divider>
            <Table
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              bordered
              dataSource={detailRecord.parts || []}
              rowKey="id"
              columns={[
                { title: '部件名称', dataIndex: 'part_name', width: 130, align: 'center' as const, 
                  render: (v: string) => v || '-' },
                { title: '部件SN码', dataIndex: 'part_sn', width: 150, align: 'center' as const, 
                  render: (v: string) => v || '-' },
                {
                  title: '维修日期', dataIndex: 'repair_date', width: 110, align: 'center' as const,  
                  render: (v: string) => v || '-'
                },
                {
                  title: '维修金额', dataIndex: 'repair_amount', width: 100, align: 'center' as const,
                  render: (v: number) => `¥ ${(v || 0).toFixed(2)}`
                },
                {
                  title: '配件金额', dataIndex: 'accessory_amount', width: 100, align: 'center' as const,
                  render: (v: number) => `¥ ${(v || 0).toFixed(2)}`
                },
                {
                  title: '其他费用', dataIndex: 'other_amount', width: 100, align: 'center' as const,
                  render: (v: number) => `¥ ${(v || 0).toFixed(2)}`
                },
                {
                  title: '质保', key: 'warranty', width: 80, align: 'center' as const,
                  render: (_: any, p: RepairPart) => (
                    <span>{p.warranty_value || 0} {p.warranty_unit === 'year' ? '年' : '月'}</span>
                  )
                },
                {
                  title: '质保截止', dataIndex: 'warranty_end_date', width: 110, align: 'center' as const,
                  render: (v: string) => {
                    if (!v) return '-'
                    const isExpired = dayjs(v).isBefore(dayjs(), 'day')
                    return <Tag color={isExpired ? 'red' : 'green'}>{v}</Tag>
                  }
                },
                {
                  title: '小计', key: 'subtotal', width: 100, align: 'center' as const,
                  render: (_: any, p: RepairPart) => (
                    <Text strong style={{ color: '#52c41a' }}>
                      ¥ {((p.repair_amount || 0) + (p.accessory_amount || 0) + (p.other_amount || 0)).toFixed(2)}
                    </Text>
                  )
                },
                {
                  title: '备注', dataIndex: 'notes', width: 140, align: 'center' as const,
                  render: (v: string) => v || '-'
                }
              ]}
              summary={(data) => {
                const total = data.reduce(
                  (s, p) => s + (p.repair_amount || 0) + (p.accessory_amount || 0) + (p.other_amount || 0),
                  0
                )
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={8} align="right">
                      <Text strong>总计</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <Text strong style={{ color: '#1677ff' }}>¥ {total.toFixed(2)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} />
                  </Table.Summary.Row>
                )
              }}
            />
          </>
        )}
      </Modal>
    </>
  )
}

export default RepairRecordModal
