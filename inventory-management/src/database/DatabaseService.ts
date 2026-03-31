type AnyRecord = Record<string, any>

const api = (typeof window !== 'undefined' && (window as any).electron?.electronAPI) as any

async function query<T = AnyRecord>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await api?.dbQuery?.(sql, params)
  if (res && res.success === false) throw new Error(res.error || '数据库查询失败')
  return res?.data ?? []
}

async function queryOne<T = AnyRecord>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

async function insert(sql: string, params: any[] = []): Promise<number> {
  const res = await api?.dbInsert?.(sql, params)
  if (res && res.success === false) throw new Error(res.error || '数据库插入失败')
  return res?.lastId ?? 0
}

async function update(sql: string, params: any[] = []): Promise<number> {
  const res = await api?.dbUpdate?.(sql, params)
  if (res && res.success === false) throw new Error(res.error || '数据库更新失败')
  return res?.changes ?? 0
}

async function batch(statements: { sql: string; params: any[] }[]): Promise<void> {
  const res = await api?.dbBatch?.(statements)
  if (res && res.success === false) throw new Error(res.error || '数据库批处理失败')
}

// 事务锁，防止并发事务
let transactionLock = false

async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  // 等待其他事务完成
  while (transactionLock) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  
  transactionLock = true
  try {
    // 开始事务
    await api?.dbExec?.('BEGIN TRANSACTION')
    
    try {
      // 执行事务内的操作
      const result = await fn()
      
      // 提交事务
      await api?.dbExec?.('COMMIT')
      
      return result
    } catch (error) {
      // 回滚事务
      try {
        await api?.dbExec?.('ROLLBACK')
      } catch (rollbackError) {
        console.error('回滚事务失败:', rollbackError)
      }
      throw error
    }
  } finally {
    transactionLock = false
  }
}

async function initialize(opts?: { reset?: boolean; seed?: boolean }): Promise<void> {
  const res = await api?.dbInit?.(opts || {})
  if (res && res.success === false) throw new Error(res.error || '数据库初始化失败')
}

async function executeScript(_sql: string): Promise<void> {
  await initialize()
}

function getStatus(): { connected: boolean; path: string } {
  return { connected: true, path: '' }
}

async function backup(targetPath?: string): Promise<void> {
  const res = await api?.dbBackup?.(targetPath)
  if (res && res.success === false) throw new Error(res.error || '数据库备份失败')
}

async function restore(backupPath: string): Promise<void> {
  const res = await api?.dbRestore?.(backupPath)
  if (res && res.success === false) throw new Error(res.error || '数据库恢复失败')
}

async function exec(sql: string): Promise<void> {
  const res = await api?.dbExec?.(sql)
  if (res && res.success === false) throw new Error(res.error || '数据库执行失败')
}

async function clearAllData(): Promise<void> {
  const res = await api?.dbClearAllData?.()
  if (res && res.success === false) throw new Error(res.error || '清除数据失败')
}

export default {
  query,
  queryOne,
  insert,
  update,
  batch,
  transaction,
  initialize,
  executeScript,
  getStatus,
  backup,
  restore,
  exec,
  clearAllData,
}
