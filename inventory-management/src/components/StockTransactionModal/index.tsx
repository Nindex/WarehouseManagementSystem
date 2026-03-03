import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Modal, Table, Tag, Typography, Select, DatePicker, Space, Button } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { inventoryAPI, systemLogAPI, productAPI } from '@/services/api'
import dayjs from 'dayjs'
import type { InventoryTransaction } from '@/services/database/InventoryService'
import type { SystemLog } from '@/services/database/SystemLogService'

const { Text } = Typography
const { RangePicker } = DatePicker

// 合并后的交易记录接口
interface MergedTransaction extends InventoryTransaction {
  isMerged?: boolean
  mergedCount?: number
  mergedTransactions?: InventoryTransaction[]
  timeRange?: string
  totalQuantity?: number
}

interface StockTransactionModalProps {
  visible: boolean
  onCancel: () => void
  productId: number
  productName?: string
}

const StockTransactionModal: React.FC<StockTransactionModalProps> = ({ 
  visible, 
  onCancel, 
  productId,
  productName 
}) => {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [transactionType, setTransactionType] = useState<string | undefined>(undefined)
  const [logDetailModalVisible, setLogDetailModalVisible] = useState(false)
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null)
  const [selectedLogs, setSelectedLogs] = useState<SystemLog[]>([]) // 用于存储合并记录的多条日志
  const [productInfo, setProductInfo] = useState<any>(null) // 商品信息
  const [selectedTransaction, setSelectedTransaction] = useState<MergedTransaction | null>(null) // 当前选中的交易记录
  const [loadingLog, setLoadingLog] = useState(false)
  const [mergedNewValues, setMergedNewValues] = useState<any>({}) // 合并后的new_values
  const [displaySNCodes, setDisplaySNCodes] = useState<string[]>([]) // 显示的SN码列表
  const [loadingSNCodes, setLoadingSNCodes] = useState(false) // SN码加载状态

  // 合并同一批次的入库记录（SN码入库）
  const mergedTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return []

    const merged: MergedTransaction[] = []
    const processed = new Set<number>()

    for (let i = 0; i < transactions.length; i++) {
      if (processed.has(transactions[i].id)) continue

      const currentTransaction = transactions[i]
      
      // 只对入库操作（type='in'）且数量为1的记录进行合并判断
      const shouldTryMerge = currentTransaction.type === 'in' && currentTransaction.quantity === 1

      if (!shouldTryMerge) {
        // 不需要合并的记录直接添加
        merged.push(currentTransaction)
        processed.add(currentTransaction.id)
        continue
      }

      // 查找可以合并的记录（同一SKU、同一批次号）
      const mergeGroup: InventoryTransaction[] = [currentTransaction]
      processed.add(currentTransaction.id)
      const currentBatchNumber = currentTransaction.batch_number || null
      
      for (let j = i + 1; j < transactions.length; j++) {
        if (processed.has(transactions[j].id)) continue

        const otherTransaction = transactions[j]

        // 合并条件：相同的商品、都是入库且数量为1、相同的批次号
        const canMerge = 
          otherTransaction.type === 'in' &&
          otherTransaction.quantity === 1 &&
          otherTransaction.product_id === currentTransaction.product_id &&
          (otherTransaction.batch_number || null) === currentBatchNumber

        if (canMerge) {
          mergeGroup.push(otherTransaction)
          processed.add(otherTransaction.id)
        } else {
          // 批次号不同，说明不是同一批次，停止查找
          break
        }
      }

      // 按时间正序排序合并组
      mergeGroup.sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf())

      // 如果只有一条，直接添加；否则合并
      if (mergeGroup.length === 1) {
        merged.push(currentTransaction)
      } else {
        // 合并多条记录，按时间正序排序
        const sortedMergeGroup = mergeGroup.sort((a, b) => 
          dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf()
        )
        
        const totalQuantity = sortedMergeGroup.reduce((sum, t) => sum + (t.quantity || 0), 0)
        
        // 使用第一条记录的时间作为统一时间（同一批次下的SN码使用统一时间）
        const firstTime = dayjs(sortedMergeGroup[0].created_at)
        const timeRange = firstTime.format('YYYY-MM-DD HH:mm:ss')

        const mergedTransaction: MergedTransaction = {
          ...currentTransaction,
          isMerged: true,
          mergedCount: sortedMergeGroup.length,
          mergedTransactions: sortedMergeGroup,
          timeRange: timeRange,
          totalQuantity,
          quantity: totalQuantity, // 使用总数量
          balance: sortedMergeGroup[sortedMergeGroup.length - 1].balance, // 使用最后一条（时间最晚）的余额
          created_at: sortedMergeGroup[0].created_at // 使用第一条的时间（统一时间）
        }

        merged.push(mergedTransaction)
      }
    }

    // 合并后按时间倒序排序（最新的在前）
    return merged.sort((a, b) => {
      const timeA = dayjs(a.created_at).valueOf()
      const timeB = dayjs(b.created_at).valueOf()
      return timeB - timeA
    })
  }, [transactions])

  useEffect(() => {
    if (visible && productId) {
      loadTransactions()
    }
  }, [visible, productId, currentPage, pageSize, dateRange, transactionType])

  // 加载SN码信息用于显示（从数据库查询，更可靠）
  const loadSNCodesForDisplay = async (record: MergedTransaction, productId: number, logs?: SystemLog[]) => {
    try {
      setLoadingSNCodes(true)
      
      // 获取批次号
      let batchNumber: string | null = null
      if (record.isMerged && record.mergedTransactions && record.mergedTransactions.length > 0) {
        batchNumber = record.mergedTransactions[0].batch_number || null
      } else {
        batchNumber = record.batch_number || null
      }
      
      // 合并所有日志的 new_values
      let mergedValues: any = {}
      let allSNCodesFromLogs: string[] = []
      let totalQuantity = 0
      
      // 对于合并记录，优先使用 record 中的数量（更准确）
      if (record.isMerged && record.totalQuantity !== undefined && record.totalQuantity !== null) {
        totalQuantity = record.totalQuantity
      } else if (record.quantity !== undefined && record.quantity !== null) {
        totalQuantity = record.quantity
      }
      
      // 使用传入的日志数据，如果没有传入则使用状态中的日志
      const logsToUse = logs && logs.length > 0 ? logs : (selectedLogs.length > 0 ? selectedLogs : (selectedLog ? [selectedLog] : []))
      
      if (logsToUse.length > 1) {
        // 合并记录：合并所有日志的信息
        // 按时间排序日志，确保第一条是最早的，最后一条是最晚的
        const sortedLogs = [...logsToUse].sort((a, b) => {
          const timeA = dayjs(a.created_at).valueOf()
          const timeB = dayjs(b.created_at).valueOf()
          return timeA - timeB
        })
        
        let quantityFromLogs = 0
        let firstLogOldQuantity: number | null = null
        let lastLogNewQuantity: number | null = null
        
        sortedLogs.forEach((log, index) => {
          const newValues = typeof log.new_values === 'object' ? log.new_values : {}
          const snCodes = (newValues as any)?.sn_codes
          if (Array.isArray(snCodes)) {
            allSNCodesFromLogs.push(...snCodes)
          }
          const qty = (newValues as any)?.quantity || 0
          quantityFromLogs += Number(qty) || 0
          
          // 获取第一条记录的 old_quantity（入库前的库存）
          if (index === 0) {
            firstLogOldQuantity = (newValues as any)?.old_quantity || null
            // 合并其他字段（使用第一条记录的值）
            mergedValues = { ...newValues }
          }
          
          // 获取最后一条记录的 new_quantity（入库后的库存）
          if (index === sortedLogs.length - 1) {
            lastLogNewQuantity = (newValues as any)?.new_quantity || null
          }
        })
        
        // 如果 record 中没有数量，使用从日志累加的数量（作为后备）
        if (totalQuantity === 0) {
          totalQuantity = quantityFromLogs
        }
        mergedValues.quantity = totalQuantity
        
        // 使用第一条记录的 old_quantity 和最后一条记录的 new_quantity
        if (firstLogOldQuantity !== null) {
          mergedValues.old_quantity = firstLogOldQuantity
        }
        if (lastLogNewQuantity !== null) {
          mergedValues.new_quantity = lastLogNewQuantity
        }
      } else if (logsToUse.length === 1) {
        // 普通记录：使用单条日志的 new_values
        mergedValues = typeof logsToUse[0].new_values === 'object' ? logsToUse[0].new_values : {}
        const qty = (mergedValues as any)?.quantity || 0
        totalQuantity = Number(qty) || 0
        const snCodes = (mergedValues as any)?.sn_codes
        if (Array.isArray(snCodes)) {
          allSNCodesFromLogs.push(...snCodes)
        }
        
        // 如果交易记录是合并的，从交易记录中获取正确的库存值
        if (record.isMerged && record.mergedTransactions && record.mergedTransactions.length > 0) {
          // 按时间排序交易记录
          const sortedTransactions = [...record.mergedTransactions].sort((a, b) => {
            const timeA = dayjs(a.created_at).valueOf()
            const timeB = dayjs(b.created_at).valueOf()
            return timeA - timeB
          })
          
          // 第一条交易的余额应该是入库前的库存（需要减去本次入库的数量）
          const firstTransaction = sortedTransactions[0]
          const firstBalance = firstTransaction.balance || 0
          const firstQuantity = firstTransaction.quantity || 0
          const oldQuantity = firstBalance - firstQuantity
          
          // 最后一条交易的余额是入库后的库存
          const lastTransaction = sortedTransactions[sortedTransactions.length - 1]
          const newQuantity = lastTransaction.balance || 0
          
          // 更新 mergedValues 中的库存值
          mergedValues.old_quantity = oldQuantity
          mergedValues.new_quantity = newQuantity
        }
      }
      
      // 如果有批次号，从sn_status表查询所有SN码（更可靠）
      if (batchNumber) {
        try {
          const batchResponse = await inventoryAPI.getAllBatchesWithSerialNumbers(1, 1, productId, batchNumber)
          if (batchResponse.success && batchResponse.data && batchResponse.data.data && batchResponse.data.data.length > 0) {
            // 由于后端使用LIKE查询，需要找到精确匹配的批次
            const batchData = batchResponse.data.data.find((b: any) => b.batch_number === batchNumber) || batchResponse.data.data[0]
            if (batchData && batchData.serial_numbers && batchData.serial_numbers.length > 0) {
              // 使用从数据库查询的SN码列表（更完整和准确）
              allSNCodesFromLogs = batchData.serial_numbers
              // 如果SN码数量与当前数量不一致，使用SN码数量作为实际数量
              if (allSNCodesFromLogs.length !== totalQuantity) {
                totalQuantity = allSNCodesFromLogs.length
              }
            } else {
              console.warn('批次数据中没有SN码:', { batchNumber, batchData })
            }
          } else {
            console.warn('查询批次SN码返回空结果:', { batchNumber, productId })
          }
        } catch (error) {
          console.error('查询批次SN码失败:', error)
          // 如果查询失败，继续使用日志中的SN码
        }
      }
      
      // 如果从日志中获取的SN码数量与数量不一致，也使用SN码数量
      const uniqueSNCodes = [...new Set(allSNCodesFromLogs)]
      if (uniqueSNCodes.length > 0 && uniqueSNCodes.length !== totalQuantity) {
        totalQuantity = uniqueSNCodes.length
      }
      
      mergedValues.sn_codes = uniqueSNCodes
      mergedValues.quantity = totalQuantity // 确保数量与SN码数量一致
      mergedValues.batch_number = batchNumber || mergedValues.batch_number
      
      setMergedNewValues(mergedValues)
      setDisplaySNCodes(uniqueSNCodes)
    } catch (error) {
      console.error('加载SN码失败:', error)
    } finally {
      setLoadingSNCodes(false)
    }
  }

  // 加载操作日志详情
  const loadLogDetail = async (record: MergedTransaction) => {
    setSelectedTransaction(record)
    try {
      setLoadingLog(true)
      setProductInfo(null)
      
      // 如果是合并记录，需要查询多条日志
      if (record.isMerged && record.mergedTransactions && record.mergedTransactions.length > 0) {
        // 查询所有合并记录的日志
        const logs: SystemLog[] = []
        const operationTypeMap: Record<string, string> = {
          'in': 'inbound',
          'out': 'outbound',
          'adjust': 'inventory_check'
        }
        const operationType = operationTypeMap[record.type] || 'inbound'
        
        // 先查询所有相关日志（一次性查询，提高效率）
        const filters = {
          table_name: 'inventory',
          operation_type: operationType,
          record_id: productId
        }
        
        // 获取时间范围用于查询（扩大时间范围以确保能查询到日志）
        const times = record.mergedTransactions.map(t => dayjs(t.created_at)).sort((a, b) => a.valueOf() - b.valueOf())
        const startTime = times[0].subtract(5, 'minute').format('YYYY-MM-DD HH:mm:ss')
        const endTime = times[times.length - 1].add(5, 'minute').format('YYYY-MM-DD HH:mm:ss')
        
        // 先不限制时间范围，只通过其他条件查询，看看是否能找到日志
        let response = await systemLogAPI.getLogs(1, 1000, filters)
        
        // 如果找到日志，再通过时间范围过滤
        if (response.success && response.data && response.data.data && response.data.data.length > 0) {
          // 已经有了日志，直接使用
        } else {
          // 如果没找到，尝试使用时间范围查询
          response = await systemLogAPI.getLogs(1, 1000, {
            ...filters,
            start_date: startTime,
            end_date: endTime
          })
        }
        
        if (response.success && response.data && response.data.data && response.data.data.length > 0) {
          // 为每条合并记录找到对应的日志（通过时间匹配）
          // 获取时间范围用于过滤
          const times = record.mergedTransactions.map(t => dayjs(t.created_at)).sort((a, b) => a.valueOf() - b.valueOf())
          const minTime = times[0].subtract(2, 'minute')
          const maxTime = times[times.length - 1].add(2, 'minute')
          
          // 先过滤出时间范围内的日志
          const timeFilteredLogs = response.data.data.filter((log: SystemLog) => {
            const logTime = dayjs(log.created_at)
            return logTime.isAfter(minTime) && logTime.isBefore(maxTime)
          })
          
          // 如果时间过滤后没有日志，使用所有日志
          const logsToMatch = timeFilteredLogs.length > 0 ? timeFilteredLogs : response.data.data
          
          for (const transaction of record.mergedTransactions) {
            const transactionTime = dayjs(transaction.created_at)
            const transactionQuantity = transaction.quantity || 0
            
            // 优先匹配时间接近且数量相同的日志
            let matchingLog = logsToMatch.find((log: SystemLog) => {
              const logTime = dayjs(log.created_at)
              const timeDiff = Math.abs(logTime.diff(transactionTime, 'second'))
              if (timeDiff < 120) { // 扩大时间窗口到2分钟
                const newValues = typeof log.new_values === 'object' ? log.new_values : {}
                const logQuantity = (newValues as any)?.quantity || 0
                return logQuantity === transactionQuantity
              }
              return false
            })
            
            // 如果没有找到数量匹配的，找时间最接近的（5分钟内）
            if (!matchingLog) {
              matchingLog = logsToMatch.reduce((closest: SystemLog | null, log: SystemLog) => {
                if (!closest) return log
                const closestTime = dayjs(closest.created_at)
                const logTime = dayjs(log.created_at)
                const closestDiff = Math.abs(closestTime.diff(transactionTime, 'second'))
                const logDiff = Math.abs(logTime.diff(transactionTime, 'second'))
                return logDiff < closestDiff ? log : closest
              }, null)
            }
            
            if (matchingLog && !logs.find(l => l.id === matchingLog.id)) {
              logs.push(matchingLog)
            }
          }
        }
        
        if (logs.length > 0) {
          setSelectedLogs(logs)
          setSelectedLog(logs[0]) // 使用第一条作为主要显示
          setLogDetailModalVisible(true)
          
          // 初始化 mergedNewValues 的基础数据（包括数量），这样即使异步加载还没完成也能显示
          const initialQuantity = record.isMerged && record.totalQuantity !== undefined ? record.totalQuantity : (record.quantity || 0)
          const firstLogNewValues = typeof logs[0].new_values === 'object' ? logs[0].new_values : {}
          setMergedNewValues({
            ...firstLogNewValues,
            quantity: initialQuantity,
            batch_number: record.isMerged && record.mergedTransactions && record.mergedTransactions.length > 0 
              ? record.mergedTransactions[0].batch_number 
              : record.batch_number
          })
          
          // 获取商品信息
          const productResponse = await productAPI.getProduct(productId)
          if (productResponse.success && productResponse.data) {
            setProductInfo(productResponse.data)
          }
          
          // 加载SN码信息（从数据库查询，更可靠）- 使用Promise不阻塞
          loadSNCodesForDisplay(record, productId, logs).catch(err => console.error('加载SN码失败:', err))
        } else {
          console.warn('未找到合并记录的日志', {
            mergedCount: record.mergedTransactions?.length,
            logsFound: response.data?.data?.length || 0,
            filters,
            transactionsTimes: record.mergedTransactions?.map(t => t.created_at)
          })
          Modal.info({
            title: '提示',
            content: '未找到对应的操作日志记录，可能是日志尚未写入或时间不匹配'
          })
        }
      } else {
        // 普通记录，查询单条日志
        const operationTypeMap: Record<string, string> = {
          'in': 'inbound',
          'out': 'outbound',
          'adjust': 'inventory_check'
        }
        const filters = {
          table_name: 'inventory',
          operation_type: operationTypeMap[record.type] || 'inbound',
          record_id: productId
        }
        
        // 添加时间范围查询以提高匹配准确性
        const recordTime = dayjs(record.created_at)
        const startTime = recordTime.subtract(60, 'second').format('YYYY-MM-DD HH:mm:ss')
        const endTime = recordTime.add(60, 'second').format('YYYY-MM-DD HH:mm:ss')
        
        const response = await systemLogAPI.getLogs(1, 100, {
          ...filters,
          start_date: startTime,
          end_date: endTime
        })
        
        if (response.success && response.data && response.data.data && response.data.data.length > 0) {
          // 找到时间最接近的日志，优先匹配数量相同的
          const recordQuantity = record.quantity || 0
          let matchingLog = response.data.data.find((log: SystemLog) => {
            const logTime = dayjs(log.created_at)
            const timeDiff = Math.abs(logTime.diff(recordTime, 'second'))
            // 首先尝试匹配时间在30秒内且数量相同的
            if (timeDiff < 30) {
              const newValues = typeof log.new_values === 'object' ? log.new_values : {}
              const logQuantity = (newValues as any)?.quantity || 0
              return logQuantity === recordQuantity
            }
            return false
          })
          
          // 如果没有找到数量匹配的，找时间最接近的（60秒内）
          if (!matchingLog) {
            matchingLog = response.data.data.find((log: SystemLog) => {
              const logTime = dayjs(log.created_at)
              return Math.abs(logTime.diff(recordTime, 'second')) < 60
            })
          }
          
          // 如果还是没找到，使用时间最接近的一条（即使超过60秒）
          if (!matchingLog && response.data.data.length > 0) {
            matchingLog = response.data.data.reduce((closest: SystemLog | null, log: SystemLog) => {
              if (!closest) return log
              const closestTime = dayjs(closest.created_at)
              const logTime = dayjs(log.created_at)
              const closestDiff = Math.abs(closestTime.diff(recordTime, 'second'))
              const logDiff = Math.abs(logTime.diff(recordTime, 'second'))
              return logDiff < closestDiff ? log : closest
            }, null)
          }
          
          if (matchingLog) {
            setSelectedLog(matchingLog)
            setSelectedLogs([matchingLog])
            setLogDetailModalVisible(true)
            
            // 初始化 mergedNewValues 的基础数据（包括数量）
            const matchingLogNewValues = typeof matchingLog.new_values === 'object' ? matchingLog.new_values : {}
            setMergedNewValues({
              ...matchingLogNewValues,
              quantity: record.quantity || 0,
              batch_number: record.batch_number
            })
            
            // 获取商品信息
            const productResponse = await productAPI.getProduct(productId)
            if (productResponse.success && productResponse.data) {
              setProductInfo(productResponse.data)
            }
            
            // 加载SN码信息（从数据库查询，更可靠）- 使用Promise不阻塞
            loadSNCodesForDisplay(record, productId, [matchingLog]).catch(err => console.error('加载SN码失败:', err))
          } else {
            // 如果找不到匹配日志，使用交易记录数据构造一个临时的日志对象
            console.warn('未找到匹配的日志记录，使用交易记录数据', {
              recordTime: record.created_at,
              recordQuantity: record.quantity,
              logsFound: response.data.data.length,
              filters
            })
            
            // 构造一个临时的日志对象
            const operationTypeMap: Record<string, string> = {
              'in': 'inbound',
              'out': 'outbound',
              'adjust': 'inventory_check'
            }
            const operationType = operationTypeMap[record.type] || 'inbound'
            const operationDescMap: Record<string, string> = {
              'in': '入库',
              'out': '出库',
              'adjust': '盘点调整'
            }
            const operationDesc = operationDescMap[record.type] || '库存调整'
            
            // 计算库存变化
            const oldQuantity = (record.balance || 0) - (record.quantity || 0)
            const newQuantity = record.balance || 0
            
            // 构造临时日志对象
            const newValuesObj = {
              type: record.type,
              quantity: record.quantity || 0,
              new_quantity: newQuantity,
              old_quantity: oldQuantity,
              location: (record as any).location,
              batch_number: record.batch_number,
              notes: record.notes
            }
            const tempLog: SystemLog = {
              id: 0,
              user_id: record.created_by || null,
              operation_type: operationType,
              table_name: 'inventory',
              record_id: productId,
              old_values: null,
              new_values: JSON.stringify(newValuesObj),
              description: `${operationDesc}: 商品SKU ${productInfo?.sku}, 数量 ${record.quantity || 0}, 库存从 ${oldQuantity} 变为 ${newQuantity}`,
              ip_address: null,
              created_at: record.created_at,
              user_name: record.creator_name || '系统'
            }
            
            setSelectedLog(tempLog)
            setSelectedLogs([tempLog])
            setLogDetailModalVisible(true)
            
            // 初始化 mergedNewValues
            setMergedNewValues({
              ...newValuesObj
            })
            
            // 获取商品信息
            const productResponse = await productAPI.getProduct(productId)
            if (productResponse.success && productResponse.data) {
              setProductInfo(productResponse.data)
            }
            
            // 加载SN码信息（从数据库查询，更可靠）- 使用Promise不阻塞
            loadSNCodesForDisplay(record, productId, [tempLog]).catch(err => console.error('加载SN码失败:', err))
          }
        } else {
          // 如果查询失败或返回空结果，使用交易记录数据构造一个临时的日志对象
          console.warn('查询日志失败或返回空结果，使用交易记录数据', { response, filters })
          
          // 构造一个临时的日志对象
          const operationTypeMap: Record<string, string> = {
            'in': 'inbound',
            'out': 'outbound',
            'adjust': 'inventory_check'
          }
          const operationType = operationTypeMap[record.type] || 'inbound'
          const operationDescMap: Record<string, string> = {
            'in': '入库',
            'out': '出库',
            'adjust': '盘点调整'
          }
          const operationDesc = operationDescMap[record.type] || '库存调整'
          
          // 计算库存变化
          const oldQuantity = (record.balance || 0) - (record.quantity || 0)
          const newQuantity = record.balance || 0
          
          // 构造临时日志对象
          const newValuesObj = {
            type: record.type,
            quantity: record.quantity || 0,
            new_quantity: newQuantity,
            old_quantity: oldQuantity,
            location: (record as any).location,
            batch_number: record.batch_number,
            notes: record.notes
          }
          const tempLog: SystemLog = {
            id: 0,
            user_id: record.created_by || null,
            operation_type: operationType,
            table_name: 'inventory',
            record_id: productId,
            old_values: null,
            new_values: JSON.stringify(newValuesObj),
            description: `${operationDesc}: 商品SKU ${productInfo?.sku}, 数量 ${record.quantity || 0}, 库存从 ${oldQuantity} 变为 ${newQuantity}`,
            ip_address: null,
            created_at: record.created_at,
            user_name: record.creator_name || '系统'
          }
          
          setSelectedLog(tempLog)
          setSelectedLogs([tempLog])
          setLogDetailModalVisible(true)
          
          // 初始化 mergedNewValues
          setMergedNewValues({
            ...newValuesObj
          })
          
          // 获取商品信息
          const productResponse = await productAPI.getProduct(productId)
          if (productResponse.success && productResponse.data) {
            setProductInfo(productResponse.data)
          }
          
          // 加载SN码信息（从数据库查询，更可靠）- 使用Promise不阻塞
          loadSNCodesForDisplay(record, productId, [tempLog]).catch(err => console.error('加载SN码失败:', err))
        }
      }
    } catch (error) {
      console.error('加载操作日志详情失败:', error)
      Modal.error({
        title: '错误',
        content: '加载操作日志详情失败'
      })
    } finally {
      setLoadingLog(false)
    }
  }

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const filterParams: any = {
        productId: productId
      }
      
      if (transactionType) {
        filterParams.type = transactionType
      }
      
      // 处理时间范围（onChange 已自动设置默认时分秒）
      if (dateRange && dateRange[0]) {
        filterParams.startDate = dateRange[0].format('YYYY-MM-DD HH:mm:ss')
      }
      
      if (dateRange && dateRange[1]) {
        filterParams.endDate = dateRange[1].format('YYYY-MM-DD HH:mm:ss')
      }
      
      const response = await inventoryAPI.getTransactions(currentPage, pageSize, filterParams)
      if (response.success && response.data) {
        setTransactions(response.data.data || [])
        setTotal(response.data.total || 0)
      } else {
        setTransactions([])
        setTotal(0)
      }
    } catch (error) {
      console.error('加载库存流水记录失败:', error)
      setTransactions([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  // 交易类型映射
  const typeMap: Record<string, { text: string; color: string }> = {
    'in': { text: '入库', color: 'green' },
    'out': { text: '出库', color: 'red' },
    'adjust': { text: '盘点调整', color: 'orange' },
    'transfer': { text: '调拨', color: 'blue' }
  }

  const columns = [
    {
      title: '交易时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string, record: MergedTransaction) => {
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
      title: '交易类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const info = typeMap[type] || { text: type, color: 'default' }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center' as const,
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      width: 100,
      align: 'center' as const,
      render: (balance: number) => (
        <span style={{ fontWeight: 500 }}>{balance}</span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: MergedTransaction) => {
        // 根据 reference_type 映射到操作日志的筛选条件
        const getLogFilters = () => {
          const typeMap: Record<string, { table_name: string; operation_type?: string }> = {
            'purchase_order': { table_name: 'purchase_orders', operation_type: 'create_purchase_order' },
            'purchase_return': { table_name: 'purchase_returns', operation_type: 'create_purchase_return' },
            'inbound': { table_name: 'inventory', operation_type: 'inbound' },
            'outbound': { table_name: 'inventory', operation_type: 'outbound' },
            'inventory_check': { table_name: 'inventory', operation_type: 'inventory_check' }
          }
          
          // 如果有 reference_type 和 reference_id，查看关联单据的日志
          if (record.reference_type && record.reference_id) {
            const mapping = typeMap[record.reference_type] || { table_name: record.reference_type }
            
            // 对于采购订单和退货，record_id 是 reference_id
            // 对于库存操作，如果有关联单据，也查看关联单据的日志
            if (record.reference_type === 'purchase_order' || record.reference_type === 'purchase_return') {
              return {
                table_name: mapping.table_name,
                operation_type: mapping.operation_type,
                record_id: record.reference_id
              }
            }
          }
          
          // 如果没有关联单据，或者关联类型是库存操作，查看该商品的库存操作日志
          const operationTypeMap: Record<string, string> = {
            'in': 'inbound',
            'out': 'outbound',
            'adjust': 'inventory_check'
          }
          
          return {
            table_name: 'inventory',
            operation_type: operationTypeMap[record.type] || 'inbound',
            record_id: productId
          }
        }
        
        return (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            loading={loadingLog}
            onClick={() => {
              loadLogDetail(record)
            }}
          >
            查看
          </Button>
        )
      }
    },
    {
      title: '操作人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 120,
      render: (text: string) => text || '系统'
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (text: string) => text || '-'
    }
  ]

  return (
    <Modal
      title={`库存流水记录${productName ? ` - ${productName}` : ''}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1000}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
        <Space wrap>
          <Text>交易类型：</Text>
          <Select
            style={{ width: 150 }}
            placeholder="全部"
            allowClear
            value={transactionType}
            onChange={setTransactionType}
          >
            {Object.entries(typeMap).map(([key, value]) => (
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
          <Button onClick={loadTransactions}>查询</Button>
        </Space>
      </Space>
      <Table
        columns={columns}
        dataSource={mergedTransactions}
        loading={loading}
        rowKey={(record) => record.isMerged ? `merged-${record.id}-${record.mergedCount}` : `transaction-${record.id}`}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => {
            const mergedTotal = mergedTransactions.length
            const originalTotal = transactions.length
            if (mergedTotal < originalTotal) {
              return `显示 ${mergedTotal} 条（已合并 ${originalTotal - mergedTotal} 条），原始记录共 ${total} 条`
            }
            return `共 ${total} 条`
          },
          onChange: (page, size) => {
            setCurrentPage(page)
            setPageSize(size)
          }
        }}
        scroll={{ y: 400 }}
      />
      
      {/* 操作日志详情弹窗 */}
      <Modal
        title="操作描述详情"
        open={logDetailModalVisible}
        onCancel={() => {
          setLogDetailModalVisible(false)
          setSelectedLog(null)
          setSelectedLogs([])
          setProductInfo(null)
          setSelectedTransaction(null)
          setMergedNewValues({})
          setDisplaySNCodes([])
        }}
        footer={[
          <Button key="close" onClick={() => {
            setLogDetailModalVisible(false)
            setSelectedLog(null)
            setSelectedLogs([])
            setProductInfo(null)
            setSelectedTransaction(null)
            setMergedNewValues({})
            setDisplaySNCodes([])
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
                    if ((selectedLogs.length > 1 || selectedTransaction?.isMerged === true) && selectedLogs.length > 0) {
                      // 按时间排序，使用最早的时间
                      const sortedLogs = [...selectedLogs].sort((a, b) => {
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
                  const operationTypeMap: Record<string, { text: string; color: string }> = {
                    'create_product': { text: '创建商品', color: 'blue' },
                    'update_product': { text: '更新商品', color: 'cyan' },
                    'delete_product': { text: '删除商品', color: 'red' },
                    'inbound': { text: '商品入库', color: 'green' },
                    'outbound': { text: '商品出库', color: 'orange' },
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
                    'delete_store': { text: '删除门店', color: 'red' }
                  }
                  const info = operationTypeMap[selectedLog.operation_type] || { text: selectedLog.operation_type, color: 'default' }
                  return <Tag color={info.color}>{info.text}</Tag>
                })()}
              </div>
              {selectedLog.user_name && (
                <div>
                  <Text strong>操作人员：</Text>
                  <Text>{selectedLog.user_name}</Text>
                </div>
              )}
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
                  {(() => {
                    // 检查是否是合并记录（多条日志或交易记录是合并的）
                    const isMergedRecord = selectedLogs.length > 1 || selectedTransaction?.isMerged === true
                    
                    if (isMergedRecord) {
                      // 使用 mergedNewValues 和 displaySNCodes，它们包含从数据库查询的完整数据
                      const totalQuantity = mergedNewValues.quantity || 0
                      const firstDescription = selectedLogs[0]?.description || selectedLog?.description || ''
                      
                      // 生成合并后的描述
                      if (firstDescription) {
                        // 替换数量（匹配 "数量 X" 或 "数量X"）
                        let updatedDescription = firstDescription.replace(/数量\s*\d+/, `数量 ${totalQuantity}`)
                        
                        // 替换库存变化（匹配 "库存从 X 变为 Y"）
                        // 直接使用 mergedNewValues 中的值，不再计算
                        const oldQuantity = mergedNewValues.old_quantity !== undefined && mergedNewValues.old_quantity !== null 
                          ? mergedNewValues.old_quantity 
                          : 0
                        const newQuantity = mergedNewValues.new_quantity !== undefined && mergedNewValues.new_quantity !== null
                          ? mergedNewValues.new_quantity
                          : (oldQuantity + totalQuantity) // 后备计算
                        updatedDescription = updatedDescription.replace(/库存从\s*\d+\s*变为\s*\d+/, `库存从 ${oldQuantity} 变为 ${newQuantity}`)
                        
                        // 移除原描述中的SN码部分（详细内容中已有显示）
                        updatedDescription = updatedDescription.replace(/[，,]?\s*SN码[^，]*/, '')
                        
                        return updatedDescription
                      }
                      
                      // 如果没有原始描述，生成新的描述
                      // 直接使用 mergedNewValues 中的值，不再计算
                      const oldQuantity = mergedNewValues.old_quantity !== undefined && mergedNewValues.old_quantity !== null 
                        ? mergedNewValues.old_quantity 
                        : 0
                      const newQuantity = mergedNewValues.new_quantity !== undefined && mergedNewValues.new_quantity !== null
                        ? mergedNewValues.new_quantity
                        : (oldQuantity + totalQuantity) // 后备计算
                      return `数量 ${totalQuantity}, 库存从 ${oldQuantity} 变为 ${newQuantity}`
                    }
                    
                    // 单条记录，但如果有SN码且数量不匹配，也需要更新描述
                    // 优先使用从数据库查询的 displaySNCodes 和 mergedNewValues（更准确）
                    const logNewValues = selectedLog ? (typeof selectedLog.new_values === 'object' ? selectedLog.new_values : {}) : {}
                    const logSNCodes = (logNewValues as any)?.sn_codes || []
                    const logSNCount = Array.isArray(logSNCodes) ? logSNCodes.length : 0
                    
                    // 优先使用从数据库查询的SN码（更准确），如果没有则使用日志中的SN码
                    const actualSNCodes = displaySNCodes.length > 0 ? displaySNCodes : (Array.isArray(logSNCodes) ? logSNCodes : [])
                    const actualSNCount = actualSNCodes.length
                    
                    // 优先使用 mergedNewValues 中的数量（已根据SN码更新），如果没有则使用SN码数量
                    const mergedQuantity = mergedNewValues.quantity || 0
                    const actualQuantity = mergedQuantity > 0 ? mergedQuantity : (actualSNCount > 0 ? actualSNCount : 0)
                    
                    if (selectedLog && actualQuantity > 0) {
                      const logQuantity = (logNewValues as any)?.quantity || 0
                      
                      // 如果实际数量与日志中的数量不一致，或者有SN码，更新描述
                      if (actualQuantity !== logQuantity || actualSNCount > 0) {
                        // 优先使用 mergedNewValues 中的库存值（已正确处理合并交易的情况）
                        let oldQuantity = mergedNewValues.old_quantity
                        let newQuantity = mergedNewValues.new_quantity
                        
                        // 如果 mergedNewValues 中没有库存值，尝试从交易记录中获取
                        if ((oldQuantity === undefined || oldQuantity === null) && selectedTransaction?.isMerged && selectedTransaction?.mergedTransactions) {
                          const sortedTransactions = [...selectedTransaction.mergedTransactions].sort((a, b) => {
                            const timeA = dayjs(a.created_at).valueOf()
                            const timeB = dayjs(b.created_at).valueOf()
                            return timeA - timeB
                          })
                          
                          const firstTransaction = sortedTransactions[0]
                          const firstBalance = firstTransaction.balance || 0
                          const firstQty = firstTransaction.quantity || 0
                          oldQuantity = firstBalance - firstQty
                          
                          const lastTransaction = sortedTransactions[sortedTransactions.length - 1]
                          newQuantity = lastTransaction.balance || 0
                        }
                        
                        // 如果还是没有，使用日志中的值或计算
                        if (oldQuantity === undefined || oldQuantity === null) {
                          oldQuantity = (logNewValues as any)?.old_quantity || 0
                        }
                        if (newQuantity === undefined || newQuantity === null) {
                          newQuantity = (logNewValues as any)?.new_quantity || (oldQuantity + actualQuantity)
                        }
                        
                        const originalDescription = selectedLog.description || ''
                        if (originalDescription) {
                          // 替换数量
                          let updatedDescription = originalDescription.replace(/数量\s*\d+/, `数量 ${actualQuantity}`)
                          // 替换库存变化
                          updatedDescription = updatedDescription.replace(/库存从\s*\d+\s*变为\s*\d+/, `库存从 ${oldQuantity} 变为 ${newQuantity}`)
                          // 移除原描述中的SN码部分（详细内容中已有显示）
                          updatedDescription = updatedDescription.replace(/[，,]?\s*SN码[^，]*/, '')
                          return updatedDescription
                        }
                        
                        return `入库: 商品SKU ${productInfo?.sku}, 数量 ${actualQuantity}, 库存从 ${oldQuantity} 变为 ${newQuantity}`
                      }
                    }
                    
                    return selectedLog?.description || '无描述'
                  })()}
                </div>
              </div>
              {selectedLog && (
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
                          <Text>{productInfo?.name + ' (SKU: ' + productInfo?.sku + ')' || '-'}</Text>
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
              )}
              {selectedLog.old_values && typeof selectedLog.old_values === 'object' && Object.keys(selectedLog.old_values).length > 0 && (
                <div>
                  <Text strong>原值：</Text>
                  <div style={{ 
                    marginTop: 8, 
                    padding: 12, 
                    backgroundColor: '#f5f5f5', 
                    borderRadius: 4,
                    maxHeight: 200,
                    overflowY: 'auto'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(selectedLog.old_values, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </Space>
          </div>
        )}
      </Modal>
    </Modal>
  )
}

export default StockTransactionModal
