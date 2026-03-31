import dayjs from 'dayjs'
import type { SystemLog } from '@/services/database/SystemLogService'

/**
 * 合并后的日志类型
 */
export interface MergedLog extends SystemLog {
  mergedCount?: number
  mergedLogs?: SystemLog[]
  isMerged?: boolean
  timeRange?: string
  totalQuantity?: number
  allSNCodes?: string[]
}

/**
 * 操作类型映射配置
 */
export const operationTypeMap: Record<string, { text: string; color: string }> = {
  // 商品操作
  'create_product': { text: '创建商品', color: 'blue' },
  'update_product': { text: '更新商品', color: 'cyan' },
  'delete_product': { text: '删除商品', color: 'red' },
  
  // 库存操作
  'inbound': { text: '商品入库', color: 'green' },
  'outbound': { text: '商品出库', color: 'orange' },
  'inventory_check': { text: '库存盘点', color: 'purple' },
  'inventory_adjust': { text: '库存调整', color: 'purple' },
  'delete_serial_number': { text: '删除SN码', color: 'red' },
  'batch_inbound': { text: '批量入库', color: 'green' },
  
  // 客户操作
  'create_customer': { text: '创建客户', color: 'blue' },
  'update_customer': { text: '更新客户', color: 'cyan' },
  'delete_customer': { text: '删除客户', color: 'red' },
  
  // 门店操作
  'create_store': { text: '创建门店', color: 'blue' },
  'update_store': { text: '更新门店', color: 'cyan' },
  'delete_store': { text: '删除门店', color: 'red' },
  
  // 系统操作
  'login': { text: '用户登录', color: 'green' },
  'logout': { text: '用户登出', color: 'default' },
  'backup': { text: '数据备份', color: 'blue' },
  'restore': { text: '数据恢复', color: 'orange' },
  'clear_data': { text: '清除数据', color: 'red' }
}

/**
 * 表名与操作类型的映射关系
 */
export const tableOperationMap: Record<string, string[]> = {
  'products': ['create_product', 'update_product', 'delete_product'],
  'inventory': ['inbound', 'outbound', 'inventory_check', 'inventory_adjust', 'batch_inbound'],
  'sn_status': ['delete_serial_number'],
  'customers': ['create_customer', 'update_customer', 'delete_customer'],
  'customer_stores': ['create_store', 'update_store', 'delete_store']
}

/**
 * 合并相同商品、相同批次、相同操作类型、时间相近的日志
 * @param logs 原始日志数组
 * @returns 合并后的日志数组
 */
export function mergeLogs(logs: SystemLog[]): MergedLog[] {
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
}

/**
 * 根据 table_name 获取相关的操作类型
 * @param tableName 表名
 * @returns 操作类型映射
 */
export function getFilteredOperationTypes(tableName?: string): Record<string, { text: string; color: string }> {
  if (!tableName) {
    // 如果没有指定 table_name，返回所有操作类型
    return operationTypeMap
  }

  const allowedTypes = tableOperationMap[tableName] || []
  const filtered: Record<string, { text: string; color: string }> = {}
  
  allowedTypes.forEach(type => {
    if (operationTypeMap[type]) {
      filtered[type] = operationTypeMap[type]
    }
  })

  return filtered
}

/**
 * 获取操作类型的颜色
 * @param operationType 操作类型
 * @returns 颜色
 */
export function getOperationTypeColor(operationType: string): string {
  return operationTypeMap[operationType]?.color || 'default'
}

/**
 * 获取操作类型的文本
 * @param operationType 操作类型
 * @returns 文本
 */
export function getOperationTypeText(operationType: string): string {
  return operationTypeMap[operationType]?.text || operationType
}
