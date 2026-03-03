// 增量更新相关类型定义

// 文件清单项
export interface FileManifestItem {
  hash: string      // 文件 SHA256 哈希
  size: number      // 文件大小（字节）
  modified: string  // 修改时间（ISO 字符串）
}

// 文件清单
export interface FileManifest {
  [relativePath: string]: FileManifestItem
}

// 更新清单
export interface UpdateManifest {
  fromVersion: string    // 源版本
  toVersion: string      // 目标版本
  timestamp: string      // 创建时间（ISO 字符串）
  package: {
    name: string         // 包文件名
    size: number         // 包大小（字节）
    hash: string         // 包 SHA256 哈希
    downloadUrl?: string // 下载 URL（服务器填充）
  }
  changes: {
    added: number        // 新增文件数量
    modified: number     // 修改文件数量
    deleted: number      // 删除文件数量
  }
  files: {
    added: string[]      // 新增的文件路径列表
    modified: string[]   // 修改的文件路径列表
    deleted: string[]    // 删除的文件路径列表
  }
  patchFiles?: string[]  // 需要应用补丁的文件列表（bsdiff 补丁文件）
  fileManifest: FileManifest // 完整文件清单
}

// 更新变更统计
export interface UpdateChanges {
  added: number
  modified: number
  deleted: number
}

// 增量更新信息（用于客户端）
export interface IncrementalUpdateInfo {
  fromVersion: string
  toVersion: string
  packageSize: number        // 包大小（MB）
  totalFiles: number         // 总文件数
  changes: UpdateChanges
  releaseNotes?: string      // 更新日志
  estimatedTime?: number     // 预估下载时间（秒）
}

// 增量更新状态
export type IncrementalUpdateStatus =
  | 'checking'           // 检查更新中
  | 'available'          // 有更新可用
  | 'downloading'        // 下载中
  | 'downloaded'         // 下载完成
  | 'applying'           // 应用更新中
  | 'applied'            // 更新应用完成
  | 'error'              // 错误
  | null

// 增量更新进度
export interface IncrementalUpdateProgress {
  percent: number         // 下载进度百分比 (0-100)
  transferred: number     // 已下载字节数
  total: number           // 总字节数
  speed?: number          // 下载速度（字节/秒）
}

// 增量更新错误信息
export interface IncrementalUpdateError {
  code: string            // 错误代码
  message: string         // 错误消息
  details?: any          // 详细错误信息
}

// 服务器响应格式
export interface ServerResponse<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

// 检查更新响应
export interface CheckUpdateResponse extends ServerResponse<UpdateManifest> {
  update?: UpdateManifest
}

// 下载进度事件数据
export interface DownloadProgressEvent {
  percent: number
  transferred: number
  total: number
  speed?: number
}

// 更新可用事件数据
export interface UpdateAvailableEvent {
  update: UpdateManifest
  info: IncrementalUpdateInfo
}

// 更新应用完成事件数据
export interface UpdateAppliedEvent {
  fromVersion: string
  toVersion: string
  success: boolean
}

// 更新错误事件数据
export interface UpdateErrorEvent {
  error: IncrementalUpdateError
  context?: string // 错误发生的上下文（如 'download', 'apply'）
}

// IPC 处理器参数和返回值

// 检查增量更新
export interface CheckIncrementalUpdateParams {
  currentVersion: string
}

export interface CheckIncrementalUpdateResult {
  available: boolean
  update?: UpdateManifest
  info?: IncrementalUpdateInfo
  error?: string
}

// 下载增量更新
export interface DownloadIncrementalUpdateParams {
  update: UpdateManifest
}

export interface DownloadIncrementalUpdateResult {
  success: boolean
  error?: string
}

// 应用增量更新
export interface ApplyIncrementalUpdateParams {
  update: UpdateManifest
}

export interface ApplyIncrementalUpdateResult {
  success: boolean
  error?: string
  restarted?: boolean
}

// 增量更新配置
export interface IncrementalUpdateConfig {
  enabled: boolean
  serverUrl?: string
  backupEnabled: boolean
  maxRetries: number
  timeout: number // 毫秒
}