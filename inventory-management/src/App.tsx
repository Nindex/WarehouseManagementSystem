import { useEffect, Suspense, lazy } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Layout, App as AntdApp, Spin } from 'antd'
import { useAppSelector } from '@/store/hooks'
import SystemLogService from '@/services/database/SystemLogService'
import { databaseAPI } from '@/services/api'
import MainLayout from '@/components/Layout/MainLayout'
import ErrorBoundary from '@/components/ErrorBoundary'

// 懒加载页面组件，实现代码分割
const LoginPage = lazy(() => import('@/pages/Login'))
const RegisterPage = lazy(() => import('@/pages/Register'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Procurement = lazy(() => import('@/pages/Procurement'))
const Reports = lazy(() => import('@/pages/Reports'))
const Settings = lazy(() => import('@/pages/Settings'))
const Customers = lazy(() => import('@/pages/Customers'))
const Stores = lazy(() => import('@/pages/Stores'))

const { Content } = Layout

function App() {
  const { isAuthenticated } = useAppSelector((state) => state.auth)

  // 应用启动时确保 system_logs 表存在并执行数据库迁移
  useEffect(() => {
    console.log('App 组件已挂载，开始初始化')
    
    // 在后台初始化 system_logs 表（不阻塞应用启动）
    SystemLogService.ensureTableExists()
      .then(() => {
        console.log('system_logs 表初始化成功')
      })
      .catch((error) => {
      console.warn('初始化 system_logs 表时出现警告（不影响应用使用）:', error)
    })
    
    // 执行数据库迁移（添加 balance 字段等）
    databaseAPI.migrate()
      .then(() => {
        console.log('数据库迁移完成')
      })
      .catch((error) => {
      console.warn('数据库迁移时出现警告（不影响应用使用）:', error)
    })
  }, [])

  // 加载中组件
  const LoadingFallback = (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
      <Spin size="large" />
    </div>
  )

  return (
    <AntdApp>
      <Router>
        <Suspense fallback={LoadingFallback}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/*"
              element={
                isAuthenticated ? (
                  <MainLayout>
                    <Content style={{ margin: '10px 10px', minHeight: 280 }}>
                      <ErrorBoundary>
                        <Suspense fallback={LoadingFallback}>
                          <Routes>
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/inventory" element={<Inventory />} />
                            <Route path="/inventory/inbound" element={<Inventory />} />
                            <Route path="/inventory/outbound" element={<Inventory />} />
                            <Route path="/inventory/check" element={<Inventory />} />
                            <Route path="/procurement" element={<Navigate to="/procurement/orders" replace />} />
                            <Route path="/procurement/orders" element={<Procurement />} />
                            <Route path="/procurement/orders/new" element={<Procurement />} />
                            <Route path="/procurement/orders/:id" element={<Procurement />} />
                            <Route path="/procurement/suppliers" element={<Procurement />} />
                            <Route path="/procurement/suppliers/new" element={<Procurement />} />
                            <Route path="/procurement/suppliers/:id" element={<Procurement />} />
                            <Route path="/procurement/returns" element={<Procurement />} />
                            <Route path="/procurement/returns/new" element={<Procurement />} />
                            <Route path="/customers" element={<Customers />} />
                            <Route path="/stores" element={<Stores />} />
                            <Route path="/reports" element={<Navigate to="/reports/inventory" replace />} />
                            <Route path="/reports/inventory" element={<Reports />} />
                            <Route path="/reports/procurement" element={<Reports />} />
                            <Route path="/reports/outbound" element={<Reports />} />
                            <Route path="/settings" element={<Navigate to="/settings/users" replace />} />
                            <Route path="/settings/profile" element={<Settings />} />
                            <Route path="/settings/users" element={<Settings />} />
                            <Route path="/settings/backup" element={<Settings />} />
                            <Route path="/settings/about" element={<Settings />} />
                          </Routes>
                        </Suspense>
                      </ErrorBoundary>
                    </Content>
                  </MainLayout>
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Routes>
        </Suspense>
      </Router>
    </AntdApp>
  )
}

export default App
