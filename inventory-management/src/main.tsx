import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { store } from './store'
import './index.css'

// 初始化数据库
// 数据库初始化由主进程负责，前端不再执行本地文件读写

// 自定义主题配置
const theme = {
  token: {
    colorPrimary: '#003366',
    colorSuccess: '#28a745',
    colorWarning: '#ffc107',
    colorError: '#dc3545',
    borderRadius: 6,
    fontFamily: '"思源黑体", "微软雅黑", "苹方", "黑体", "宋体", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    fontSize: 16,
    fontSizeLG: 16,
    fontSizeMD: 16,
    fontSizeSM: 14,
    fontSizeXS: 12,
    fontSizeXXS: 10,
  },
  components: {
    Layout: {
      headerBg: '#003366',
      headerColor: '#fff',
      siderBg: '#f0f2f5',
    },
    Menu: {
      darkItemBg: '#003366',
      darkItemColor: '#fff',
    },
  },
}

// 应用启动日志
console.log('前端应用开始启动', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  hasRoot: !!document.getElementById('root')
})

try {
  const rootElement = document.getElementById('root')
  if (!rootElement) {
    console.error('未找到 root 元素，无法启动应用')
    throw new Error('未找到 #root 元素')
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Provider store={store}>
        <ConfigProvider locale={zhCN} theme={theme}>
          <App />
        </ConfigProvider>
      </Provider>
    </React.StrictMode>,
  )

  console.log('前端应用渲染完成')
} catch (error) {
  console.error('前端应用启动失败', {
    error: error?.toString(),
    errorMessage: (error as Error)?.message,
    errorStack: (error as Error)?.stack
  })
  // 显示错误信息到页面
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: monospace;">
        <h1 style="color: red;">应用启动失败</h1>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto;">
${(error as Error)?.stack || error?.toString() || '未知错误'}
        </pre>
      </div>
    `
  }
}
