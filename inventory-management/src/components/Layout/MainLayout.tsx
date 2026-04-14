import React, { useEffect, useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Space, theme, Button, Typography } from 'antd'
import {
  DashboardOutlined,
  ShopOutlined,
  BarChartOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { logout } from '@/store/slices/authSlice'
import { toggleSidebar } from '@/store/slices/uiSlice'

const { Header, Sider, Content } = Layout

interface MainLayoutProps {
  children: React.ReactNode
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { sidebarCollapsed } = useAppSelector((state) => state.ui)
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [currentTime, setCurrentTime] = useState<string>('')
  
  const {
    token: { colorBgContainer },
  } = theme.useToken()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: 'inventory-group',
      icon: <ShopOutlined />,
      label: '仓库管理',
      children: [
        { key: '/inventory', label: '商品列表' },
        { key: '/inventory/inbound', label: '商品入库' },
        { key: '/inventory/outbound', label: '商品出库' },
        { key: '/inventory/check', label: '库存盘点' },
      ],
    },
    {
      key: '/customers',
      icon: <TeamOutlined />,
      label: '客户管理',
    },
    {
      key: '/stores',
      icon: <ShopOutlined />,
      label: '门店管理',
    },
    {
      key: 'reports-group',
      icon: <BarChartOutlined />,
      label: '报表中心',
      children: [
        { key: '/reports/inventory', label: '库存报表' },
        { key: '/reports/outbound', label: '出入库报表' },
      ],
    },
    {
      key: 'settings-group',
      icon: <SettingOutlined />,
      label: '系统设置',
      children: [
        { key: '/settings/users', label: '用户管理' },
        { key: '/settings/system', label: '系统配置' },
        { key: '/settings/backup', label: '数据备份' },
        { key: '/settings/profile', label: '个人资料' },
        { key: '/settings/about', label: '关于' }
      ],
    },
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
    },
    {
      key: 'exit',
      icon: <PoweroffOutlined />,
      label: '退出系统',
      danger: true,
    },
  ]

  const handleUserMenuClick = ({ key }: { key: string }) => {
    if (key === 'profile') {
      navigate('/settings/profile')
    } else if (key === 'logout') {
      dispatch(logout())
    } else if (key === 'exit') {
      // @ts-ignore
      window.electron?.electronAPI?.quitApp?.()
    }
  }

  // 父菜单的 key 列表（不应该导航）
  const parentMenuKeys = ['inventory-group', 'reports-group', 'settings-group']

  const handleMenuClick = ({ key }: { key: string }) => {
    // 如果点击的是父菜单项（有子菜单的），不进行导航
    if (parentMenuKeys.includes(key)) {
      return
    }
    // 只对实际的路由路径进行导航
    if (key.startsWith('/')) {
      navigate(key)
    }
  }

  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys)
  }

  const getSelectedKeys = () => {
    const path = location.pathname
    // 处理 HashRouter 的路径（去掉 #）
    const cleanPath = path.replace(/^#/, '') || '/'
    
    if (cleanPath.startsWith('/inventory/')) return [cleanPath]
    if (cleanPath.startsWith('/reports/')) return [cleanPath]
    if (cleanPath.startsWith('/settings/')) return [cleanPath]
    if (cleanPath === '/inventory') return ['/inventory']
    if (cleanPath === '/reports') return ['/reports/inventory']
    if (cleanPath === '/settings') return ['/settings/users']
    return [cleanPath]
  }

  // 根据当前路径初始化 openKeys
  useEffect(() => {
    const path = location.pathname.replace(/^#/, '') || '/'
    if (path.startsWith('/inventory')) {
      setOpenKeys(['inventory-group'])
    } else if (path.startsWith('/reports')) {
      setOpenKeys(['reports-group'])
    } else if (path.startsWith('/settings')) {
      setOpenKeys(['settings-group'])
    }
  }, [location.pathname])

  // 更新时间的函数
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const formattedTime = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
      })
      setCurrentTime(formattedTime)
    }

    // 立即更新一次时间
    updateTime()

    // 每秒更新时间
    const timer = setInterval(updateTime, 1000)

    // 清理定时器
    return () => clearInterval(timer)
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={sidebarCollapsed}
        width={240}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px 8px 0 0',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          position: 'relative',
          overflow: 'hidden'
          
        }}>
          <div style={{
            position: 'absolute',
            right: -50,
            width: 150,
            height: 150,
            borderRadius: '50%',
            filter: 'blur(20px)'
          }} />
          <div style={{
            position: 'absolute',
            bottom: -30,
            left: -30,
            width: 100,
            height: 100,
            borderRadius: '50%',
            filter: 'blur(15px)'
          }} />
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            textAlign: 'center',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span
              style={{
                color: '#fff',
                fontSize: '25px',
                fontWeight: 'bold',
                zIndex: 1,
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                letterSpacing: '0.5px',
                opacity: sidebarCollapsed ? 0 : 1,
                position: 'absolute',
                transition: 'opacity 0.2s ease 0.1s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transform: sidebarCollapsed ? 'translateX(-10px)' : 'translateX(0)',
                transitionProperty: 'opacity, transform',
                transitionDuration: '0.8s',
                transitionTimingFunction: 'ease',
                transitionDelay: sidebarCollapsed ? '0s' : '0.1s'
              }}
            >
              仓库管理系统
            </span>
            <span
              style={{
                color: '#fff',
                fontSize: '18px',
                fontWeight: 'bold',
                zIndex: 1,
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                letterSpacing: '0.5px',
                opacity: sidebarCollapsed ? 1 : 0,
                position: 'absolute',
                transition: 'opacity 0.2s ease 0.1s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                transform: sidebarCollapsed ? 'translateX(0)' : 'translateX(10px)',
                transitionProperty: 'opacity, transform',
                transitionDuration: '0.8s',
                transitionTimingFunction: 'ease',
                transitionDelay: sidebarCollapsed ? '0.1s' : '0s'
              }}
            >
              仓库
            </span>
          </div>
        </div>
        
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          openKeys={openKeys}
          onOpenChange={handleOpenChange}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ 
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            borderRight: 'none',
            paddingTop: 8,
            paddingBottom: 8
          }}
          className="custom-menu"
        />
        <style>{`
          .custom-menu .ant-menu-item {
            margin: 4px 9px !important;
            border-radius: 8px !important;
            height: 44px !important;
            line-height: 44px !important;
            padding-inline-start: 12px !important;
            padding-inline-end: 32px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            text-align: left !important;
          }
          .custom-menu .ant-menu-item:hover {
            background: rgba(255, 255, 255, 0.1) !important;
            transform: translateX(0);
          }
          .custom-menu .ant-menu-item-selected {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
            transform: translateX(0);
          }
          .custom-menu .ant-menu-item-selected:hover {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            transform: translateX(0);
            color: #fff !important;
          }
          .custom-menu .ant-menu-item-selected::after {
            display: none !important;
          }
          .custom-menu .ant-menu-submenu {
            margin: 4px 4px !important;
            border-radius: 8px !important;
            background: transparent !important;
          }
          .custom-menu .ant-menu-submenu .ant-menu {
            background: transparent !important;
          }
          .custom-menu .ant-menu-submenu-title {
            border-radius: 8px !important;
            height: 44px !important;
            line-height: 44px !important;
            padding-inline-start: 12px !important;
            padding-inline-end: 32px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            display: flex !important;
            align-items: center !important;
            position: relative;
            justify-content: flex-start !important;
            text-align: left !important;
          }
          .custom-menu .ant-menu-submenu-title:hover {
            background: transparent !important;
            color: #fff !important;
          }
          .custom-menu .ant-menu-submenu-open > .ant-menu-submenu-title {
            background: transparent !important;
          }
          .custom-menu .ant-menu-submenu .ant-menu-item {
            margin: 4px 4px !important;
            padding-left: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: flex-start !important;
            text-align: left !important;
          }
          .custom-menu .ant-menu-submenu .ant-menu-item:hover {
            background: rgba(255, 255, 255, 0.08) !important;
            transform: translateX(0);
          }
          .custom-menu .ant-menu-submenu .ant-menu-item-selected:hover {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            transform: translateX(0);
            color: #fff !important;
          }
          .custom-menu .ant-menu-submenu .ant-menu-item-selected {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3) !important;
          }
          .custom-menu .ant-menu-item-icon,
          .custom-menu .ant-menu-submenu-title .ant-menu-item-icon {
            font-size: 18px !important;
            margin-right: 12px !important;
            float: left;
          }
          .custom-menu .ant-menu-submenu-title .ant-menu-submenu-arrow {
            right: 12px !important;
            inset-inline-end: 12px !important;
            margin-inline-start: 0 !important;
            margin-inline-end: 0 !important;
            transform: translateY(1px);
            position: absolute;
          }
          /* 折叠状态对齐与 hover 调整 */
          .custom-menu.ant-menu-inline-collapsed .ant-menu-item,
          .custom-menu.ant-menu-inline-collapsed .ant-menu-submenu-title {
            padding-inline-start: 0 !important;
            padding-inline-end: 0 !important;
            justify-content: center !important;
            transform: translateX(0) !important;
            text-align: center !important;
            margin:0px 3px !important;
          }
          .custom-menu.ant-menu-inline-collapsed .ant-menu-item:hover,
          .custom-menu.ant-menu-inline-collapsed .ant-menu-submenu-title:hover {
            background: rgba(255, 255, 255, 0.12) !important;
            transform: translateX(0) !important;
          }
          .custom-menu.ant-menu-inline-collapsed .ant-menu-item .ant-menu-item-icon,
          .custom-menu.ant-menu-inline-collapsed .ant-menu-submenu-title .ant-menu-item-icon {
            margin-right: 0 !important;
            float: none;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 20px !important;
          }
          .custom-menu.ant-menu-inline-collapsed .ant-menu-submenu-arrow {
            display: none !important;
          }
          .custom-menu.ant-menu-inline-collapsed .ant-menu-item span,
          .custom-menu.ant-menu-inline-collapsed .ant-menu-submenu-title span {
            display: none !important;
          }
          /* 折叠时弹出子菜单的背景和 hover */
          .ant-menu-submenu-popup {
            background: #1a1a2e !important;
          }
          .ant-menu-submenu-popup .ant-menu {
            background: #1a1a2e !important;
          }
          .ant-menu-submenu-popup .ant-menu-item:hover,
          .ant-menu-submenu-popup .ant-menu-submenu-title:hover {
            background: rgba(255, 255, 255, 0.12) !important;
          }
        `}</style>
      </Sider>
      
      <Layout style={{ marginLeft: sidebarCollapsed ? 80 : 240, transition: 'margin-left 0.2s' }}>
        <Header style={{ 
          padding: '0 24px', 
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => dispatch(toggleSidebar())}
              style={{
                fontSize: '30px',
                width: 48,
                height: 48,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s',
                color: '#667eea'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            />
            
            <div style={{ 
              height: 32, 
              width: 2, 
              background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 1,
              marginRight: 8
            }} />
            
            <Typography.Text style={{ 
              fontSize: 25, 
              fontWeight: 600, 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '0.5px'
            }}>
              仓库管理系统
            </Typography.Text>
          </div>
           
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* 系统时间显示 */}
            <div style={{ 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Typography.Text style={{ 
                fontWeight: 500,
                color: '#1a1a2e',
                fontSize: 18,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                {currentTime}
              </Typography.Text>
            </div>
            
            <Dropdown
              menu={{ 
                items: userMenuItems,
                onClick: handleUserMenuClick
              }}
              placement="bottomRight"
              arrow={{ pointAtCenter: true }}
            >
              <Space 
                style={{ 
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(102, 126, 234, 0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <Avatar 
                  style={{ 
                    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
                    border: '2px solid #fff'
                  }}
                  size="default"
                >
                  {user?.name?.charAt(0) || 'U'}
                </Avatar>
                <Typography.Text style={{ 
                  fontWeight: 500,
                  color: '#1a1a2e'
                }}>
                  {user?.name || '用户'}
                </Typography.Text>
              </Space>
            </Dropdown>
          </div>
        </Header>
        
        <Content
          style={{
            margin: '10px 10px',
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            transition: 'all 0.3s'
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
