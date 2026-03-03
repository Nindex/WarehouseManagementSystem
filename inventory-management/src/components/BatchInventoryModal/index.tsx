import React, { useEffect, useState } from 'react'
import { Modal, Table, Tag, Typography, Space, Alert } from 'antd'
import { inventoryAPI } from '@/services/api'
import dayjs from 'dayjs'
import type { InventoryBatch } from '@/services/database/InventoryService'

const { Text } = Typography

interface BatchInventoryModalProps {
  visible: boolean
  onCancel: () => void
  productId: number
  productName?: string
}

const BatchInventoryModal: React.FC<BatchInventoryModalProps> = ({ 
  visible, 
  onCancel, 
  productId,
  productName 
}) => {
  const [batches, setBatches] = useState<InventoryBatch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && productId) {
      loadBatches()
    }
  }, [visible, productId])

  const loadBatches = async () => {
    try {
      setLoading(true)
      const response = await inventoryAPI.getProductBatches(productId)
      if (response.success && response.data) {
        setBatches(response.data || [])
      } else {
        setBatches([])
      }
    } catch (error) {
      console.error('加载批次库存失败:', error)
      setBatches([])
    } finally {
      setLoading(false)
    }
  }

  // 计算总库存
  const totalQuantity = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0)

  // 检查是否有即将过期的批次（30天内）
  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null
    
    const expiry = dayjs(expiryDate)
    const daysUntilExpiry = expiry.diff(dayjs(), 'day')
    
    if (daysUntilExpiry < 0) {
      return { status: 'error', text: '已过期', days: Math.abs(daysUntilExpiry) }
    } else if (daysUntilExpiry <= 30) {
      return { status: 'warning', text: `即将过期（${daysUntilExpiry}天）`, days: daysUntilExpiry }
    }
    return null
  }

  const columns = [
    {
      title: '批次号',
      dataIndex: 'batch_number',
      key: 'batch_number',
      width: 150,
      render: (text: string) => (
        <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px' }}>
          {text}
        </Tag>
      )
    },
    {
      title: '库存数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      align: 'center' as const,
      render: (quantity: number) => (
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {quantity}
        </span>
      )
    },
    {
      title: '存放位置',
      dataIndex: 'location',
      key: 'location',
      width: 150,
      render: (text: string) => text || '-'
    },
    {
      title: '生产日期',
      dataIndex: 'production_date',
      key: 'production_date',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '过期日期',
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      width: 120,
      render: (date: string) => {
        if (!date) return '-'
        const expiryStatus = getExpiryStatus(date)
        return (
          <Space direction="vertical" size={0}>
            <span>{dayjs(date).format('YYYY-MM-DD')}</span>
            {expiryStatus && (
              <Tag color={expiryStatus.status} style={{ fontSize: 12, padding: '4px 12px' }}>
                {expiryStatus.text}
              </Tag>
            )}
          </Space>
        )
      }
    },
    {
      title: '入库日期',
      dataIndex: 'inbound_date',
      key: 'inbound_date',
      width: 150,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    }
  ]

  return (
    <Modal
      title={`批次库存${productName ? ` - ${productName}` : ''}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={900}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }} size="middle">
        <Alert
          message={
            <Space>
              <Text strong>总库存数量：</Text>
              <Text style={{ fontSize: 16, fontWeight: 600, color: '#1890ff' }}>
                {totalQuantity}
              </Text>
              <Text type="secondary">（共 {batches.length} 个批次）</Text>
            </Space>
          }
          type="info"
          showIcon
        />
      </Space>
      
      <Table
        columns={columns}
        dataSource={batches}
        loading={loading}
        rowKey="id"
        pagination={false}
        scroll={{ y: 400 }}
        locale={{
          emptyText: '暂无批次库存记录'
        }}
      />
    </Modal>
  )
}

export default BatchInventoryModal

