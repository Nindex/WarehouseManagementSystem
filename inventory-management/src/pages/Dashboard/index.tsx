import React, { useEffect, useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Tag, Button, Space, Typography, Select, DatePicker, Pagination } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCartOutlined,
  ShopOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined
} from '@ant-design/icons'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchProducts } from '@/store/slices/inventorySlice'
import { inventoryAPI, systemLogAPI, productAPI } from '@/services/api'
import type { SystemLog } from '@/services/database/SystemLogService'
import dayjs from 'dayjs'

// 合并后的日志接口
interface MergedLog extends SystemLog {
  isMerged?: boolean
  mergedCount?: number
  mergedLogs?: SystemLog[]
  timeRange?: string
  totalQuantity?: number
}

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch()
  const { total: productTotal } = useAppSelector((state) => state.inventory)
  const { user } = useAppSelector((state) => state.auth)
  const [kpiData, setKpiData] = useState({
    totalProducts: 0,
    totalValue: 0,
  })
  const [recentLogs, setRecentLogs] = useState<SystemLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  // 分页相关状态
  const [logsCurrentPage, setLogsCurrentPage] = useState(1)
  const [logsPageSize, setLogsPageSize] = useState(20)
  const [logsTotal, setLogsTotal] = useState(0)
  // 时间筛选：默认15天
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(15, 'day'),
    dayjs()
  ])
  // 操作类型筛选
  const [operationType, setOperationType] = useState<string | undefined>(undefined)
  // 商品信息缓存（productId -> { name }）
  const [productInfoCache, setProductInfoCache] = useState<Record<number, { name: string }>>({})

  useEffect(() => {
    dispatch(fetchProducts({ page: 1, pageSize: 1 })) // 获取总数
  }, [dispatch])

  // 当筛选条件改变时，重置到第一页
  useEffect(() => {
    if (dateRange || operationType !== undefined) {
      setLogsCurrentPage(1)
    }
  }, [dateRange, operationType])

  useEffect(() => {
    loadRecentLogs()
  }, [dateRange, operationType, user?.id, logsCurrentPage, logsPageSize])

  const loadRecentLogs = async () => {
    try {
      setLogsLoading(true)
      const filters: any = {
        // 处理时间范围（onChange 已自动设置默认时分秒）
        start_date: dateRange[0].format('YYYY-MM-DD HH:mm:ss'),
        end_date: dateRange[1].format('YYYY-MM-DD HH:mm:ss')
      }
      if (operationType) {
        filters.operation_type = operationType
      }
      if (user?.id) {
        filters.user_id = user.id
      }

      // 使用后端分页，限制单次加载数量为 500 条
      const maxPageSize = 500
      const actualPageSize = Math.min(logsPageSize, maxPageSize)
      const response = await systemLogAPI.getLogs(logsCurrentPage, actualPageSize, filters)
      if (response.success && response.data) {
        setRecentLogs(response.data.data || [])
        setLogsTotal(response.data.total || 0)
      } else {
        setRecentLogs([])
        setLogsTotal(0)
      }
    } catch (error) {
      console.error('加载最近操作记录失败:', error)
      setRecentLogs([])
      setLogsTotal(0)
    } finally {
      setLogsLoading(false)
    }
  }

  // 安全解析 new_values 的辅助函数
  const parseNewValues = (newValues: any): any => {
    if (typeof newValues === 'object' && newValues !== null) {
      return newValues
    }
    if (typeof newValues === 'string' && newValues) {
      try {
        return JSON.parse(newValues)
      } catch (e) {
        console.warn('解析 new_values 失败:', e)
        return {}
      }
    }
    return {}
  }

  // 合并同一批次的入库记录（参考 StockTransactionModal 的逻辑）
  const allMergedLogs = useMemo(() => {
    if (!recentLogs || recentLogs.length === 0) return []

    const merged: MergedLog[] = []
    const processed = new Set<number>()

    for (let i = 0; i < recentLogs.length; i++) {
      if (processed.has(recentLogs[i].id)) continue

      const currentLog = recentLogs[i]

      // 只对入库操作（operation_type='inbound'）且数量为1的记录进行合并判断
      const currentNewValues = parseNewValues(currentLog.new_values)
      const currentQuantity = (currentNewValues as any)?.quantity || 0
      const shouldTryMerge = currentLog.operation_type === 'inbound' && currentQuantity === 1

      if (!shouldTryMerge) {
        // 不需要合并的记录直接添加
        merged.push(currentLog)
        processed.add(currentLog.id)
        continue
      }

      // 查找可以合并的记录（同一商品、同一批次号）
      const mergeGroup: SystemLog[] = [currentLog]
      processed.add(currentLog.id)
      const currentBatchNumber = (currentNewValues as any)?.batch_number || null
      const currentRecordId = currentLog.record_id

      for (let j = i + 1; j < recentLogs.length; j++) {
        if (processed.has(recentLogs[j].id)) continue

        const otherLog = recentLogs[j]
        const otherNewValues = parseNewValues(otherLog.new_values)
        const otherQuantity = (otherNewValues as any)?.quantity || 0
        const otherBatchNumber = (otherNewValues as any)?.batch_number || null

        // 合并条件：相同的商品、都是入库且数量为1、相同的批次号
        const canMerge =
          otherLog.operation_type === 'inbound' &&
          otherQuantity === 1 &&
          otherLog.record_id === currentRecordId &&
          otherBatchNumber === currentBatchNumber

        if (canMerge) {
          mergeGroup.push(otherLog)
          processed.add(otherLog.id)
        } else {
          // 批次号不同或商品不同，说明不是同一批次，停止查找
          break
        }
      }

      // 按时间正序排序合并组
      mergeGroup.sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf())

      // 如果只有一条，直接添加；否则合并
      if (mergeGroup.length === 1) {
        merged.push(currentLog)
      } else {
        // 合并多条记录
        const totalQuantity = mergeGroup.reduce((sum, log) => {
          const nv = parseNewValues(log.new_values)
          return sum + ((nv as any)?.quantity || 0)
        }, 0)

        // 计算合并后的库存变化
        // 第一条记录的 old_quantity 是入库前的库存
        const firstLogNewValues = parseNewValues(mergeGroup[0].new_values)
        const oldQuantity = (firstLogNewValues as any)?.old_quantity ?? 0

        // 最后一条记录的 new_quantity 是入库后的库存
        const lastLogNewValues = parseNewValues(mergeGroup[mergeGroup.length - 1].new_values)
        const newQuantity = (lastLogNewValues as any)?.new_quantity ?? (oldQuantity + totalQuantity)

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
          created_at: mergeGroup[0].created_at, // 使用第一条的时间（统一时间）
          // 存储合并后的库存值，用于更新描述
          new_values: JSON.stringify({
            ...firstLogNewValues,
            quantity: totalQuantity,
            old_quantity: oldQuantity,
            new_quantity: newQuantity
          })
        }

        merged.push(mergedLog)
      }
    }

    // 合并后按时间倒序排序（最新的在前）
    return merged.sort((a, b) => {
      const timeA = dayjs(a.created_at).valueOf()
      const timeB = dayjs(b.created_at).valueOf()
      return timeB - timeA
    })
  }, [recentLogs])

  // 由于使用后端分页，直接使用合并后的数据作为显示数据
  const mergedLogs = allMergedLogs

  // 加载商品信息缓存（用于替换描述中的商品ID为商品名称）
  useEffect(() => {
    const loadProductInfo = async () => {
      if (!recentLogs || recentLogs.length === 0) {
        setProductInfoCache({})
        return
      }

      // 收集所有需要查询的商品ID（库存相关操作）
      const inventoryOperations = ['inbound', 'outbound', 'inventory_check', 'inventory_adjust']
      const productIds = new Set<number>()

      recentLogs.forEach(log => {
        if (log.table_name === 'inventory' && log.record_id && inventoryOperations.includes(log.operation_type)) {
          productIds.add(log.record_id)
        }
      })

      // 批量查询商品信息（只查询未缓存的）
      const uncachedIds = Array.from(productIds).filter(id => !productInfoCache[id])

      if (uncachedIds.length > 0) {
        try {
          // 性能优化：使用批量查询接口，减少HTTP请求次数
          const result = await productAPI.getProductsByIds(uncachedIds)

          if (result.success && result.data) {
            const newCache: Record<number, { name: string }> = { ...productInfoCache }
            result.data.forEach(product => {
              newCache[product.id] = {
                name: product.name
              }
            })

            setProductInfoCache(newCache)
          }
        } catch (error) {
          console.error('加载商品信息失败:', error)
        }
      }
    }

    loadProductInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentLogs])

  useEffect(() => {
    loadKPIData()
  }, [productTotal])

  const loadKPIData = async () => {
    try {
      // 获取库存总值
      const valueRes = await inventoryAPI.getInventoryValue()
      // getInventoryValue 返回的是对象 { totalValue, totalItems, categoryBreakdown }
      const totalValue = valueRes.success && valueRes.data ? (valueRes.data.totalValue || 0) : 0

      setKpiData({
        totalProducts: productTotal || 0,
        totalValue,
      })
    } catch (error) {
      console.error('加载KPI数据失败:', error)
    }
  }

  // KPI数据配置
  const kpiDataConfig = [
    {
      title: '商品总数',
      value: kpiData.totalProducts,
      icon: <ShopOutlined style={{ fontSize: 32, color: '#003366' }} />,
    },
    {
      title: '库存总值',
      value: kpiData.totalValue,
      precision: 2,
      prefix: '¥',
      icon: <ShoppingCartOutlined style={{ fontSize: 32, color: '#28a745' }} />,
    },
  ]

  // 快捷操作
  const quickActions = [
    { title: '商品入库', color: '#28a745', path: '/inventory/inbound' },
    { title: '商品出库', color: '#dc3545', path: '/inventory/outbound' },
    { title: '库存盘点', color: '#ffc107', path: '/inventory/check' },
    { title: '报表中心', color: '#6f42c1', path: '/reports/inventory' }
  ]

  const navigate = useNavigate()
  return (
    <div className="page-transition">
      <Row gutter={[16, 16]}>
        {/* KPI卡片 */}
        {kpiDataConfig.map((item, index) => (
          <Col xs={24} sm={12} lg={6.5} key={index}>
            <Card
              hoverable
              style={{ cursor: 'default' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Statistic
                    title={item.title}
                    value={item.value}
                    precision={item.precision}
                    prefix={item.prefix}
                    valueStyle={{
                      fontSize: 26,
                      fontWeight: 'bold'
                    }}
                  />
                </div>
                <div>{item.icon}</div>
              </div>
            </Card>
          </Col>
        ))}

        {/* 快捷操作 */}
        <Col xs={24} lg={25}>
          <Card title="快捷操作" style={{ height: '100%' }}>
            <Row gutter={[15, 15]}>
              {quickActions.map((action, index) => (
                <Col span={12} key={index}>
                  <Button
                    type="primary"
                    block
                    style={{
                      backgroundColor: action.color,
                      borderColor: action.color,
                      height: 48,
                      fontSize: 18
                    }}
                    onClick={() => navigate(action.path)}
                  >
                    {action.title}
                  </Button>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 最近操作 */}
        <Col xs={24}>
          <Card
            title="最近操作" style={{ minHeight: '200px' }}
            extra={
              <Button type="link" onClick={loadRecentLogs}>
                刷新
              </Button>
            }
          >
            {/* 筛选控件 */}
            <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Space wrap>
                <Typography.Text>时间范围：</Typography.Text>
                <DatePicker.RangePicker
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
                    }
                  }}
                />
                <Typography.Text>操作类型：</Typography.Text>
                <Select
                  style={{ width: 150 }}
                  placeholder="全部"
                  allowClear
                  value={operationType}
                  onChange={setOperationType}
                  getPopupContainer={(trigger) => trigger.parentElement || document.body}
                >
                  <Select.Option value="create_product">创建商品</Select.Option>
                  <Select.Option value="update_product">更新商品</Select.Option>
                  <Select.Option value="delete_product">删除商品</Select.Option>
                  <Select.Option value="inbound">商品入库</Select.Option>
                  <Select.Option value="outbound">商品出库</Select.Option>
                  <Select.Option value="batch_inbound">批量入库</Select.Option>
                  <Select.Option value="batch_outbound">批量出库</Select.Option>
                  <Select.Option value="inventory_check">库存盘点</Select.Option>
                  <Select.Option value="inventory_adjust">库存调整</Select.Option>
                  <Select.Option value="create_purchase_order">创建采购订单</Select.Option>
                  <Select.Option value="update_purchase_order_status">更新采购订单状态</Select.Option>
                  <Select.Option value="approve_purchase_order">审核采购订单</Select.Option>
                  <Select.Option value="reject_purchase_order">拒绝采购订单</Select.Option>
                  <Select.Option value="create_purchase_return">创建采购退货</Select.Option>
                  <Select.Option value="approve_purchase_return">审核采购退货</Select.Option>
                  <Select.Option value="reject_purchase_return">拒绝采购退货</Select.Option>
                  <Select.Option value="create_supplier">创建供应商</Select.Option>
                  <Select.Option value="delete_supplier">删除供应商</Select.Option>
                  <Select.Option value="create_customer">创建客户</Select.Option>
                  <Select.Option value="update_customer">更新客户</Select.Option>
                  <Select.Option value="delete_customer">删除客户</Select.Option>
                  <Select.Option value="create_store">创建门店</Select.Option>
                  <Select.Option value="update_store">更新门店</Select.Option>
                  <Select.Option value="delete_store">删除门店</Select.Option>
                  <Select.Option value="delete_serial_number">删除SN码</Select.Option>
                </Select>
              </Space>
            </Space>
            {logsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Typography.Text type="secondary">加载中...</Typography.Text>
              </div>
            ) : mergedLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Typography.Text type="secondary">暂无最近操作记录</Typography.Text>
              </div>
            ) : (
              <>
                <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  {mergedLogs.map((log, index) => {
                    // 计算序号：(当前页 - 1) * 每页条数 + 索引 + 1
                    const serialNumber = (logsCurrentPage - 1) * logsPageSize + index + 1
                    
                    // 操作类型映射
                    const operationTypeMap: Record<string, { text: string; color: string }> = {
                      'create_product': { text: '创建商品', color: 'blue' },
                      'update_product': { text: '更新商品', color: 'cyan' },
                      'delete_product': { text: '删除商品', color: 'red' },
                      'inbound': { text: '商品入库', color: 'green' },
                      'outbound': { text: '商品出库', color: 'orange' },
                      'batch_inbound': { text: '批量入库', color: 'green' },
                      'batch_outbound': { text: '批量出库', color: 'orange' },
                      'inventory_check': { text: '库存盘点', color: 'purple' },
                      'inventory_adjust': { text: '库存调整', color: 'purple' },
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
                      'delete_store': { text: '删除门店', color: 'red' },
                      'delete_serial_number': { text: '删除SN码', color: 'red' }
                    }
                    const operationInfo = operationTypeMap[log.operation_type] || { text: log.operation_type, color: 'default' }

                    // 获取商品信息（用于替换描述中的商品ID）
                    const inventoryOperations = ['inbound', 'outbound', 'inventory_check', 'inventory_adjust']
                    const isInventoryOperation = log.table_name === 'inventory' && inventoryOperations.includes(log.operation_type)
                    const productInfo = isInventoryOperation && log.record_id ? productInfoCache[log.record_id] : null

                    // 处理合并记录的描述
                    let displayDescription = log.description || '无描述'
                    if (log.isMerged && log.totalQuantity !== undefined) {
                      // 从 new_values 中提取合并后的库存值
                      const mergedNewValues = parseNewValues(log.new_values)
                      const totalQuantity = log.totalQuantity
                      const oldQuantity = (mergedNewValues as any)?.old_quantity ?? 0
                      const newQuantity = (mergedNewValues as any)?.new_quantity ?? (oldQuantity + totalQuantity)

                      // 更新描述中的数量
                      displayDescription = displayDescription.replace(/数量\s*\d+/, `数量 ${totalQuantity}`)
                      // 更新描述中的库存变化
                      displayDescription = displayDescription.replace(/库存从\s*\d+\s*变为\s*\d+/, `库存从 ${oldQuantity} 变为 ${newQuantity}`)
                      // 移除原描述中的SN码部分
                      displayDescription = displayDescription.replace(/[，,]?\s*SN码[^，]*/, '')
                    }

                    // 替换描述中的"商品SKU X"为商品名称
                    if (productInfo && log.record_id) {
                      displayDescription = displayDescription.replace(
                        new RegExp(`商品SKU\\s*${log.record_id}`, 'g'),
                        productInfo?.name + ')'
                      ) + ' (商品名称: ' + productInfo?.name + ', SKU: ' + log.record_id + ')'
                    }

                    return (
                      <div
                        key={log.isMerged ? `merged-${log.id}-${log.mergedCount}` : `log-${log.id}`}
                        style={{
                          padding: '12px 0',
                          borderBottom: '1px solid #f0f0f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ 
                            minWidth: 50, 
                            textAlign: 'center', 
                            color: '#999', 
                            fontSize: '14px',
                            fontWeight: 500,
                            paddingTop: 2
                          }}>
                            {serialNumber}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Tag color={operationInfo.color}>{operationInfo.text}</Tag>
                              <Typography.Text strong>{log.user_name || '系统'}</Typography.Text>
                              {log.isMerged && log.mergedCount && (
                                <Tag color="default" style={{ fontSize: 11 }}>
                                  合并了 {log.mergedCount} 条记录
                                </Tag>
                              )}
                            </div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {displayDescription}
                            </Typography.Text>
                          </div>
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 16, marginTop: 30 }}>
                          {log.isMerged && log.timeRange ? log.timeRange : dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
                        </Typography.Text>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                  <Pagination
                    current={logsCurrentPage}
                    pageSize={logsPageSize}
                    total={logsTotal}
                    showSizeChanger
                    showQuickJumper
                    showTotal={(total, range) => {
                      const mergedTotal = allMergedLogs.length
                      if (mergedTotal < logsTotal) {
                        return `显示 ${range[0]}-${range[1]} 条，共 ${logsTotal} 条（当前页合并后 ${mergedTotal} 条）`
                      }
                      return `显示 ${range[0]}-${range[1]} 条，共 ${total} 条`
                    }}
                    onChange={(page, size) => {
                      setLogsCurrentPage(page)
                      setLogsPageSize(size)
                    }}
                    onShowSizeChange={(current, size) => {
                      setLogsCurrentPage(1)
                      setLogsPageSize(size)
                    }}
                  />
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
