import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, callback)
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    }
  },
  
  // 兼容旧API
  electronAPI: {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    dbQuery: (query: string, params: any[]) => ipcRenderer.invoke('db-query', query, params),
    dbQueryOne: (query: string, params: any[]) => ipcRenderer.invoke('db-query-one', query, params),
    dbInsert: (query: string, params: any[]) => ipcRenderer.invoke('db-insert', query, params),
    dbUpdate: (query: string, params: any[]) => ipcRenderer.invoke('db-update', query, params),
    dbBatch: (statements: { sql: string; params: any[] }[]) => ipcRenderer.invoke('db-batch', statements),
    dbInit: (opts?: { reset?: boolean; seed?: boolean }) => ipcRenderer.invoke('db-init', opts),
    
    // Database operations
    dbStatus: () => ipcRenderer.invoke('db-status'),
    dbBackup: (backupPath?: string) => ipcRenderer.invoke('db-backup', backupPath),
    dbBackupTest: () => ipcRenderer.invoke('db-backup-test'),
    dbRestore: (backupPath: string) => ipcRenderer.invoke('db-restore', backupPath),
    dbCleanupBackups: () => ipcRenderer.invoke('db-cleanup-backups'),
    dbStats: () => ipcRenderer.invoke('db-stats'),
    dbExec: (sql: string) => ipcRenderer.invoke('db-exec', sql),
    dbClearAllData: () => ipcRenderer.invoke('db-clear-all-data'),
    dbMigrate: () => ipcRenderer.invoke('db-migrate'),
    dbRepair: () => ipcRenderer.invoke('db-repair'),
    
    // 文件对话框
    showFolderDialog: () => ipcRenderer.invoke('show-folder-dialog'),
    showBackupFileDialog: () => ipcRenderer.invoke('show-backup-file-dialog'),
    
        // 更新相关（electron-updater）
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        downloadUpdate: () => ipcRenderer.invoke('download-update'),
        installUpdate: () => ipcRenderer.invoke('install-update'),
        testUpdateServer: (url: string) => ipcRenderer.invoke('test-update-server', url),
        getUpdateServerUrl: () => ipcRenderer.invoke('get-update-server-url'),
        setUpdateServerUrl: (url: string) => ipcRenderer.invoke('set-update-server-url', url),
    
    // electron-updater 事件监听器
    onUpdateChecking: (callback: (event: any) => void) => {
      ipcRenderer.on('update-checking', callback)
    },
    onUpdateAvailable: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('update-available', callback)
    },
    onUpdateNotAvailable: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('update-not-available', callback)
    },
    onUpdateDownloadProgress: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('update-download-progress', callback)
    },
    onUpdateDownloaded: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('update-downloaded', callback)
    },
    onUpdateError: (callback: (event: any, data: any) => void) => {
      ipcRenderer.on('update-error', callback)
    },

    removeUpdateListeners: () => {
      ipcRenderer.removeAllListeners('update-checking')
      ipcRenderer.removeAllListeners('update-available')
      ipcRenderer.removeAllListeners('update-not-available')
      ipcRenderer.removeAllListeners('update-download-progress')
      ipcRenderer.removeAllListeners('update-downloaded')
      ipcRenderer.removeAllListeners('update-error')
    }
  }
})

// Type definitions for the exposed API
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>
        on: (channel: string, callback: (event: any, ...args: any[]) => void) => void
        removeAllListeners: (channel: string) => void
      }
      electronAPI: {
        getAppVersion: () => Promise<string>
        dbQuery: (query: string, params: any[]) => Promise<{ success: boolean; data: any[]; error?: string }>
        dbQueryOne: (query: string, params: any[]) => Promise<{ success: boolean; data: any; error?: string }>
        dbInsert: (query: string, params: any[]) => Promise<{ success: boolean; lastId: number; error?: string }>
        dbUpdate: (query: string, params: any[]) => Promise<{ success: boolean; changes: number; error?: string }>
        dbBatch: (statements: { sql: string; params: any[] }[]) => Promise<{ success: boolean }>
        dbInit: (opts?: { reset?: boolean; seed?: boolean }) => Promise<{ success: boolean; data?: any; error?: string }>
        dbStatus: () => Promise<{ success: boolean; data: any; error?: string }>
        dbBackup: (backupPath?: string) => Promise<{ success: boolean; message: string; path?: string; error?: string }>
        dbBackupTest: () => Promise<{ success: boolean; message?: string; error?: string }>
        dbRestore: (backupPath: string) => Promise<{ success: boolean; message: string; error?: string }>
        dbCleanupBackups: () => Promise<{ success: boolean; message?: string; error?: string }>
        dbStats: () => Promise<{ success: boolean; data: any; error?: string }>
        dbExec: (sql: string) => Promise<{ success: boolean; error?: string }>
        dbClearAllData: () => Promise<{ success: boolean; error?: string }>
        dbMigrate: () => Promise<{ success: boolean; message?: string; error?: string }>
        dbRepair: () => Promise<{ success: boolean; message?: string; error?: string }>
        showFolderDialog: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
        showBackupFileDialog: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
        checkForUpdates: () => Promise<{ success: boolean }>
        downloadUpdate: () => Promise<{ success: boolean; error?: string }>
        installUpdate: () => Promise<{ success: boolean; error?: string }>
        testUpdateServer: (url: string) => Promise<{ success: boolean; error?: string }>
        getUpdateServerUrl: () => Promise<string>
        setUpdateServerUrl: (url: string) => Promise<{ success: boolean }>

        // electron-updater 事件
        onUpdateChecking: (callback: (event: any) => void) => void
        onUpdateAvailable: (callback: (event: any, data: any) => void) => void
        onUpdateNotAvailable: (callback: (event: any, data: any) => void) => void
        onUpdateDownloadProgress: (callback: (event: any, data: any) => void) => void
        onUpdateDownloaded: (callback: (event: any, data: any) => void) => void
        onUpdateError: (callback: (event: any, data: any) => void) => void

        removeUpdateListeners: () => void
      }
    }
  }
}
