export function formatCurrency(value: unknown, symbol: string = '¥', digits: number = 2): string {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  const safe = Number.isFinite(n) ? n : 0
  return `${symbol}${safe.toFixed(digits)}`
}

export function formatNumber(value: unknown, digits: number = 2): string {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  const safe = Number.isFinite(n) ? n : 0
  return safe.toFixed(digits)
}

/**
 * 生成批次号
 * 格式：YYMMDDHHMM + 自增数字（3位，从000开始）
 * 例如：2412171430000, 2412171430001, 2412171430002
 */
export function generateBatchNumberPrefix(): string {
  const now = new Date()
  const year = String(now.getFullYear()).slice(-2) // 后两位年份
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}`
}
