import React, { useState, useEffect, useRef } from 'react'
import { Card, Form, Input, Button, Row, Col, Switch, Select, App, Tabs, Table, Space, Modal, Tag, Checkbox, Descriptions, Typography, Divider, Alert, Progress } from 'antd'
import { SaveOutlined, LockOutlined, UserOutlined, SettingOutlined, DeleteOutlined, PlusOutlined, DatabaseOutlined, ExclamationCircleOutlined, FolderOpenOutlined, InfoCircleOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { setUser } from '@/store/slices/authSlice'
import { databaseAPI, userAPI, systemSettingAPI } from '@/services/api'

const { TabPane } = Tabs
const { Option } = Select

const Settings: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [loading, setLoading] = useState(false)
  const { message } = App.useApp()
  
  // 根据路由确定默认激活的Tab
  const pathname = location.pathname.replace(/^#/, '')
  const getDefaultTab = (): string => {
    if (pathname.includes('/users')) return 'users'
    if (pathname.includes('/backup')) return 'backup'
    if (pathname.includes('/about')) return 'about'
    return 'profile' // 默认显示个人资料
  }
  const [activeTab, setActiveTab] = useState(getDefaultTab())
  
  // 用户管理相关状态
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [clearDataModalVisible, setClearDataModalVisible] = useState(false)
  const [clearDataForm] = Form.useForm()
  const [clearing, setClearing] = useState(false)
  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [backupForm] = Form.useForm()
  const [backupPath, setBackupPath] = useState<string>('')
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [repairLoading, setRepairLoading] = useState(false)
  const [backupTestLoading, setBackupTestLoading] = useState(false)
  const [defaultBackupPath, setDefaultBackupPath] = useState<string>('')
  const [updateServerUrl, setUpdateServerUrl] = useState<string>('')
  const [testUpdateServerLoading, setTestUpdateServerLoading] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error' | null>(null)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [updateMessage, setUpdateMessage] = useState('')
  const updateCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const defaultTab = getDefaultTab()
    setActiveTab(defaultTab)
    if (defaultTab === 'users') {
      loadUsers()
    } else if (defaultTab === 'backup') {
      loadBackupSettings()
    } else if (defaultTab === 'about') {
    }
  }, [pathname])
  
  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers()
    } else if (activeTab === 'backup') {
      loadBackupSettings()
    } else if (activeTab === 'about') {
    }
  }, [activeTab])

  // 设置更新事件监听器（electron-updater）
  useEffect(() => {
    const api = (window as any).electron?.electronAPI
    if (!api) return

    // 设置 electron-updater 事件监听
    api.onUpdateChecking?.((_event: any) => {
      setUpdateStatus('checking')
      setUpdateMessage('正在检查更新...')
    })

    api.onUpdateAvailable?.((_event: any, data: any) => {
      // 清除超时定时器
      if (updateCheckTimeoutRef.current) {
        clearTimeout(updateCheckTimeoutRef.current)
        updateCheckTimeoutRef.current = null
      }
      setUpdateStatus('available')
      const updateInfo = {
        version: data.version,
        releaseNotes: data.releaseNotes || '',
        releaseDate: data.releaseDate
      }
      setUpdateInfo(updateInfo)
      setUpdateMessage(`发现新版本 ${data.version}`)
      message.info(`发现新版本 ${data.version}，可以开始下载`)
    })

    api.onUpdateNotAvailable?.((_event: any, data: any) => {
      // 清除超时定时器
      if (updateCheckTimeoutRef.current) {
        clearTimeout(updateCheckTimeoutRef.current)
        updateCheckTimeoutRef.current = null
      }
      setUpdateStatus('up-to-date')
      setUpdateMessage('当前已是最新版本')
      message.info('当前已是最新版本')
    })

    api.onUpdateDownloadProgress?.((_event: any, data: any) => {
      setUpdateStatus('downloading')
      setDownloadProgress(data.percent || 0)
      setUpdateMessage(`正在下载更新: ${data.percent || 0}%`)
    })

    api.onUpdateDownloaded?.((_event: any, data: any) => {
      if (updateCheckTimeoutRef.current) {
        clearTimeout(updateCheckTimeoutRef.current)
        updateCheckTimeoutRef.current = null
      }
      setUpdateStatus('downloaded')
      setDownloadProgress(100)
      setUpdateMessage(`更新下载完成，版本 ${data.version}`)
      message.success('更新下载完成，可以开始安装了')
    })

    api.onUpdateError?.((_event: any, data: any) => {
      // 清除超时定时器
      if (updateCheckTimeoutRef.current) {
        clearTimeout(updateCheckTimeoutRef.current)
        updateCheckTimeoutRef.current = null
      }
      setUpdateStatus('error')
      const errorMessage = data?.error || '更新失败'
      setUpdateMessage(errorMessage)
      message.error(errorMessage)
    })

    return () => {
      api.removeUpdateListeners?.()
    }
  }, [])
  
  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const response = await userAPI.getAllUsers(1, 100)
      if (response.success && response.data) {
        setUsers(response.data.data)
      } else {
        message.error(response.error || '加载用户列表失败')
        setUsers([])
      }
    } catch (error) {
      console.error('加载用户列表失败:', error)
      message.error('加载用户列表失败')
      setUsers([])
    } finally {
      setUsersLoading(false)
    }
  }

  const handleSaveProfile = async (values: any) => {
    if (!user?.id) {
      message.error('用户信息不存在')
      return
    }
    
    setLoading(true)
    try {
      const response = await userAPI.updateUser(user.id, {
        name: values.name,
        email: values.email
      })
      
      if (response.success && response.data) {
        message.success('个人资料保存成功')
        // 更新 Redux store 中的用户信息
        dispatch(setUser(response.data))
        // 更新表单初始值
        profileForm.setFieldsValue({
          name: response.data.name || values.name,
          email: response.data.email || values.email
        })
      } else {
        message.error(response.error || '保存失败')
      }
    } catch (error: any) {
      console.error('保存个人资料失败:', error)
      message.error(error?.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSavePassword = async (values: any) => {
    if (!user?.id) {
      message.error('用户信息不存在')
      return
    }
    
    setLoading(true)
    try {
      const response = await userAPI.changePassword(
        user.id,
        values.currentPassword,
        values.newPassword
      )
      
      if (response.success) {
        message.success('密码修改成功')
        // 重置表单
        passwordForm.resetFields()
      } else {
        message.error(response.error || '密码修改失败')
      }
    } catch (error: any) {
      console.error('修改密码失败:', error)
      message.error(error?.message || '密码修改失败')
    } finally {
      setLoading(false)
    }
  }

  const loadBackupSettings = async () => {
    try {
      console.log('开始加载备份设置...')
      
      // 优先从 electron API 获取更新服务器地址（更可靠）
      const api = (window as any).electron?.electronAPI
      let updateServerUrlValue = ''
      
      if (api?.getUpdateServerUrl) {
        try {
          const url = await api.getUpdateServerUrl()
          console.log('从 Electron API 获取的更新服务器地址:', url)
          if (url && url.trim()) {
            updateServerUrlValue = url.trim()
          }
        } catch (error) {
          console.error('从 Electron API 获取更新服务器地址失败:', error)
        }
      }
      
      // 从系统设置 API 获取所有设置
      const response = await systemSettingAPI.getSettings()
      console.log('系统设置 API 响应:', response)
      
      if (response.success && response.data) {
        const settings = response.data
        console.log('系统设置数据:', settings)
        
        // 如果 Electron API 没有返回地址，使用数据库中的值
        if (!updateServerUrlValue && settings.updateServerUrl) {
          updateServerUrlValue = settings.updateServerUrl.trim()
          console.log('使用数据库中的更新服务器地址:', updateServerUrlValue)
        }
        
        // 设置备份页面的自动备份开关和保留天数
        const formValues = {
          autoBackup: settings.autoBackup !== 'false', // 默认为true
          backupRetentionDays: parseInt(settings.backupRetentionDays || '10', 10),
          updateServerUrl: updateServerUrlValue,
        }
        console.log('准备设置表单值:', formValues)
        
        // 使用 setTimeout 确保表单已完全初始化
        setTimeout(() => {
          backupForm.setFieldsValue(formValues)
          
          // 验证表单值是否设置成功
          const currentValues = backupForm.getFieldsValue()
          console.log('设置后的表单值:', currentValues)
          console.log('updateServerUrl 字段值:', currentValues.updateServerUrl)
        }, 100)
        
        // 设置更新服务器地址状态（用于显示）
        setUpdateServerUrl(updateServerUrlValue)
        console.log('最终设置的更新服务器地址:', updateServerUrlValue)
        
        // 设置默认备份路径（数据库目录下的backups文件夹）
        // 由于无法直接获取数据库路径，这里显示提示信息
        setDefaultBackupPath('数据库目录下的 backups 文件夹')
      } else {
        // 即使系统设置 API 失败，也尝试设置从 Electron API 获取的地址
        if (updateServerUrlValue) {
          backupForm.setFieldsValue({ updateServerUrl: updateServerUrlValue })
          setUpdateServerUrl(updateServerUrlValue)
          console.log('系统设置 API 失败，但设置了从 Electron API 获取的地址:', updateServerUrlValue)
        }
      }
    } catch (error) {
      console.error('加载备份设置失败:', error)
    }
  }

  // 选择备份文件夹
  const handleSelectBackupFolder = async () => {
    try {
      const api = (window as any).electron?.electronAPI
      if (!api?.showFolderDialog) {
        message.error('文件对话框功能不可用')
        return
      }
      
      const result = await api.showFolderDialog()
      if (result.success && result.path) {
        setBackupPath(result.path)
        message.success('已选择备份文件夹')
      } else if (!result.canceled) {
        message.error(result.error || '选择文件夹失败')
      }
    } catch (error: any) {
      console.error('选择备份文件夹失败:', error)
      message.error(error?.message || '选择文件夹失败')
    }
  }

  // 执行备份
  const handleBackup = async () => {
    if (!backupPath) {
      message.warning('请先选择备份文件夹')
      return
    }
    
    setBackupLoading(true)
    try {
      const response = await databaseAPI.backup(backupPath)
      if (response.success) {
        message.success(`备份成功！文件保存在: ${response.data?.path || backupPath}`)
      } else {
        message.error(response.error || '备份失败')
      }
    } catch (error: any) {
      console.error('备份失败:', error)
      message.error(error?.message || '备份失败')
    } finally {
      setBackupLoading(false)
    }
  }

  // 测试备份功能
  const handleBackupTest = async () => {
    setBackupTestLoading(true)
    try {
      const response = await databaseAPI.backupTest()
      if (response.success) {
        message.success(response.message || '备份测试完成，请查看日志确认结果')
      } else {
        message.error(response.error || '备份测试失败')
      }
    } catch (error: any) {
      console.error('备份测试失败:', error)
      message.error(error?.message || '备份测试失败')
    } finally {
      setBackupTestLoading(false)
    }
  }

  // 修复数据库
  const handleRepair = async () => {
    Modal.confirm({
      title: '确认修复数据库',
      content: '确定要修复数据库吗？\n\n此操作将：\n1. 检查并创建缺失的表\n2. 检查并添加缺失的字段\n3. 检查并创建缺失的索引\n4. 执行数据库迁移脚本\n\n注意：此操作不会删除任何数据，所有现有数据将被保留。',
      okText: '确认修复',
      okType: 'primary',
      cancelText: '取消',
      onOk: async () => {
        setRepairLoading(true)
        try {
          const response = await databaseAPI.repair()
          if (response.success) {
            message.success(response.message || '数据库修复成功！')
            // 不需要刷新页面，因为数据没有变化
          } else {
            message.error(response.error || '数据库修复失败')
          }
        } catch (error: any) {
          console.error('修复数据库失败:', error)
          message.error(error?.message || '修复数据库失败')
        } finally {
          setRepairLoading(false)
        }
      }
    })
  }

  // 恢复备份
  const handleRestore = async () => {
    try {
      const api = (window as any).electron?.electronAPI
      if (!api?.showBackupFileDialog) {
        message.error('文件对话框功能不可用')
        return
      }
      
      const result = await api.showBackupFileDialog()
      if (!result.success || !result.path) {
        if (!result.canceled) {
          message.error(result.error || '选择备份文件失败')
        }
        return
      }
      
      Modal.confirm({
        title: '确认恢复备份',
        content: `确定要恢复备份文件吗？\n${result.path}\n\n警告：此操作将覆盖当前数据库，且无法撤销！`,
        okText: '确认恢复',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          setRestoreLoading(true)
          try {
            const response = await databaseAPI.restore(result.path!)
            if (response.success) {
              message.success('恢复成功！请刷新页面以查看最新数据')
              setTimeout(() => {
                window.location.reload()
              }, 2000)
            } else {
              message.error(response.error || '恢复失败')
            }
          } catch (error: any) {
            console.error('恢复失败:', error)
            message.error(error?.message || '恢复失败')
          } finally {
            setRestoreLoading(false)
          }
        }
      })
    } catch (error: any) {
      console.error('恢复备份失败:', error)
      message.error(error?.message || '恢复失败')
    }
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    const api = (window as any).electron?.electronAPI
    if (!api?.checkForUpdates) {
      message.error('更新功能不可用')
      return
    }

    // 清除之前的超时定时器
    if (updateCheckTimeoutRef.current) {
      clearTimeout(updateCheckTimeoutRef.current)
      updateCheckTimeoutRef.current = null
    }

    setUpdateStatus('checking')
    setUpdateMessage('正在检查更新...')
    
    // 前端超时处理：30秒后如果还在检查中，显示超时错误
    updateCheckTimeoutRef.current = setTimeout(() => {
      setUpdateStatus((prevStatus) => {
        // 只有在仍然是 checking 状态时才显示超时错误
        if (prevStatus === 'checking') {
          message.error('检查更新超时，请检查网络连接或更新服务器地址是否正确')
          return 'error'
        }
        return prevStatus
      })
      setUpdateMessage('检查更新超时，请检查网络连接或更新服务器地址是否正确')
      updateCheckTimeoutRef.current = null
    }, 30000) // 30秒超时
    
    try {
      await api.checkForUpdates()
      // 注意：不在这里清除超时，因为状态由事件监听器管理
      // 超时会在事件监听器中清除
    } catch (error: any) {
      // 清除超时定时器
      if (updateCheckTimeoutRef.current) {
        clearTimeout(updateCheckTimeoutRef.current)
        updateCheckTimeoutRef.current = null
      }
      setUpdateStatus('error')
      setUpdateMessage('检查更新失败')
      message.error('检查更新失败')
    }
  }

  // 下载更新
  const handleDownloadUpdate = async () => {
    const api = (window as any).electron?.electronAPI
    if (!api?.downloadUpdate) {
      message.error('下载功能不可用')
      return
    }

    try {
      setUpdateStatus('downloading')
      setUpdateMessage('正在下载更新...')
      const result = await api.downloadUpdate()
      if (!result.success) {
        setUpdateStatus('error')
        setUpdateMessage(result.error || '下载更新失败')
        message.error(result.error || '下载更新失败')
      }
    } catch (error: any) {
      setUpdateStatus('error')
      setUpdateMessage('下载更新失败')
      message.error(error?.message || '下载更新失败')
    }
  }

  // 安装更新
  const handleInstallUpdate = async () => {
    const api = (window as any).electron?.electronAPI
    if (!api?.installUpdate) {
      message.error('安装功能不可用')
      return
    }

    try {
      const result = await api.installUpdate()
      if (!result.success) {
        message.error(result.error || '安装更新失败')
      } else {
        // electron-updater 会自动退出并安装
        message.info('应用即将退出以安装更新...')
      }
    } catch (error: any) {
      message.error(error?.message || '安装更新失败')
    }
  }

  // 数据表映射配置
  const dataTypeConfig = [
    { 
      key: 'products', 
      label: '商品信息', 
      tables: ['products', 'inventory_batches', 'sn_status'],
      description: '所有商品的基本信息（同时清除相关的批次数据和SN码状态）'
    },
    { 
      key: 'categories', 
      label: '分类信息', 
      tables: ['categories'],
      description: '商品分类数据'
    },
    { 
      key: 'inventory', 
      label: '库存数据', 
      tables: ['inventory', 'inventory_batches', 'sn_status'],
      description: '库存记录、批次信息和SN码状态'
    },
    { 
      key: 'inventory_transactions', 
      label: '库存流水', 
      tables: ['inventory_transactions'],
      description: '所有库存变动记录'
    },
    { 
      key: 'purchase_orders', 
      label: '采购订单', 
      tables: ['purchase_orders', 'purchase_order_items'],
      description: '采购订单及明细'
    },
    { 
      key: 'purchase_returns', 
      label: '采购退货', 
      tables: ['purchase_returns', 'purchase_return_items'],
      description: '采购退货单及明细'
    },
    { 
      key: 'outbound', 
      label: '出库记录', 
      tables: ['outbound_records', 'outbound_sn_items'],
      description: '出库单及序列号明细'
    },
    { 
      key: 'suppliers', 
      label: '供应商信息', 
      tables: ['suppliers'],
      description: '所有供应商数据'
    },
    { 
      key: 'customers', 
      label: '客户信息', 
      tables: ['customers', 'customer_stores'],
      description: '客户及门店信息'
    },
    { 
      key: 'system_logs', 
      label: '操作日志', 
      tables: ['system_logs'],
      description: '系统操作日志记录'
    },
  ]

  // 清除所有数据
  const handleClearAllData = async () => {
    try {
      const values = await clearDataForm.validateFields()
      if (values.confirmText !== '确认清除') {
        message.error('验证文字不正确')
        return
      }

      // 获取选中的数据类型
      const selectedTypes = values.dataTypes || []
      if (selectedTypes.length === 0) {
        message.error('请至少选择一种要清除的数据类型')
        return
      }

      // 根据选择的数据类型，收集需要清除的表
      const tablesToClear: string[] = []
      selectedTypes.forEach((typeKey: string) => {
        const config = dataTypeConfig.find(c => c.key === typeKey)
        if (config) {
          tablesToClear.push(...config.tables)
        }
      })

      setClearing(true)
      const response = await databaseAPI.clearAllData(tablesToClear)
      
      if (response.success) {
        const selectedLabels = dataTypeConfig
          .filter(c => selectedTypes.includes(c.key))
          .map(c => c.label)
          .join('、')
        message.success(`已清除 ${selectedLabels}，请刷新页面`)
        setClearDataModalVisible(false)
        clearDataForm.resetFields()
        // 延迟刷新页面，让用户看到成功消息
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        message.error(response.error || '清除数据失败')
      }
    } catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error?.message || '清除数据失败')
    } finally {
      setClearing(false)
    }
  }

  // Modal title 和内容
  const modalTitle = (
    <span style={{ color: '#ff4d4f' }}>
      <ExclamationCircleOutlined /> 确认清除数据
    </span>
  )

  const modalContent = (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: '#ff4d4f', fontWeight: 'bold', marginBottom: 8 }}>
        警告：此操作将永久删除选中的业务数据，且无法恢复！
      </p>
      <p style={{ marginBottom: 16 }}>
        请选择要清除的数据类型，然后在下方输入框中输入 <strong style={{ color: '#ff4d4f' }}>"确认清除"</strong> 以继续。
      </p>
      <p style={{ color: '#52c41a', marginBottom: 16 }}>
        注意：用户账号信息将被保留，不会受到影响。
      </p>
    </div>
  )

  return (
    <div className="settings-container">
      <Card>
        <h2 style={{ marginBottom: 15 }}>
          <SettingOutlined /> 系统设置
        </h2>
        
        <Tabs activeKey={activeTab} onChange={(key) => {
          setActiveTab(key)
          // 同步更新 URL，让左边菜单栏跟随选中状态
          navigate(`/settings/${key}`)
        }}>
          <TabPane tab={<span><UserOutlined />用户管理</span>} key="users">
            <div>
              <div style={{ marginBottom: 16 }}>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => {
                    message.info('用户管理功能开发中')
                  }}
                >
                  新建用户
                </Button>
              </div>
              <Table
                columns={[
                  { title: '用户名', dataIndex: 'username', key: 'username' },
                  { title: '姓名', dataIndex: 'name', key: 'name' },
                  { title: '邮箱', dataIndex: 'email', key: 'email' },
                  { 
                    title: '状态', 
                    dataIndex: 'status', 
                    key: 'status', 
                    render: (status: any) => (
                      <Tag color={status === 1 ? 'success' : 'default'}>
                        {status === 1 ? '启用' : '禁用'}
                      </Tag>
                    )
                  }
                ]}
                dataSource={users}
                rowKey="id"
                loading={usersLoading}
              />
            </div>
          </TabPane>

          <TabPane tab={<span><DatabaseOutlined />数据备份</span>} key="backup">
            <div>
              <Card>
                <Form 
                  form={backupForm}
                  layout="vertical"
                  initialValues={{
                    autoBackup: true,
                    backupRetentionDays: 10,
                    updateServerUrl: ''
                  }}
                  onFinish={async (values) => {
                    setLoading(true)
                    try {
                      // 验证备份保留天数
                      const retentionDays = parseInt(String(values.backupRetentionDays || 10), 10)
                      if (isNaN(retentionDays) || retentionDays < 1 || retentionDays > 365) {
                        message.error('备份保留天数必须在1-365天之间')
                        return
                      }
                      
                      const settings: Record<string, string> = {
                        autoBackup: String(values.autoBackup !== false), // 默认为true
                        backupRetentionDays: String(retentionDays),
                        updateServerUrl: values.updateServerUrl || '',
                      }
                      
                      const response = await systemSettingAPI.setSettings(settings)
                      
                      if (response.success) {
                        message.success(`备份设置保存成功！保留天数已设置为 ${retentionDays} 天`)
                        // 重新加载设置以确认保存成功
                        await loadBackupSettings()
                        
                        // 立即清理超出保留天数的备份文件
                        try {
                          const cleanupResponse = await databaseAPI.cleanupBackups()
                          if (cleanupResponse.success) {
                            message.info(cleanupResponse.message || '已清理过期备份文件')
                          } else {
                            console.warn('清理备份文件时出现警告:', cleanupResponse.error)
                          }
                        } catch (cleanupError: any) {
                          console.warn('清理备份文件失败:', cleanupError)
                          // 不显示错误消息，因为设置已保存成功
                        }
                      } else {
                        message.error(response.error || '保存失败')
                      }
                    } catch (error: any) {
                      console.error('保存备份设置失败:', error)
                      message.error(error?.message || '保存失败')
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                <Row>
                  <Form.Item label="自动备份" name="autoBackup">
                    <Switch />
                  </Form.Item>
                  <Form.Item 
                    label="备份保留天数" 
                    name="backupRetentionDays"
                    rules={[
                      { required: true, message: '请输入备份保留天数' },
                      {
                        validator: (_, value) => {
                          if (!value) {
                            return Promise.resolve()
                          }
                          const numValue = parseInt(String(value), 10)
                          if (isNaN(numValue)) {
                            return Promise.reject(new Error('请输入有效的数字'))
                          }
                          if (numValue < 1 || numValue > 365) {
                            return Promise.reject(new Error('保留天数必须在1-365天之间'))
                          }
                          return Promise.resolve()
                        }
                      }
                    ]}
                  >
                    <Input 
                      type="number" 
                      min={1} 
                      max={365} 
                      style={{ width: 200 }}
                      onBlur={(e) => {
                        // 失去焦点时验证值
                        const value = parseInt(e.target.value, 10)
                        if (value < 1 || value > 365) {
                          message.warning('备份保留天数必须在1-365天之间')
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item label="自动备份路径（固定路径，不可修改）" style={{width:300}}>
                    <Input 
                      value={defaultBackupPath}
                      readOnly
                      placeholder="数据库目录下的 backups 文件夹"
                      disabled
                    />
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      自动备份和测试备份固定保存在数据库目录下的 backups 文件夹，与手动备份路径完全独立，互不影响
                    </div>
                  </Form.Item>
                  <Form.Item label="手动备份路径（仅用于立即备份）" style={{width:400}}>
                    <Input.Group compact>
                      <Input 
                        style={{ width: 'calc(100% - 100px)' }}
                        placeholder="选择备份文件夹（仅用于立即备份功能）" 
                        value={backupPath}
                        readOnly
                      />
                      <Button 
                        icon={<FolderOpenOutlined />}
                        onClick={handleSelectBackupFolder}
                        style={{ width: 50 }}
                      >
                      </Button>
                    </Input.Group>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      此路径仅用于"立即备份"功能，不会影响自动备份。自动备份固定保存在数据库目录下的backups文件夹。
                    </div>
                  </Form.Item>
                </Row>
                  <Form.Item>
                    <Space>
                      <Button 
                        type="primary" 
                        icon={<DatabaseOutlined />}
                        onClick={handleBackup}
                        loading={backupLoading}
                      >
                        立即备份
                      </Button>
                      <Button 
                        onClick={handleBackupTest}
                        loading={backupTestLoading}
                      >
                        测试备份
                      </Button>
                      <Button 
                        onClick={handleRestore}
                        loading={restoreLoading}
                      >
                        恢复备份
                      </Button>
                      <Button 
                        danger
                        icon={<SettingOutlined />}
                        onClick={handleRepair}
                        loading={repairLoading}
                      >
                        修复数据库
                      </Button>
                    </Space>
                  </Form.Item>
                  <Form.Item>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading} 
                        icon={<SaveOutlined />}
                        size="large"
                        style={{ minWidth: 150 }}
                      >
                        保存备份设置
                      </Button>
                      <div style={{ color: '#ff9800', fontSize: 12, marginTop: 4 }}>
                        ⚠️ 重要提示：修改"备份保留天数"后，必须点击"保存备份设置"按钮才能使设置生效！
                      </div>
                    </Space>
                  </Form.Item>
                  <Divider>更新服务器配置</Divider>
                  
                  <Form.Item
                    label="更新服务器地址"
                    name="updateServerUrl"
                  >
                    <Input
                      placeholder="请输入更新服务器地址（开发测试：http://111.228.2.193:8080）"
                    />
                  </Form.Item>
                  <Form.Item>
                    <Space>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={async () => {
                          console.log('保存按钮被点击')
                          const values = backupForm.getFieldsValue()
                          console.log('表单值:', values)
                          const url = (values.updateServerUrl || '').trim()
                          console.log('更新服务器地址:', url)
                          
                          if (!url) {
                            message.warning('请输入更新服务器地址')
                            return
                          }
                          
                          try {
                            console.log('开始保存更新服务器地址...')
                            
                            // 先通过 electron API 保存到数据库
                            const api = (window as any).electron?.electronAPI
                            console.log('Electron API 可用:', !!api)
                            console.log('setUpdateServerUrl 可用:', !!api?.setUpdateServerUrl)
                            
                            if (api?.setUpdateServerUrl) {
                              console.log('通过 Electron API 保存...')
                              const result = await api.setUpdateServerUrl(url)
                              console.log('Electron API 保存结果:', result)
                              if (!result || !result.success) {
                                message.error('保存到数据库失败')
                                return
                              }
                            } else {
                              console.warn('Electron API 不可用，仅通过系统设置 API 保存')
                            }
                            
                            // 同时通过系统设置 API 保存（确保一致性）
                            console.log('通过系统设置 API 保存...')
                            const settings: Record<string, string> = {
                              updateServerUrl: url,
                            }
                            const response = await systemSettingAPI.setSettings(settings)
                            console.log('系统设置 API 保存结果:', response)
                            
                            if (response.success) {
                              message.success('更新服务器地址保存成功')
                              setUpdateServerUrl(url)
                              // 验证保存是否成功
                              if (api?.getUpdateServerUrl) {
                                const savedUrl = await api.getUpdateServerUrl()
                                console.log('保存后的更新服务器地址:', savedUrl)
                              }
                            } else {
                              message.error(response.error || '保存失败')
                            }
                          } catch (error: any) {
                            console.error('保存更新服务器地址失败:', error)
                            console.error('错误堆栈:', error?.stack)
                            message.error(error?.message || '保存失败')
                          }
                        }}
                      >
                        保存更新服务器地址
                      </Button>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={testUpdateServerLoading}
            onClick={async () => {
              const values = backupForm.getFieldsValue()
              const url = (values.updateServerUrl || '').trim()
              if (!url) {
                message.warning('请先输入更新服务器地址')
                return
              }
              
              setTestUpdateServerLoading(true)
              try {
                const api = (window as any).electron?.electronAPI
                if (!api?.testUpdateServer) {
                  message.error('测试连接功能不可用')
                  return
                }
                
                            const result = await api.testUpdateServer(url)
                            console.log('测试连接返回结果:', JSON.stringify(result, null, 2))
                            console.log('服务器版本:', result?.serverVersion)
                            console.log('当前版本:', result?.currentVersion)
                            console.log('版本错误:', result?.versionError)
                            console.log('是否有新版本:', result?.isNewer)
                            
                            if (result && result.success) {
                              let messageText = '连接测试成功！更新服务器可访问\n\n'
                              
                              // 显示当前版本（总是有）
                              if (result.currentVersion) {
                                messageText += `当前版本: ${result.currentVersion}\n`
                              }
                              
                              // 显示服务器版本信息
                              if (result.serverVersion) {
                                messageText += `服务器版本: ${result.serverVersion}\n\n`
                                if (result.isNewer) {
                                  messageText += `✅ 检测到新版本可用！`
                                } else if (result.serverVersion === result.currentVersion) {
                                  messageText += `版本相同，已是最新版本`
                                } else {
                                  messageText += `服务器版本较旧`
                                }
                              } else {
                                // 优先显示后端返回的消息（正常情况）
                                if (result.message) {
                                  messageText += `\n${result.message}`
                                } else if (result.versionError) {
                                  messageText += `\n⚠️ 无法获取服务器版本信息\n错误详情: ${result.versionError}`
                                } else {
                                  messageText += `\n⚠️ 无法获取服务器版本信息`
                                }
                              }
                              
                              Modal.info({
                                title: '连接测试成功',
                                content: (
                                  <div style={{ whiteSpace: 'pre-line', lineHeight: '1.8', fontSize: 14 }}>
                                    {messageText}
                                  </div>
                                ),
                                width: 500
                              })
                            } else {
                              message.error(`连接测试失败：${result?.error || '未知错误'}`)
                            }
              } catch (error: any) {
                message.error(error?.message || '测试连接失败')
              } finally {
                setTestUpdateServerLoading(false)
              }
            }}
                      >
                        测试连接
                      </Button>
                    </Space>
                  </Form.Item>

                </Form>
              </Card>
              
              <Card 
                title="危险操作" 
                style={{ marginTop: 16 }}
                styles={{ header: { backgroundColor: '#fff2f0', borderColor: '#ffccc7' } }}
              >
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: '#ff4d4f', marginBottom: 8 }}>
                    <ExclamationCircleOutlined /> 警告：此操作将清除选中的业务数据，包括：
                  </p>
                  <ul style={{ color: '#666', listStyle: 'disc inside',marginLeft: 20, marginBottom: 16 ,paddingLeft: 20,paddingRight: 20,border: '1px solid #ffccc7',borderRadius: 4,backgroundColor: '#fff2f0',display: 'inline-block',width: '90%',padding: 20,paddingTop: 10,paddingBottom: 10}}>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>商品信息</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>分类信息</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>库存数据</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>库存流水记录</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>采购订单</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>采购退货</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>出库记录</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>供应商信息</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>客户信息</li>
                    <li style={{marginBottom: 8,float: 'left',marginRight: 30}}>操作日志</li>
                  </ul>
                  <p style={{ color: '#52c41a', marginBottom: 8 }}>
                    注意：用户账号信息将被保留，不会受到影响。您可以在清除时选择要清除的数据类型。
                  </p>
                  <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                    此操作不可恢复，请谨慎操作！
                  </p>
                </div>
                <Button 
                  type="primary" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    setClearDataModalVisible(true)
                    clearDataForm.resetFields()
                  }}
                >
                  清除数据
                </Button>
              </Card>
            </div>
          </TabPane>
          
          <TabPane tab={<span><UserOutlined />个人资料</span>} key="profile">
            <Card>
              <Form
                form={profileForm}
                layout="vertical"
                onFinish={handleSaveProfile}
                initialValues={{
                  name: user?.name || '',
                  email: user?.email || ''
                }}
              >
                <Row gutter={4}>
                  <Col span={4}>
                    <Form.Item label="用户名">
                      <Input disabled value={user?.username || ''} />
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item
                      label="姓名"
                      name="name"
                      rules={[{ required: true, message: '请输入姓名' }]}
                    >
                      <Input placeholder="请输入姓名" />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="邮箱"
                      name="email"
                      rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '请输入有效的邮箱地址' }
                      ]}
                    >
                      <Input placeholder="请输入邮箱" />
                    </Form.Item>
                  </Col>
                </Row>        
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                    保存资料
                  </Button>
              </Form>
            </Card>
            
            <Card title="修改密码" style={{ marginTop: 16 }}>
              <Form
                form={passwordForm}
                layout="vertical"
                onFinish={handleSavePassword}
              >
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="当前密码"
                      name="currentPassword"
                      rules={[{ required: true, message: '请输入当前密码' }]}
                    >
                      <Input.Password placeholder="请输入当前密码" />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label="新密码"
                      name="newPassword"
                      rules={[
                        { required: true, message: '请输入新密码' },
                        { min: 6, message: '密码长度至少为6位' }
                      ]}
                    >
                      <Input.Password placeholder="请输入新密码" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="确认新密码"
                      name="confirmPassword"
                      dependencies={['newPassword']}
                      rules={[
                        { required: true, message: '请确认新密码' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                              return Promise.resolve()
                            }
                            return Promise.reject(new Error('两次输入的密码不一致'))
                          },
                        }),
                      ]}
                    >
                      <Input.Password placeholder="请确认新密码" />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading} icon={<LockOutlined />}>
                    修改密码
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </TabPane>
          
          <TabPane tab={<span><InfoCircleOutlined /> 关于</span>} key="about">
            <Card>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={{ 
                  width: 80, 
                  height: 80, 
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                  borderRadius: '50%', 
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}>
                  <SettingOutlined style={{ fontSize: 40, color: '#fff' }} />
                </div>
                <Typography.Title level={2} style={{ margin: 0, color: '#1a1a2e' }}>
                  仓库管理系统
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                  本地化仓库管理系统
                </Typography.Text>
              </div>
              
              <Divider />
              
              <Descriptions 
                bordered 
                column={1}
                labelStyle={{ 
                  width: 120, 
                  fontWeight: 500,
                  backgroundColor: '#fafafa'
                }}
              >
                <Descriptions.Item label="应用名称">
                  仓库管理系统
                </Descriptions.Item>
                <Descriptions.Item label="版本号">
                  <Space>
                    <span>{'1.3.3'}</span>
                    <Button
                      type="link"
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={handleCheckUpdate}
                      loading={updateStatus === 'checking'}
                    >
                      检查更新
                    </Button>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="开发者">
                  小白
                </Descriptions.Item>
                <Descriptions.Item label="系统描述">
                  本地化仓库管理系统，支持商品管理、库存管理、采购管理、客户管理等核心功能
                </Descriptions.Item>
              </Descriptions>
              
              {/* 更新状态显示 */}
              {updateStatus && (
                <div style={{ marginTop: 24 }}>
                  {updateStatus === 'checking' && (
                    <Alert
                      message="正在检查更新..."
                      type="info"
                      showIcon
                    />
                  )}
                  
                  {updateStatus === 'available' && updateInfo && (
                    <Alert
                      message={`发现新版本 ${updateInfo.version || '未知版本'}`}
                      description={
                        <div>
                          {updateInfo.releaseDate && (
                            <p>发布日期: {new Date(updateInfo.releaseDate).toLocaleDateString('zh-CN')}</p>
                          )}
                          {updateInfo.packageSize && (
                            <p>更新包大小: {typeof updateInfo.packageSize === 'number' 
                              ? `${updateInfo.packageSize.toFixed(2)} MB` 
                              : updateInfo.packageSize}</p>
                          )}
                          {updateInfo.releaseNotes && (
                            <div style={{ marginTop: 8, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                              <Typography.Text strong>更新内容：</Typography.Text>
                              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6 }}>
                                {updateInfo.releaseNotes.split('\n').map((line: string, index: number) => (
                                  <div key={index}>{line}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      }
                      type="info"
                      showIcon
                      action={
                        <Button
                          size="small"
                          type="primary"
                          onClick={handleDownloadUpdate}
                        >
                          下载更新
                        </Button>
                      }
                    />
                  )}
                  
                  {updateStatus === 'up-to-date' && (
                    <Alert
                      message="已是最新版本"
                      description="您当前使用的版本已是最新版本，无需更新。"
                      type="success"
                      showIcon
                    />
                  )}
                  
                  {updateStatus === 'downloading' && (
                    <div>
                      <Alert
                        message={`正在下载更新: ${downloadProgress}%`}
                        type="info"
                        showIcon
                      />
                      <Progress percent={downloadProgress} style={{ marginTop: 8 }} />
                    </div>
                  )}
                  
                  {updateStatus === 'downloaded' && updateInfo && (
                    <Alert
                      message="更新下载完成"
                      description="新版本已下载完成，点击下方按钮安装并重启应用"
                      type="success"
                      showIcon
                      action={
                        <Button
                          size="small"
                          type="primary"
                          icon={<DownloadOutlined />}
                          onClick={handleInstallUpdate}
                        >
                          立即安装
                        </Button>
                      }
                    />
                  )}
                  
                  {updateStatus === 'error' && (
                    <Alert
                      message="更新检查失败"
                      description={updateMessage || '未知错误'}
                      type="error"
                      showIcon
                    />
                  )}
                </div>
              )}
              
              <div style={{ 
                marginTop: 32, 
                textAlign: 'center',
                color: '#999',
                fontSize: 12
              }}>
                <div>© 2024 仓库管理系统</div>
                <div style={{ marginTop: 8 }}>All rights reserved</div>
              </div>
            </Card>
          </TabPane>
        </Tabs>
      </Card>
      
      {/* 清除数据确认弹窗 */}
      <Modal
        title={modalTitle}
        open={clearDataModalVisible}
        onCancel={() => {
          setClearDataModalVisible(false)
          clearDataForm.resetFields()
        }}
        footer={null}
        width={700}
      >
        {modalContent}
        
        <Form
          form={clearDataForm}
          layout="vertical"
          onFinish={handleClearAllData}
          initialValues={{
            dataTypes: []
          }}
        >
          <Form.Item
            label="选择要清除的数据类型"
            name="dataTypes"
            rules={[
              { 
                required: true, 
                message: '请至少选择一种要清除的数据类型',
                type: 'array',
                min: 1
              }
            ]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[16, 8]}>
                {dataTypeConfig.map(config => (
                  <Col span={12} key={config.key}>
                    <Checkbox value={config.key}>
                      <span style={{ fontWeight: 500 }}>{config.label}</span>
                      <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                        {config.description}
                      </div>
                      {config.key === 'inventory' && (
                        <div style={{ fontSize: 11, color: '#ff9800', marginTop: 4 }}>
                          ⚠️ 提示：批次管理中的商品信息来自"商品信息"，SN码来自"操作日志"
                        </div>
                      )}
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item
            label="确认文字"
            name="confirmText"
            rules={[
              { required: true, message: '请输入确认文字' },
              {
                validator(_, value) {
                  if (value === '确认清除') {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('请输入"确认清除"以继续'))
                },
              },
            ]}
          >
            <Input 
              placeholder="请输入：确认清除" 
              autoComplete="off"
            />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                danger 
                htmlType="submit"
                loading={clearing}
                icon={<DeleteOutlined />}
              >
                确认清除
              </Button>
              <Button 
                onClick={() => {
                  setClearDataModalVisible(false)
                  clearDataForm.resetFields()
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Settings
