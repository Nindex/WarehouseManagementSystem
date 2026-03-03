import React, { useEffect, useState, useMemo } from 'react'
import { Modal, Table, Tag, Typography, Select, DatePicker, Space, Button, Input, Collapse } from 'antd'
import { EyeOutlined, UpOutlined, DownOutlined } from '@ant-design/icons'
import { systemLogAPI, productAPI, inventoryAPI } from '@/services/api'
import dayjs from 'dayjs'
import type { SystemLog } from '@/services/database/SystemLogService'

const { Text } = Typography
const { RangePicker } = DatePicker
const { Search } = Input
const { Panel } = Collapse

interface ActivityLogModalProps {
  visible: boolean
  onCancel: () => void
  filters?: {
    table_name?: string
    operation_type?: string
    record_id?: number
  }
}

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ visible, onCancel, filters }) => {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [operationType, setOperationType] = useState<string | undefined>(filters?.operation_type)
  const [documentNumber, setDocumentNumber] = useState<string>('')
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [productInfo, setProductInfo] = useState<any>(null) // 商品信息
  const [displaySNCodes, setDisplaySNCodes] = useState<string[]>([]) // 显示的SN码列表
  const [loadingSNCodes, setLoadingSNCodes] = useState(false) // SN码加载状态
  const [mergedNewValues, setMergedNewValues] = useState<any>({}) // 合并后的new_values
  const [productNameMap, setProductNameMap] = useState<Record<number, string>>({}) // 商品ID到商品名称的映射
  
  // 日志合并逻辑
  interface MergedLog extends SystemLog {
    mergedCount?: number
    mergedLogs?: SystemLog[]
    isMerged?: boolean
    timeRange?: string
    totalQuantity?: number
    allSNCodes?: string[]
  }
  
  // 合并相同商品、相同批次、相同操作类型、时间相近的日志
  const allMergedLogs = useMemo(() => {
    if (!logs || logs.length === 0) return []
    
    // 只对库存相关操作进行合并
    const inventoryOperations = ['inbound', 'outbound', 'inventory_check', 'inventory_adjust']
    const merged: MergedLog[] = []
    const processed = new Set<number>()
    
    for (let i = 0; i < logs.length; i++) {
      if (processed.has(logs[i].id)) continue
      
      const currentLog = logs[i]
      const shouldMerge = inventoryOperations.includes(currentLog.operation_type) && 
                         currentLog.table_name === 'inventory'
      
      if (!shouldMerge) {
        // 不需要合并的日志直接添加
        merged.push(currentLog)
        processed.add(currentLog.id)
        continue
      }
      
      // 提取当前日志的信息
      const currentNewValues = typeof currentLog.new_values === 'object' ? currentLog.new_values : {}
      const currentBatchNumber = (currentNewValues as any)?.batch_number
      const currentRecordId = currentLog.record_id
      const currentOpType = currentLog.operation_type
      const currentTime = dayjs(currentLog.created_at)
      
      // 查找可以合并的日志（1分钟内）
      const mergeGroup: SystemLog[] = [currentLog]
      processed.add(currentLog.id)
      
      for (let j = i + 1; j < logs.length; j++) {
        if (processed.has(logs[j].id)) continue
        
        const otherLog = logs[j]
        const otherNewValues = typeof otherLog.new_values === 'object' ? otherLog.new_values : {}
        const otherBatchNumber = (otherNewValues as any)?.batch_number
        const otherRecordId = otherLog.record_id
        const otherOpType = otherLog.operation_type
        const otherTime = dayjs(otherLog.created_at)
        
        // 检查是否可以合并
        const timeDiff = Math.abs(otherTime.diff(currentTime, 'minute'))
        const canMerge = 
          currentRecordId === otherRecordId &&
          currentOpType === otherOpType &&
          currentBatchNumber === otherBatchNumber &&
          timeDiff <= 1 // 1分钟内
          
        if (canMerge) {
          mergeGroup.push(otherLog)
          processed.add(otherLog.id)
        }
      }
      
      // 如果只有一条，直接添加；否则合并
      if (mergeGroup.length === 1) {
        merged.push(currentLog)
      } else {
        // 合并多条日志
        const quantities = mergeGroup.map(log => {
          const nv = typeof log.new_values === 'object' ? log.new_values : {}
          return (nv as any)?.quantity || 0
        })
        const totalQuantity = quantities.reduce((sum, qty) => sum + (Number(qty) || 0), 0)
        
        // 收集所有SN码
        const allSNCodes: string[] = []
        mergeGroup.forEach(log => {
          const nv = typeof log.new_values === 'object' ? log.new_values : {}
          const snCodes = (nv as any)?.sn_codes
          if (Array.isArray(snCodes)) {
            allSNCodes.push(...snCodes)
          }
        })
        
        // 使用第一条记录的时间作为统一时间（同一批次下的SN码使用统一时间）
        const firstTime = dayjs(mergeGroup[0].created_at)
        const timeRange = firstTime.format('YYYY-MM-DD HH:mm:ss')
        
        const mergedLog: MergedLog = {
          ...currentLog,
          isMerged: true,
          mergedCount: mergeGroup.length,
          mergedLogs: mergeGroup,
          timeRange: timeRange,
          totalQuantity,
          allSNCodes: [...new Set(allSNCodes)], // 去重
          created_at: mergeGroup[0].created_at // 使用第一条的时间（统一时间）
        }
        
        merged.push(mergedLog)
      }
    }
    
    return merged
  }, [logs])

  // 前端分页：基于合并后的数据
  const mergedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return allMergedLogs.slice(start, end)
  }, [allMergedLogs, currentPage, pageSize])

  // 当筛选条件改变时，重置到第一页
  useEffect(() => {
    if (visible && (operationType !== undefined || dateRange !== null || documentNumber)) {
      setCurrentPage(1)
    }
  }, [operationType, dateRange, documentNumber, visible])

  useEffect(() => {
    if (visible) {
      loadLogs()
    }
  }, [visible, dateRange, operationType, documentNumber])

  // 加载SN码信息用于显示（从数据库查询，更可靠）
  const loadSNCodesForDisplay = async (log: SystemLog | MergedLog, productId: number, logs?: SystemLog[]) => {
    try {
      setLoadingSNCodes(true)
      
      const mergedLog = log as MergedLog
      let allSNCodesFromLogs: string[] = []
      let totalQuantity = 0
      let batchNumber: string | null = null
      let mergedValues: any = {}
      
      // 如果是合并记录，合并所有日志的信息
      if (mergedLog.isMerged && mergedLog.mergedLogs && mergedLog.mergedLogs.length > 0) {
        const logsToUse = logs && logs.length > 0 ? logs : mergedLog.mergedLogs
        
        logsToUse.forEach((l) => {
          const newValues = typeof l.new_values === 'object' ? l.new_values : {}
          const snCodes = (newValues as any)?.sn_codes
          if (Array.isArray(snCodes)) {
            allSNCodesFromLogs.push(...snCodes)
          }
          const qty = (newValues as any)?.quantity || 0
          totalQuantity += Number(qty) || 0
          
          // 获取批次号（使用第一条记录的批次号）
          if (!batchNumber) {
            batchNumber = (newValues as any)?.batch_number || null
            mergedValues = { ...newValues }
          }
        })
        
        // 使用合并后的数量
        if (mergedLog.totalQuantity !== undefined && mergedLog.totalQuantity !== null) {
          totalQuantity = mergedLog.totalQuantity
        }
      } else {
        // 单条记录
        const newValues = typeof log.new_values === 'object' ? log.new_values : {}
        batchNumber = (newValues as any)?.batch_number || null
        mergedValues = { ...newValues }
        totalQuantity = (newValues as any)?.quantity || 0
        
        const snCodes = (newValues as any)?.sn_codes
        if (Array.isArray(snCodes)) {
          allSNCodesFromLogs = [...snCodes]
        }
      }
      
      // 如果有批次号，从sn_status表查询所有SN码（更可靠）
      if (batchNumber) {
        try {
          const batchResponse = await inventoryAPI.getAllBatchesWithSerialNumbers(1, 1, productId, batchNumber)
          if (batchResponse.success && batchResponse.data && batchResponse.data.data && batchResponse.data.data.length > 0) {
            const batchData = batchResponse.data.data.find((b: any) => b.batch_number === batchNumber) || batchResponse.data.data[0]
            if (batchData && batchData.serial_numbers && batchData.serial_numbers.length > 0) {
              allSNCodesFromLogs = batchData.serial_numbers
              // 如果SN码数量与当前数量不一致，使用SN码数量作为实际数量
              if (allSNCodesFromLogs.length !== totalQuantity) {
                totalQuantity = allSNCodesFromLogs.length
              }
            }
          }
        } catch (error) {
          console.error('查询批次SN码失败:', error)
        }
      }
      
      const uniqueSNCodes = [...new Set(allSNCodesFromLogs)]
      // 如果从日志中获取的SN码数量与数量不一致，也使用SN码数量
      if (uniqueSNCodes.length > 0 && uniqueSNCodes.length !== totalQuantity) {
        totalQuantity = uniqueSNCodes.length
      }
      
      setDisplaySNCodes(uniqueSNCodes)
      setMergedNewValues({
        ...mergedValues,
        sn_codes: uniqueSNCodes,
        quantity: totalQuantity,
        batch_number: batchNumber || mergedValues.batch_number
      })
    } catch (error) {
      console.error('加载SN码失败:', error)
    } finally {
      setLoadingSNCodes(false)
    }
  }

  const loadLogs = async () => {
    try {
      setLoading(true)
      const filterParams: any = {}
      
      if (filters?.table_name) {
        filterParams.table_name = filters.table_name
      }
      
      if (filters?.record_id) {
        filterParams.record_id = filters.record_id
      }
      
      if (operationType) {
        filterParams.operation_type = operationType
      }
      
      // 处理时间范围（onChange 已自动设置默认时分秒）
      if (dateRange && dateRange[0]) {
        filterParams.start_date = dateRange[0].format('YYYY-MM-DD HH:mm:ss')
      }
      
      if (dateRange && dateRange[1]) {
        filterParams.end_date = dateRange[1].format('YYYY-MM-DD HH:mm:ss')
      }
      
      if (documentNumber) {
        filterParams.document_number = documentNumber
      }
      
      // 一次性获取所有数据，然后在前端进行合并和分页
      const response = await systemLogAPI.getLogs(1, 10000, filterParams)
      if (response.success && response.data) {
        setLogs(response.data.data || [])
        setTotal(response.data.total || 0)
        
        // 收集所有入库和盘点操作的商品ID，批量查询商品信息
        const productIds = new Set<number>()
        response.data.data.forEach((log: SystemLog) => {
          if ((log.operation_type === 'inbound' || log.operation_type === 'inventory_check') 
              && log.table_name === 'inventory' && log.record_id) {
            productIds.add(log.record_id)
          }
        })
        
        // 批量查询商品信息
        if (productIds.size > 0) {
          const productNameMapTemp: Record<number, string> = {}
          const productPromises = Array.from(productIds).map(async (productId) => {
            try {
              const productResponse = await productAPI.getProduct(productId)
              if (productResponse.success && productResponse.data) {
                productNameMapTemp[productId] = productResponse.data.name ? productResponse.data.name + ' (SKU: ' + productResponse.data.sku + ')' : `商品ID ${productId}`
              }
            } catch (error) {
              console.error(`获取商品 ${productId} 信息失败:`, error)
              productNameMapTemp[productId] = `商品ID ${productId}`
            }
          })
          
          await Promise.all(productPromises)
          setProductNameMap(productNameMapTemp)
        }
      } else {
        setLogs([])
        setTotal(0)
      }
    } catch (error) {
      console.error('加载操作日志失败:', error)
      setLogs([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // 操作类型映射
  const operationTypeMap: Record<string, { text: string; color: string }> = {
    'create_product': { text: '创建商品', color: 'blue' },
    'update_product': { text: '更新商品', color: 'cyan' },
    'delete_product': { text: '删除商品', color: 'red' },
    'inbound': { text: '商品入库', color: 'green' },
    'outbound': { text: '商品出库', color: 'orange' },
    'inventory_check': { text: '库存盘点', color: 'purple' },
    'inventory_adjust': { text: '库存调整', color: 'purple' },
    'delete_serial_number': { text: '删除SN码', color: 'red' },
    'create_purchase_order': { text: '创建采购订单', color: 'blue' },
    'update_purchase_order_status': { text: '更新采购订单状态', color: 'cyan' },
    'approve_purchase_order': { text: '审核采购订单', color: 'green' },
    'reject_purchase_order': { text: '拒绝采购订单', color: 'red' },
    'create_purchase_return': { text: '创建采购退货', color: 'orange' },
    'approve_purchase_return': { text: '审核采购退货', color: 'green' },
    'reject_purchase_return': { text: '拒绝采购退货', color: 'red' },
    'create_supplier': { text: '创建供应商', color: 'blue' },
    'delete_supplier': { text: '删除供应商', color: 'red' },
    'create_customer': { text: '创建客户', color: 'blue' },
    'update_customer': { text: '更新客户', color: 'cyan' },
    'delete_customer': { text: '删除客户', color: 'red' },
    'update_store': { text: '更新门店', color: 'cyan' },
    'create_store': { text: '创建门店', color: 'blue' },
    'delete_store': { text: '删除门店', color: 'red' }
  }

  // 根据 table_name 过滤操作类型
  const getFilteredOperationTypes = () => {
    if (!filters?.table_name) {
      // 如果没有指定 table_name，返回所有操作类型
      return operationTypeMap
    }

    // 根据 table_name 返回相关的操作类型
    const tableOperationMap: Record<string, string[]> = {
      'products': ['create_product', 'update_product', 'delete_product'],
      'inventory': ['inbound', 'outbound', 'inventory_check', 'inventory_adjust'],
      'sn_status': ['delete_serial_number'],
      'purchase_orders': ['create_purchase_order', 'update_purchase_order_status', 'approve_purchase_order', 'reject_purchase_order'],
      'purchase_returns': ['create_purchase_return', 'approve_purchase_return', 'reject_purchase_return'],
      'suppliers': ['create_supplier', 'delete_supplier'],
      'customers': ['create_customer', 'update_customer', 'delete_customer'],
      'customer_stores': ['create_store', 'update_store', 'delete_store']
    }

    const allowedTypes = tableOperationMap[filters.table_name] || []
    const filtered: Record<string, { text: string; color: string }> = {}
    
    allowedTypes.forEach(type => {
      if (operationTypeMap[type]) {
        filtered[type] = operationTypeMap[type]
      }
    })

    return filtered
  }

  const filteredOperationTypeMap = getFilteredOperationTypes()

  // 当 filters 改变时，验证并重置 operationType
  useEffect(() => {
    // 如果 filters.operation_type 有值，使用它
    if (filters?.operation_type) {
      setOperationType(filters.operation_type)
      return
    }

    // 获取当前过滤后的操作类型列表
    const currentFilteredTypes = getFilteredOperationTypes()
    
    // 如果当前选择的 operationType 不在新的过滤列表中，清除它
    if (operationType && !currentFilteredTypes[operationType]) {
      setOperationType(undefined)
    }
  }, [filters?.table_name, filters?.operation_type])

  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 65,
      align: 'center' as const,
      fixed: 'left' as const,
      render: (_: any, __: any, index: number) => {
        // 计算序号：(当前页 - 1) * 每页条数 + 索引 + 1
        return (currentPage - 1) * pageSize + index + 1
      }
    },
    {
      title: '操作时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'center' as const,
      width: 180,
      render: (text: string, record: MergedLog) => {
        if (record.isMerged && record.timeRange) {
          return (
            <div>
              <div>{record.timeRange}</div>
              <div style={{ fontSize: '12px', color: '#999' }}>
                合并了 {record.mergedCount} 条记录
              </div>
            </div>
          )
        }
        return dayjs(text).format('YYYY-MM-DD HH:mm:ss')
      }
    },
    {
      title: '操作类型',
      dataIndex: 'operation_type',
      key: 'operation_type',
      align: 'center' as const,
      width: 100,
      render: (type: string) => {
        const info = operationTypeMap[type] || { text: type, color: 'default' }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    {
      title: '操作人员',
      dataIndex: 'user_name',
      key: 'user_name',
      align: 'center' as const,
      width: 100,
      //读取真实操作的账号名称
      render: (text: string, record: any) => {
        return record.user?.user_name || '系统'
      }
    },
    {
      title: '操作描述',
      align: 'center' as const,
      width: 280,
      dataIndex: 'description',
      key: 'description',
      ellipsis: false,
      render: (text: string, record: MergedLog) => {
        // 对于入库操作，显示商品、入库数量、批号
        if (record.operation_type === 'inbound' && record.table_name === 'inventory' && record.record_id) {
          const newValues = typeof record.new_values === 'object' ? record.new_values : {}
          const quantity = record.isMerged ? (record.totalQuantity || 0) : ((newValues as any)?.quantity || 0)
          const batchNumber = (newValues as any)?.batch_number
          const productId = record.record_id
          
          const productName = productNameMap[productId]  
          return (
            <div>
              <div>
                <Text>商品: {productName}<br /></Text>
                {quantity > 0 && (
                  <Text style={{ marginLeft: 8 }}>入库数量: {quantity}<br /></Text>
                )}
                {batchNumber && (
                  <Text style={{ marginLeft: 8 }}>批号: {batchNumber}</Text>
                )}
              </div>
            </div>
          )
        }
        
        if (record.isMerged) {
          const operationTypeText = operationTypeMap[record.operation_type]?.text || record.operation_type
          const newValues = typeof record.new_values === 'object' ? record.new_values : {}
          const batchNumber = (newValues as any)?.batch_number
          const batchInfo = batchNumber ? `，批次：${batchNumber}` : ''
          
          // 盘点操作：不显示SN码，只显示基本信息，包括商品名称
          if (record.operation_type === 'inventory_check') {
            const productId = record.record_id
            const productName = productId ? (productNameMap[productId] || `商品ID ${productId}`) : '未知商品'
            return (
              <div>
                <div style={{ marginBottom: 4 }}>
                  <Text strong>{operationTypeText}</Text>
                  <Text style={{ marginLeft: 8 }}>商品: {productName}</Text>
                  {record.totalQuantity && (
                    <Text style={{ marginLeft: 8, color: '#1890ff' }}>
                      共 {record.totalQuantity} 个
                    </Text>
                  )}
                  {batchInfo && <Text style={{ marginLeft: 8 }}>{batchInfo}</Text>}
                </div>
              </div>
            )
          }
          
          // 其他操作（入库、出库等）：保持原有显示方式
          return (
            <div>
              <div style={{ marginBottom: 4 }}>
                <Text strong>{operationTypeText}</Text>
                {record.totalQuantity && (
                  <Text style={{ marginLeft: 8, color: '#1890ff' }}>
                    共 {record.totalQuantity} 个
                  </Text>
                )}
                {batchInfo && <Text style={{ marginLeft: 8 }}>{batchInfo}</Text>}
              </div>
              {record.allSNCodes && record.allSNCodes.length > 0 && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                  <Text>SN码 ({record.allSNCodes.length} 个)：</Text>
                  {record.allSNCodes.length <= 10 ? (
                    <div style={{ marginTop: 4 }}>
                      {record.allSNCodes.map((sn, idx) => (
                        <Tag key={idx} style={{ marginBottom: '4px', marginRight: '4px' }}>{sn}</Tag>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      <div>
                        {record.allSNCodes.slice(0, 10).map((sn, idx) => (
                          <Tag key={idx} style={{ marginBottom: '4px', marginRight: '4px' }}>{sn}</Tag>
                        ))}
                      </div>
                      <Collapse 
                        ghost
                        size="small"
                        onChange={(keys) => {
                          const rowKey = `${record.id}-sncodes`
                          if (keys.length > 0) {
                            setExpandedRows(prev => new Set([...prev, rowKey]))
                          } else {
                            setExpandedRows(prev => {
                              const next = new Set(prev)
                              next.delete(rowKey)
                              return next
                            })
                          }
                        }}
                      >
                        <Panel 
                          header={
                            <span style={{ color: '#1890ff', cursor: 'pointer', fontSize: '12px' }}>
                              {expandedRows.has(`${record.id}-sncodes`) ? '收起' : `展开查看全部 ${record.allSNCodes.length} 个SN码`}
                            </span>
                          } 
                          key="sncodes"
                        >
                          <div style={{ 
                            maxHeight: '200px', 
                            overflowY: 'auto',
                            padding: '8px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px'
                          }}>
                            {record.allSNCodes.map((sn, idx) => (
                              <Tag key={idx} style={{ marginBottom: '4px', marginRight: '4px' }}>{sn}</Tag>
                            ))}
                          </div>
                        </Panel>
                      </Collapse>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {text || '-'}
            </span>
          </div>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: SystemLog) => (
        <div
          style={{
            position: 'sticky',
            right: 0,
            zIndex: 10,
            backgroundColor: '#fff',
            padding: '4px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={async () => {
              setSelectedLog(record)
              setDetailModalVisible(true)
              setProductInfo(null)
              setDisplaySNCodes([])
              setMergedNewValues({})
              
              // 如果是入库或盘点操作，加载商品信息和SN码
              if ((record.operation_type === 'inbound' || record.operation_type === 'inventory_check') 
                  && record.table_name === 'inventory' && record.record_id) {
                const productId = record.record_id
                
                // 获取商品信息
                try {
                  const productResponse = await productAPI.getProduct(productId)
                  if (productResponse.success && productResponse.data) {
                    setProductInfo(productResponse.data)
                  }
                } catch (error) {
                  console.error('获取商品信息失败:', error)
                }
                
                // 加载SN码信息
                const mergedLog = record as MergedLog
                if (mergedLog.isMerged && mergedLog.mergedLogs && mergedLog.mergedLogs.length > 0) {
                  // 合并记录，传递所有日志
                  await loadSNCodesForDisplay(mergedLog, productId, mergedLog.mergedLogs)
                } else {
                  // 单条记录
                  await loadSNCodesForDisplay(record, productId)
                }
              }
            }}
          >
            查看
          </Button>
        </div>
      )
    }
  ]

  return (
    <Modal
      title="操作日志"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1250}
      centered={true}
      styles={{ body: { maxHeight: '800px', overflowY: 'auto' } }}
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
        <Space wrap>
          <Text>操作类型：</Text>
          <Select
            style={{ width:120}}
            placeholder="全部"
            allowClear
            value={operationType}
            onChange={setOperationType}
          >
            {Object.entries(filteredOperationTypeMap).map(([key, value]) => (
              <Select.Option key={key} value={key}>
                {value.text}
              </Select.Option>
            ))}
          </Select>
          <Text>时间范围：</Text>
          <RangePicker
            showTime={{
              format: 'HH:mm:ss',
              defaultValue: [
                dayjs('00:00:00', 'HH:mm:ss'),  // 开始日期默认时分秒
                dayjs('23:59:59', 'HH:mm:ss')   // 结束日期默认时分秒
              ]
            }}
            format="YYYY-MM-DD HH:mm:ss"
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                let start = dates[0]
                let end = dates[1]
                
                // 如果用户只选择了日期（时分秒为0），设置默认时分秒
                // 检查开始日期：如果时分秒为0，说明用户只选择了日期，设置默认值
                if (start.hour() === 0 && start.minute() === 0 && start.second() === 0) {
                  start = start.startOf('day')  // 设置为 00:00:00
                }
                
                // 检查结束日期：如果时分秒为0，说明用户只选择了日期，设置默认值
                if (end.hour() === 0 && end.minute() === 0 && end.second() === 0) {
                  end = end.endOf('day')  // 设置为 23:59:59
                }
                
                setDateRange([start, end])
              } else {
                setDateRange(null)
              }
            }}
          />
          <Button onClick={loadLogs}>查询</Button>
        </Space>
      </Space>
      <Table
        columns={columns}
        dataSource={mergedLogs}
        loading={loading}
        rowKey={(record) => record.id || `merged-${record.record_id}-${record.operation_type}-${record.created_at}`}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: allMergedLogs.length,
          showSizeChanger: true,
          showTotal: (total, range) => {
            const mergedTotal = allMergedLogs.length
            const originalTotal = logs.length
            if (mergedTotal < originalTotal) {
              return `显示 ${range[0]}-${range[1]} 条，共 ${mergedTotal} 条（已合并 ${originalTotal - mergedTotal} 条），原始记录共 ${originalTotal} 条`
            }
            return `显示 ${range[0]}-${range[1]} 条，共 ${total} 条`
          },
          onChange: (page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }
        }}
        scroll={{ x: 800, y: 1000 }}
      />
      
      {/* 操作描述详情弹窗 */}
      <Modal
        title="操作描述详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false)
          setSelectedLog(null)
          setProductInfo(null)
          setDisplaySNCodes([])
          setMergedNewValues({})
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailModalVisible(false)
            setSelectedLog(null)
            setProductInfo(null)
            setDisplaySNCodes([])
            setMergedNewValues({})
          }}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedLog && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>操作时间：</Text>
                <Text>
                  {(() => {
                    // 如果是合并记录，使用第一条日志的时间（统一时间）
                    const mergedLog = selectedLog as MergedLog
                    if (mergedLog.isMerged && mergedLog.mergedLogs && mergedLog.mergedLogs.length > 0) {
                      // 按时间排序，使用最早的时间
                      const sortedLogs = [...mergedLog.mergedLogs].sort((a, b) => {
                        const timeA = dayjs(a.created_at).valueOf()
                        const timeB = dayjs(b.created_at).valueOf()
                        return timeA - timeB
                      })
                      return dayjs(sortedLogs[0].created_at).format('YYYY-MM-DD HH:mm:ss')
                    }
                    // 单条记录，使用当前日志的时间
                    return dayjs(selectedLog.created_at).format('YYYY-MM-DD HH:mm:ss')
                  })()}
                </Text>
              </div>
              <div>
                <Text strong>操作类型：</Text>
                {(() => {
                  const info = operationTypeMap[selectedLog.operation_type] || { text: selectedLog.operation_type, color: 'default' }
                  return <Tag color={info.color}>{info.text}</Tag>
                })()}
              </div>
              {selectedLog.user_name && (
                <div >
                  <Text strong>操作人员：</Text>
                  <Text>{selectedLog.user_name}</Text>
                </div>
              )}
              {selectedLog.operation_type !== 'inbound' && selectedLog.operation_type !== 'inventory_check' || selectedLog.table_name !== 'inventory' ? (
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
                    {selectedLog.description || '无描述'}
                  </div>
                </div>
              ) : null}
              {selectedLog.operation_type === 'inbound' && selectedLog.table_name === 'inventory' && selectedLog.record_id ? (
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
                    {loadingSNCodes ? (
                      <div>加载SN码中...</div>
                    ) : (
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <Text strong>商品名称：</Text>
                          <Text>{productInfo?.name || '-'}</Text>
                        </div>
                        <div>
                          <Text strong>商品分类：</Text>
                          <Text>{productInfo?.category_name || '-'}</Text>
                        </div>
                        <div>
                          <Text strong>商品数量：</Text>
                          <Text>{mergedNewValues.quantity || 0}</Text>
                        </div>
                        <div>
                          <Text strong>商品价格：</Text>
                          <Text>
                            {productInfo?.selling_price ? `¥${Number(productInfo.selling_price).toFixed(2)}` : '-'}
                          </Text>
                        </div>
                        <div>
                          <Text strong>商品总价：</Text>
                          <Text>
                            {mergedNewValues.quantity && productInfo?.selling_price ? `¥${Number(mergedNewValues.quantity * productInfo.selling_price).toFixed(2)}` : '-'}
                          </Text>
                        </div>
                        {mergedNewValues.batch_number && (
                          <div>
                            <Text strong>批次号：</Text>
                            <Text>{mergedNewValues.batch_number}</Text>
                          </div>
                        )}
                        {displaySNCodes.length > 0 && (
                          <div>
                            <Text strong>SN码：</Text>
                            <div style={{ marginTop: 4 }}>
                              <Text style={{ wordBreak: 'break-all' }}>
                                {displaySNCodes.join('、')}
                              </Text>
                            </div>
                          </div>
                        )}
                      </Space>
                    )}
                  </div>
                </div>
              ) : selectedLog.operation_type === 'inventory_check' && selectedLog.table_name === 'inventory' && selectedLog.record_id ? (
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
                    {loadingSNCodes ? (
                      <div>加载SN码中...</div>
                    ) : (
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <div>
                          <Text strong>商品名称：</Text>
                          <Text>{productInfo?.name || '-'}</Text>
                        </div>
                        <div>
                          <Text strong>商品分类：</Text>
                          <Text>{productInfo?.category_name || '-'}</Text>
                        </div>
                        <div>
                          <Text strong>盘点数量：</Text>
                          <Text>{mergedNewValues.quantity || 0}</Text>
                        </div>
                        {mergedNewValues.batch_number && (
                          <div>
                            <Text strong>批次号：</Text>
                            <Text>{mergedNewValues.batch_number}</Text>
                          </div>
                        )}
                        {displaySNCodes.length > 0 && (
                          <div>
                            <Text strong>SN码：</Text>
                            <div style={{ marginTop: 4 }}>
                              <Text style={{ wordBreak: 'break-all' }}>
                                {displaySNCodes.join('、')}
                              </Text>
                            </div>
                          </div>
                        )}
                      </Space>
                    )}
                  </div>
                </div>
              ) : selectedLog.new_values && typeof selectedLog.new_values === 'object' && Object.keys(selectedLog.new_values).length > 0 ? (
                <div>
                  <Text strong>变更内容：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: 12, 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    maxHeight: 200,
                    overflowY: 'auto'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(selectedLog.new_values, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </Space>
          </div>
        )}
      </Modal>
    </Modal>
  )
}

export default ActivityLogModal
