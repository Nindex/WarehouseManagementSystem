import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Table, Button, DatePicker, Select, Space, App } from 'antd'
import { BarChartOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store/hooks'
import { reportAPI, inventoryAPI, productAPI, customerAPI } from '@/services/api'
import { Typography } from 'antd'
import ReactECharts from 'echarts-for-react'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select

const Reports: React.FC = () => {
  const location = useLocation()
  const { products, total } = useAppSelector((state) => state.inventory)
  const app = App.useApp()
  const { message } = app

  // ECharts 图表就绪回调，用于确保图表正确初始化
  const onChartReady = (chart: any) => {
    if (chart && typeof chart.dispose === 'function') {
      // 图表已正确初始化
    }
  }

  const pathname = location.pathname.replace(/^#/, '')
  const isInventoryReport = pathname.includes('/inventory') || pathname === '/reports'
  const isOutboundReport = pathname.includes('/outbound')
  const [loading, setLoading] = useState(false)
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [outboundData, setOutboundData] = useState<any[]>([])
  const [outboundStats, setOutboundStats] = useState({
    totalQuantity: 0,
    totalRecords: 0,
    customerCount: 0,
    productCount: 0,
    totalInbound: 0,
    totalInboundCount: 0,
    netInbound: 0
  })
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalValue: 0,
    productCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0
  })
  const [inventoryCategoryCount, setInventoryCategoryCount] = useState(0)
  const [dateRange, setDateRange] = useState<[any, any] | null>(null)

  const outboundColumns = [
    { title: '商品', dataIndex: 'product_name', key: 'product_name', width: 160, align: 'center' as const },
    { title: 'SKU', dataIndex: 'product_sku', key: 'product_sku', width: 120, align: 'center' as const },
    { title: '分类', dataIndex: 'category_name', key: 'category_name', width: 80, align: 'center' as const, render: (text: string) => text || '未分类' },
    { title: '入库数量', dataIndex: 'inbound_quantity', key: 'inbound_quantity', width: 100, align: 'center' as const },
    { title: '出库数量', dataIndex: 'outbound_quantity', key: 'outbound_quantity', width: 100, align: 'center' as const },
    { title: '剩余数量', dataIndex: 'remaining_quantity', key: 'remaining_quantity', width: 100, align: 'center' as const },
  ]

  useEffect(() => {
    loadCategories()
    if (isOutboundReport) {
      loadCustomers()
    }
    loadReportData()
  }, [pathname, selectedCategory, selectedCustomer, dateRange])

  // 加载分类列表
  const loadCategories = async () => {
    try {
      const res = await productAPI.getCategories()
      if (res.success && res.data && Array.isArray(res.data)) {
        setCategories(res.data)
      } else {
        setCategories([])
      }
    } catch (error) {
      console.error('加载分类列表失败:', error)
      setCategories([])
    }
  }

  // 加载客户列表
  const loadCustomers = async () => {
    try {
      const res = await customerAPI.getCustomers(1, 1000, '')
      if (res.success && res.data && res.data.data) {
        setCustomers(res.data.data || [])
      } else {
        setCustomers([])
      }
    } catch (error) {
      console.error('加载客户列表失败:', error)
      setCustomers([])
    }
  }

  const loadReportData = async () => {
    setLoading(true)
    try {
      if (isInventoryReport) {
        // 加载库存报表数据，如果选择了分类则传递分类ID
        const categoryId = selectedCategory !== 'all' ? parseInt(selectedCategory) : undefined
        // 准备时间筛选参数（onChange 已自动设置默认时分秒）
        const startDate = dateRange && dateRange[0]
          ? dateRange[0].format('YYYY-MM-DD HH:mm:ss')
          : undefined
        const endDate = dateRange && dateRange[1]
          ? dateRange[1].format('YYYY-MM-DD HH:mm:ss')
          : undefined
        const res = await reportAPI.getInventoryReport(categoryId, startDate, endDate)
        if (res.success && res.data) {
          // 确保 data 是数组，并处理分类字段映射
          let data = Array.isArray(res.data) ? res.data : []
          // 将 category_name 映射到 category 字段，以便表格正确显示
          data = data.map((item: any) => ({
            ...item,
            category: item.category_name || item.category || '未分类',
            category_name: item.category_name || item.category || '未分类'
          }))
          setInventoryData(data)

          // 计算商品种类数（不重复的商品ID数量）- 这是真实的库存商品种类数
          const uniqueProductIds = new Set(
            data.map((item: any) => item.product_id).filter((id: any) => id != null)
          )
          const productCount = uniqueProductIds.size

          // 计算商品分类种类数（不重复的分类数量）
          const uniqueCategories = new Set(
            data.map((item: any) => item.category_name || item.category || '未分类')
          )
          setInventoryCategoryCount(uniqueCategories.size)

          // 更新商品种类数到stats
          setStats(prev => ({ ...prev, productCount }))
        } else {
          setInventoryData([])
          setInventoryCategoryCount(0)
          setStats(prev => ({ ...prev, productCount: 0 }))
        }
        // 加载统计数据
        const valueRes = await inventoryAPI.getInventoryValue()
        if (valueRes.success && valueRes.data) {
          // getInventoryValue 返回的是对象 { totalValue, totalItems, categoryBreakdown }
          const totalValue = valueRes.data.totalValue || 0
          setStats(prev => ({ ...prev, totalValue }))
          // 保存分类汇总数据用于图表
          setCategoryBreakdown(valueRes.data.categoryBreakdown || [])
        }

        // 加载库存预警
        const alertsRes = await inventoryAPI.getStockAlerts()
        if (alertsRes.success && alertsRes.data) {
          const lowStock = alertsRes.data.filter((a: any) => a.alert_type === 'low_stock').length
          const outOfStock = alertsRes.data.filter((a: any) => a.alert_type === 'out_of_stock').length
          setStats(prev => ({ ...prev, lowStockCount: lowStock, outOfStockCount: outOfStock }))
        }

      } else if (isOutboundReport) {
        // 准备时间筛选参数（onChange 已自动设置默认时分秒）
        const startDate = dateRange && dateRange[0]
          ? dateRange[0].format('YYYY-MM-DD HH:mm:ss')
          : undefined
        const endDate = dateRange && dateRange[1]
          ? dateRange[1].format('YYYY-MM-DD HH:mm:ss')
          : undefined

        const res = await reportAPI.getInboundOutboundReport(startDate, endDate)
        if (res.success && res.data) {
          const data = Array.isArray(res.data) ? res.data : []
          setOutboundData(data)
          const totalInbound = data.reduce((sum: number, item: any) => sum + (item.inbound_quantity || 0), 0)
          const totalOutbound = data.reduce((sum: number, item: any) => sum + (item.outbound_quantity || 0), 0)
          const totalInboundCount = data.reduce((sum: number, item: any) => sum + (item.inbound_count || 0), 0)
          const totalOutboundCount = data.reduce((sum: number, item: any) => sum + (item.outbound_count || 0), 0)
          const productCount = data.length
          setOutboundStats({
            totalQuantity: totalOutbound,
            totalRecords: totalOutboundCount,
            customerCount: 0,
            productCount,
            totalInbound,
            totalInboundCount,
            netInbound: totalInbound - totalOutbound
          })
        } else {
          setOutboundData([])
          setOutboundStats({
            totalQuantity: 0,
            totalRecords: 0,
            customerCount: 0,
            productCount: 0,
            totalInbound: 0,
            totalInboundCount: 0,
            netInbound: 0
          })
        }
      }
    } catch (error) {
      console.error('加载报表数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 导出Excel报表
  const handleExport = (type: string) => {
    try {
      let data: any[] = []
      let fileName = ''
      let sheetName = ''

      if (type === 'inventory') {
        // 库存报表数据
        data = inventoryData.map((item: any) => ({
          '产品名称': item.product_name || '-',
          '分类': item.category || item.category_name || '未分类',
          '当前库存': item.current_stock || 0,
          '总价值(元)': item.total_value || 0,
          '平均价格': item.avg_price || 0
        }))
        fileName = `库存分析报表_${new Date().toISOString().split('T')[0]}.xlsx`
        sheetName = '库存分析报表'

      } else {
        message.error('未知的报表类型')
        return
      }

      if (data.length === 0) {
        message.warning('没有数据可导出')
        return
      }

      // 创建工作簿和工作表
      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

      // 设置列宽
      const colWidths = Object.keys(data[0]).map(() => ({ wch: 15 }))
      worksheet['!cols'] = colWidths

      // 导出文件
      XLSX.writeFile(workbook, fileName)
      message.success('报表导出成功')
    } catch (error) {
      console.error('导出报表失败:', error)
      message.error('导出报表失败，请稍后重试')
    }
  }


  const columns = [
    {
      title: '产品名称',
      dataIndex: 'product_name',
      key: 'product_name',
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      render: (text: string, record: any) => {
        // 优先使用 category，如果没有则使用 category_name
        return text || record.category_name || '未分类'
      },
    },
    {
      title: '当前库存',
      dataIndex: 'current_stock',
      key: 'current_stock',
    },
    {
      title: '总价值(元)',
      dataIndex: 'total_value',
      key: 'total_value',
      render: (value: number) => `¥${value?.toLocaleString() || 0}`,
    },
    {
      title: '平均价格',
      dataIndex: 'avg_price',
      key: 'avg_price',
      render: (value: number) => `¥${value?.toLocaleString() || 0}`,
    }
  ]



  // 现代化科技感样式
  const techStyles = {
    container: {
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1419 100%)',
      minHeight: '100vh',
      padding: '24px',
      position: 'relative' as const,
      overflow: 'hidden'
    },
    gridPattern: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `
        linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px)
      `,
      backgroundSize: '50px 50px',
      pointerEvents: 'none' as const,
      zIndex: 0
    },
    glassCard: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(10px)',
      borderRadius: '16px',
      border: '1px solid rgba(0, 255, 255, 0.2)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(0, 255, 255, 0.1)',
      transition: 'all 0.3s ease',
      position: 'relative' as const,
      overflow: 'hidden' as const
    },
    statCard: {
      background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1) 0%, rgba(138, 43, 226, 0.1) 100%)',
      backdropFilter: 'blur(10px)',
      borderRadius: '16px',
      border: '1px solid rgba(0, 255, 255, 0.3)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(0, 255, 255, 0.1)',
      padding: '24px',
      position: 'relative' as const,
      overflow: 'hidden' as const,
      transition: 'all 0.3s ease'
    },
    statCardHover: {
      transform: 'translateY(-4px)',
      boxShadow: '0 12px 40px rgba(0, 255, 255, 0.3), inset 0 0 30px rgba(0, 255, 255, 0.2)'
    },
    title: {
      background: 'linear-gradient(90deg, #00ffff 0%, #8a2be2 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      fontSize: '28px',
      fontWeight: 'bold',
      margin: 0,
    },
    glowEffect: {
      position: 'absolute' as const,
      top: '-50%',
      right: '-50%',
      width: '200%',
      height: '200%',
      background: 'radial-gradient(circle, rgba(0, 255, 255, 0.1) 0%, transparent 70%)',
      animation: 'pulse 3s ease-in-out infinite'
    }
  }

  return (
    <div style={techStyles.container}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tech-card {
          animation: slideIn 0.6s ease-out;
        }
        .tech-date-picker .ant-picker-input input::placeholder {
          color: #00ffff !important;
          font-size: 14px !important;
          opacity: 0.9 !important;
        }
        .tech-date-picker .ant-picker-input input::-webkit-input-placeholder {
          color: #00ffff !important;
          font-size: 14px !important;
          opacity: 1 !important;
        }
        .tech-date-picker .ant-picker-input input::-moz-placeholder {
          color: #00ffff !important;
          font-size: 14px !important;
          opacity: 0.9 !important;
        }
        .tech-date-picker .ant-picker-input input:-ms-input-placeholder {
          color: #00ffff !important;
          font-size: 14px !important;
          opacity: 0.9 !important;
        }
        /* 选择日期后实际文字的样式 */
        .tech-date-picker .ant-picker-input input {
          color: #00ffff !important;
          border: none !important;
          border-bottom: none !important;
          background: transparent !important;
          outline: none !important;
          box-shadow: none !important;
          caret-color: transparent !important;
          cursor: default !important;
          font-size: 14px !important;
          font-weight: 500 !important;
        }
        /* 移除focus状态的样式 */
        .tech-date-picker .ant-picker-input input:focus {
          border: none !important;
          border-bottom: none !important;
          outline: none !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        /* 分隔符样式 */
        .tech-date-picker .ant-picker-separator {
          color: #00ffff !important;
        }
        /* 移除整个输入框容器的边框和背景 */
        .tech-date-picker .ant-picker-input {
          border: none !important;
          background: transparent !important;
        }
        /* 科技风格表格样式 */
        .tech-table .ant-table {
          background: rgba(0, 0, 0, 0.2) !important;
          border-radius: 8px;
        }
        .tech-table .ant-table-thead > tr > th {
          background: transparent !important;
          border-bottom: 1px solid rgba(0, 255, 255, 0.3) !important;
          color: #00ffff !important;
          font-weight: bold !important;
          font-size: 18px !important;
        }
        .tech-table .ant-table-tbody > tr > td {
          background: transparent !important;
          border-bottom: 1px solid rgba(0, 255, 255, 0.1) !important;
          color: #00ffff !important;
          font-size: 15px !important;
        }
        .tech-table .ant-table-tbody > tr:hover > td {
          background: transparent !important;
        }
        .tech-table .ant-table-tbody > tr.ant-table-row-selected > td {
          background: transparent !important;
        }
        .tech-table .ant-table-tbody > tr.ant-table-row-selected:hover > td {
          background: transparent !important;
        }
        .tech-table .ant-table-container {
          border: 1px solid rgba(0, 255, 255, 0.2) !important;
          border-radius: 8px;
        }
        .tech-table .ant-table-placeholder {
          background: transparent !important;
          color: #00ffff !important;
        }
        .tech-table .ant-empty-description {
          color: #00ffff !important;
        }
        .tech-table .ant-spin-container {
          background: transparent !important;
        }
        /* 科技风格选择框样式 */
        .tech-select .ant-select-selector {
          background: transparent !important;
          border: 1px solid rgba(0, 255, 255, 0.3) !important;
          border-radius: 8px !important;
        }
        .tech-select .ant-select-selector:hover {
          border-color: rgba(0, 255, 255, 0.5) !important;
          box-shadow: 0 0 10px rgba(0, 255, 255, 0.3) !important;
        }
        .tech-select.ant-select-focused .ant-select-selector {
          border-color: rgba(0, 255, 255, 0.6) !important;
          box-shadow: 0 0 15px rgba(0, 255, 255, 0.5) !important;
        }
        .tech-select .ant-select-selection-item {
          color: #00ffff !important;
          font-size: 14px !important;
          background: transparent !important;
        }
        .tech-select .ant-select-selection-placeholder {
          color: #00ffff !important;
          opacity: 0.9 !important;
          font-size: 14px !important;
        }
        .tech-select .ant-select-arrow {
          color: #00ffff !important;
        }
        /* 下拉菜单样式 */
        .tech-select .ant-select-dropdown {
          background: rgba(0, 0, 0, 0.9) !important;
          border: 1px solid rgba(0, 255, 255, 0.3) !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 255, 0.2) !important;
        }
        .tech-select .ant-select-item {
          color: #00ffff !important;
          background: transparent !important;
          font-size: 14px !important;
        }
        .tech-select .ant-select-item:hover {
          background: transparent !important;
        }
        .tech-select .ant-select-item-option-selected {
          background: transparent !important;
          color: #00ffff !important;
          font-weight: bold !important;
        }
        .tech-select .ant-select-item-option-active {
          background: transparent !important;
        }
        /* 移除所有文字的底色 */
        .reports-container * {
          -webkit-text-fill-color: inherit !important;
        }
        .reports-container .ant-statistic-title,
        .reports-container .ant-statistic-content {
          background: transparent !important;
        }
        .reports-container .ant-statistic-title span,
        .reports-container .ant-statistic-content span {
          background: transparent !important;
        }
        .reports-container h2,
        .reports-container h2 span {
          background: transparent !important;
        }
        .reports-container .ant-card-head-title {
          background: transparent !important;
        }
        .reports-container .ant-card-head-title span {
          background: transparent !important;
        }
      `}</style>
      <div style={techStyles.gridPattern} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <Card
              style={techStyles.glassCard}
              className="tech-card"
            >
              <Row justify="space-between" align="middle">
                <Col>
                  <h2 style={techStyles.title}>
                    <BarChartOutlined style={{ marginRight: 12, color: '#00ffff' }} />
                    {isInventoryReport || pathname === '/reports' ? '库存报表' :
                      isOutboundReport ? '出入库报表' :
                        '数据报表中心'}
                  </h2>
                </Col>
                <Col>
                  <Space>
                    <RangePicker
                      showTime={{
                        format: 'HH:mm:ss',
                        defaultValue: [
                          dayjs('00:00:00', 'HH:mm:ss'),  // 开始日期默认时分秒
                          dayjs('23:59:59', 'HH:mm:ss')   // 结束日期默认时分秒
                        ]
                      }}
                      format="YYYY-MM-DD HH:mm:ss"
                      className="tech-date-picker"
                      placeholder={['开始日期', '结束日期']}
                      value={dateRange}
                      onChange={(dates) => {
                        if (dates && dates[0] && dates[1]) {
                          let start = dates[0]
                          let end = dates[1]

                          // 如果用户只选择了日期（时分秒为0或当前时间），设置默认时分秒
                          // 检查开始日期：如果时分秒为0，说明用户只选择了日期，设置默认值
                          if (start.hour() === 0 && start.minute() === 0 && start.second() === 0) {
                            start = start.startOf('day')  // 设置为 00:00:00
                          }

                          // 检查结束日期：如果时分秒为0，说明用户只选择了日期，设置默认值
                          // 注意：如果用户手动选择了 00:00:00，也会被设置为 00:00:00，这是合理的
                          if (end.hour() === 0 && end.minute() === 0 && end.second() === 0) {
                            end = end.endOf('day')  // 设置为 23:59:59
                          }

                          setDateRange([start, end])
                        } else {
                          setDateRange(null)
                        }
                      }}
                      style={{
                        background: 'rgba(0, 255, 255, 0.1)',
                        border: '1px solid rgba(0, 255, 255, 0.3)',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        width: '400px',
                        height: '32px',
                      }}
                    />
                    <Select
                      className="tech-select"
                      value={selectedCategory}
                      onChange={setSelectedCategory}
                      style={{
                        width: 150
                      }}
                      placeholder="选择分类"
                    >
                      <Option value="all">全部分类</Option>
                      {categories.map((cat) => (
                        <Option key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </Option>
                      ))}
                    </Select>
                    <Button
                      icon={<FilterOutlined />}
                      onClick={loadReportData}
                      style={{
                        background: 'linear-gradient(135deg, #00ffff 0%, #8a2be2 100%)',
                        border: 'none',
                      }}
                    >
                      筛选
                    </Button>
                    {(isInventoryReport || pathname === '/reports') && (
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={() => handleExport('inventory')}
                        style={{
                          background: 'linear-gradient(135deg, #00ffff 0%, #8a2be2 100%)',
                          border: 'none',
                        }}
                      >
                        导出
                      </Button>
                    )}

                    {isOutboundReport && (
                      <Button
                        icon={<DownloadOutlined />}
                        onClick={() => {
                          const data = outboundData.map((item: any) => ({
                            '商品名称': item.product_name || '-',
                            'SKU': item.product_sku || '-',
                            '分类': item.category_name || '未分类',
                            '入库数量': item.inbound_quantity || 0,
                            '出库数量': item.outbound_quantity || 0,
                            '剩余数量': item.remaining_quantity || 0,
                          }))
                          const worksheet = XLSX.utils.json_to_sheet(data)
                          const workbook = XLSX.utils.book_new()
                          XLSX.utils.book_append_sheet(workbook, worksheet, '出入库报表')
                          XLSX.writeFile(workbook, `出入库报表_${new Date().toISOString().split('T')[0]}.xlsx`)
                          message.success('报表导出成功')
                        }}
                        style={{
                          background: 'linear-gradient(135deg, #00ffff 0%, #8a2be2 100%)',
                          border: 'none',
                        }}
                      >
                        导出
                      </Button>
                    )}
                  </Space>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        {isInventoryReport && (
          <Row gutter={[15, 15]}>
            <Col span={6}>
              <div style={techStyles.statCard} className="tech-card">
                <div style={techStyles.glowEffect} />
                <Statistic
                  title={<span style={{ color: '#00ffff', fontSize: '14px' }}>总库存价值</span>}
                  value={stats.totalValue}
                  precision={2}
                  prefix={<span style={{ color: '#00ffff' }}>¥</span>}
                  valueStyle={{
                    color: '#00ffff',
                    fontSize: '28px',
                    fontWeight: 'bold',
                  }}
                  loading={loading}
                />
              </div>
            </Col>
            <Col span={6}>
              <div style={{
                ...techStyles.statCard,
                background: 'linear-gradient(135deg, rgba(0, 123, 255, 0.1) 0%, rgba(0, 255, 255, 0.1) 100%)',
                border: '1px solid rgba(0, 123, 255, 0.3)'
              }} className="tech-card">
                <div style={techStyles.glowEffect} />
                <Statistic
                  title={<span style={{ color: '#007bff', fontSize: '14px' }}>库存品种数</span>}
                  value={stats.productCount}
                  valueStyle={{
                    color: '#007bff',
                    fontSize: '28px',
                    fontWeight: 'bold',
                  }}
                  loading={loading}
                />
              </div>
            </Col>
            <Col span={6}>
              <div style={{
                ...techStyles.statCard,
                background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%)',
                border: '1px solid rgba(255, 193, 7, 0.3)'
              }} className="tech-card">
                <div style={techStyles.glowEffect} />
                <Statistic
                  title={<span style={{ color: '#ffc107', fontSize: '14px' }}>低库存预警</span>}
                  value={stats.lowStockCount}
                  valueStyle={{
                    color: '#ffc107',
                    fontSize: '28px',
                    fontWeight: 'bold',
                  }}
                  loading={loading}
                />
              </div>
            </Col>
            <Col span={6}>
              <div style={{
                ...techStyles.statCard,
                background: 'linear-gradient(135deg, rgba(255, 82, 82, 0.1) 0%, rgba(255, 0, 0, 0.1) 100%)',
                border: '1px solid rgba(255, 82, 82, 0.3)'
              }} className="tech-card">
                <div style={techStyles.glowEffect} />
                <Statistic
                  title={<span style={{ color: '#ff5252', fontSize: '14px' }}>缺货商品</span>}
                  value={stats.outOfStockCount}
                  valueStyle={{
                    color: '#ff5252',
                    fontSize: '28px',
                    fontWeight: 'bold',
                  }}
                  loading={loading}
                />
              </div>
            </Col>
          </Row>
        )}

        {(isInventoryReport || pathname === '/reports') && (
          <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card
                title={<span style={{ color: '#00ffff', fontSize: '18px', fontWeight: 'bold' }}>库存分析报表</span>}
                style={techStyles.glassCard}
                styles={{ body: { background: 'transparent' } }}
                className="tech-card"
              >
                <Table
                  className="tech-table"
                  columns={columns}
                  dataSource={Array.isArray(inventoryData) ? inventoryData : []}
                  loading={loading}
                  pagination={false}
                  size="small"
                  rowKey={(record) => record.id?.toString() || record.product_id?.toString() || ''}
                />
              </Card>
            </Col>
          </Row>
        )}

        {isOutboundReport && (
          <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card
                title={<span style={{ color: '#00ffff', fontSize: '18px', fontWeight: 'bold'}}>出入库报表</span>}
                style={techStyles.glassCard}
              >
                <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
                  <Col span={6}>
                    <div style={techStyles.statCard} className="tech-card">
                      <Statistic
                        title={<span style={{ color: '#00ffff' }}>总入库数量</span>}
                        value={outboundStats.totalInbound}
                        valueStyle={{ color: '#00ffff', fontSize: '24px', fontWeight: 'bold' }}
                      />
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={techStyles.statCard} className="tech-card">
                      <Statistic
                        title={<span style={{ color: '#00ffff' }}>总出库数量</span>}
                        value={outboundStats.totalQuantity}
                        valueStyle={{ color: '#00ffff', fontSize: '24px', fontWeight: 'bold' }}
                      />
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={techStyles.statCard} className="tech-card">
                      <Statistic
                        title={<span style={{ color: '#00ffff' }}>剩余总量</span>}
                        value={outboundStats.netInbound}
                        valueStyle={{ color: '#00ffff', fontSize: '24px', fontWeight: 'bold' }}
                      />
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={techStyles.statCard} className="tech-card">
                      <Statistic
                        title={<span style={{ color: '#00ffff' }}>商品种类</span>}
                        value={outboundStats.productCount}
                        valueStyle={{ color: '#00ffff', fontSize: '24px', fontWeight: 'bold' }}
                      />
                    </div>
                  </Col>
                </Row>
                <Table
                  className="tech-table"
                  columns={outboundColumns}
                  dataSource={outboundData}
                  loading={loading}
                  rowKey={(record) => record.product_id?.toString() || Math.random().toString()}
                  pagination={{
                    pageSize: 20,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                    style: { color: '#00ffff' }
                  }}
                  scroll={{ x: 900 }}
                />
              </Card>
            </Col>
          </Row>
        )}

        {(isInventoryReport || pathname === '/reports') && (
          <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
            <Col span={12}>
              <Card
                title={<span style={{ color: '#00ffff', fontSize: '18px', fontWeight: 'bold' }}>分类库存价值分布</span>}
                style={techStyles.glassCard}
                styles={{ body: { background: 'transparent' } }}
                className="tech-card"
              >
                <ReactECharts
                  key="category-value-pie"
                  option={{
                    backgroundColor: 'transparent',
                    textStyle: {
                      color: '#00ffff'
                    },
                    tooltip: {
                      trigger: 'item',
                      formatter: '{a} <br/>{b}: ¥{c} ({d}%)',
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      borderColor: '#00ffff',
                      borderWidth: 1,
                      textStyle: { color: '#00ffff' }
                    },
                    legend: {
                      show: false
                    },
                    series: [
                      {
                        name: '库存价值',
                        type: 'pie',
                        radius: ['30%', '50%'],
                        center: ['50%', '50%'],
                        avoidLabelOverlap: true,
                        minAngle: 5,
                        itemStyle: {
                          borderRadius: 5,
                          borderColor: 'rgba(0, 0, 0, 0.5)',
                          shadowBlur: 0.5,
                          shadowColor: 'rgba(0, 255, 255, 0.5)'
                        },
                        label: {
                          show: true,
                          position: 'outside',
                          formatter: (params: any) => {
                            return `{txt|${params.name}}\n{txt|¥${params.value?.toLocaleString() || 0}}`
                          },
                          rich: {
                            txt: {
                              fontSize: 12,
                              color: '#00ffff',
                              lineHeight: 20,
                              height: 20,
                              padding: [0, 0, 0, 0]
                            }
                          },
                          distanceToLabelLine: 5
                        },
                        labelLine: {
                          show: true,
                          length: 60,
                          length2: 50,
                          lineStyle: {
                            color: '#00ffff',
                            width: 1,
                            type: 'solid'
                          },
                          smooth: 0.2
                        },
                        emphasis: {
                          itemStyle: {
                            shadowBlur: 30,
                            shadowColor: 'rgba(0, 255, 255, 0.8)'
                          }
                        },
                        data: categoryBreakdown.map((item: any, index: number) => {
                          const colors = [
                            ['#00ffff', '#0080ff'],
                            ['#8a2be2', '#4b0082'],
                            ['#ff00ff', '#800080'],
                            ['#00ff80', '#00cc66'],
                            ['#ff8000', '#ff4000'],
                            ['#ffff00', '#ffcc00']
                          ]
                          const colorIndex = index % colors.length
                          return {
                            value: item.total_value || 0,
                            name: item.category_name || '未分类',
                            itemStyle: {
                              color: {
                                type: 'linear',
                                x: 0,
                                y: 0,
                                x2: 1,
                                y2: 1,
                                colorStops: [
                                  { offset: 0, color: colors[colorIndex][0] },
                                  { offset: 1, color: colors[colorIndex][1] }
                                ]
                              }
                            }
                          }
                        }),
                        animationType: 'scale',
                        animationEasing: 'elasticOut',
                        animationDelay: (idx: number) => idx * 100
                      }
                    ]
                  }}
                  style={{ height: '450px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card
                title={<span style={{ color: '#00ffff', fontSize: '18px', fontWeight: 'bold' }}>分类库存数量分布</span>}
                style={techStyles.glassCard}
                styles={{ body: { background: 'transparent' } }}
                className="tech-card"
              >
                <ReactECharts
                  key="category-quantity-bar"
                  option={{
                    backgroundColor: 'transparent',
                    textStyle: {
                      color: '#00ffff'
                    },
                    tooltip: {
                      trigger: 'axis',
                      axisPointer: {
                        type: 'shadow',
                        shadowStyle: {
                          color: 'rgba(0, 255, 255, 0.3)'
                        }
                      },
                      formatter: (params: any) => {
                        const param = params[0]
                        return `${param.name}<br/>${param.seriesName}: ${param.value}`
                      },
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      borderColor: '#00ffff',
                      borderWidth: 1,
                      textStyle: { color: '#00ffff' }
                    },
                    grid: {
                      left: '3%',
                      right: '4%',
                      bottom: '3%',
                      containLabel: true
                    },
                    xAxis: {
                      type: 'category',
                      data: categoryBreakdown.map((item: any) => item.category_name || '未分类'),
                      axisLabel: {
                        rotate: 45,
                        interval: 0,
                        color: '#00ffff'
                      },
                      axisLine: {
                        lineStyle: { color: '#00ffff' }
                      }
                    },
                    yAxis: {
                      type: 'value',
                      name: '数量',
                      nameTextStyle: { color: '#00ffff' },
                      axisLabel: { color: '#00ffff' },
                      axisLine: {
                        lineStyle: { color: '#00ffff' }
                      },
                      splitLine: {
                        lineStyle: { color: 'rgba(0, 255, 255, 0.1)' }
                      }
                    },
                    series: [
                      {
                        name: '库存数量',
                        type: 'bar',
                        data: categoryBreakdown.map((item: any) => item.total_quantity || 0),
                        itemStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                              { offset: 0, color: '#00ffff' },
                              { offset: 0.5, color: '#0080ff' },
                              { offset: 1, color: '#8a2be2' }
                            ]
                          },
                          borderRadius: [8, 8, 0, 0],
                          shadowBlur: 10,
                          shadowColor: 'rgba(0, 255, 255, 0.5)'
                        },
                        emphasis: {
                          itemStyle: {
                            shadowBlur: 20,
                            shadowColor: 'rgba(0, 255, 255, 0.8)'
                          }
                        },
                        animationDelay: (idx: number) => idx * 100
                      }
                    ]
                  }}
                  style={{ height: '450px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </Card>
            </Col>
            <Col span={24}>
              <Card
                title={<span style={{ color: '#00ffff', fontSize: '18px', fontWeight: 'bold' }}>库存价值TOP10商品</span>}
                style={techStyles.glassCard}
                styles={{ body: { background: 'transparent' } }}
                className="tech-card"
              >
                <ReactECharts
                  key="top10-products-bar"
                  option={{
                    backgroundColor: 'transparent',
                    textStyle: {
                      color: '#00ffff'
                    },
                    tooltip: {
                      trigger: 'axis',
                      axisPointer: {
                        type: 'shadow',
                        shadowStyle: {
                          color: 'rgba(0, 255, 255, 0.3)'
                        }
                      },
                      formatter: (params: any) => {
                        const param = params[0]
                        return `${param.name}<br/>${param.seriesName}: ¥${param.value?.toLocaleString()}`
                      },
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      borderColor: '#00ffff',
                      borderWidth: 1,
                      textStyle: { color: '#00ffff' }
                    },
                    grid: {
                      left: '15%',
                      right: '8%',
                      bottom: '5%',
                      top: '10%',
                      containLabel: true
                    },
                    xAxis: {
                      type: 'value',
                      name: '价值(元)',
                      nameTextStyle: { color: '#00ffff' },
                      axisLabel: {
                        color: '#00ffff',
                        formatter: (value: number) => {
                          if (value >= 10000) {
                            return (value / 10000).toFixed(1) + '万'
                          }
                          return value.toLocaleString()
                        }
                      },
                      axisLine: {
                        lineStyle: { color: '#00ffff' }
                      },
                      splitLine: {
                        lineStyle: { color: 'rgba(0, 255, 255, 0.1)' }
                      }
                    },
                    yAxis: {
                      type: 'category',
                      data: inventoryData
                        .sort((a, b) => (b.total_value || 0) - (a.total_value || 0))
                        .slice(0, 10)
                        .map((item: any) => item.product_name || '未知商品'),
                      axisLabel: {
                        interval: 0,
                        color: '#00ffff',
                        fontSize: 12
                      },
                      axisLine: {
                        lineStyle: { color: '#00ffff' }
                      }
                    },
                    series: [
                      {
                        name: '库存价值',
                        type: 'bar',
                        data: inventoryData
                          .sort((a, b) => (b.total_value || 0) - (a.total_value || 0))
                          .slice(0, 10)
                          .map((item: any) => item.total_value || 0),
                        itemStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 1,
                            y2: 0,
                            colorStops: [
                              { offset: 0, color: '#00ffff' },
                              { offset: 0.5, color: '#0080ff' },
                              { offset: 1, color: '#8a2be2' }
                            ]
                          },
                          borderRadius: [0, 8, 8, 0],
                          shadowBlur: 15,
                          shadowColor: 'rgba(0, 255, 255, 0.6)'
                        },
                        emphasis: {
                          itemStyle: {
                            shadowBlur: 25,
                            shadowColor: 'rgba(0, 255, 255, 0.9)'
                          }
                        },
                        label: {
                          show: true,
                          position: 'right',
                          color: '#00ffff',
                          formatter: (params: any) => {
                            const value = params.value
                            if (value >= 10000) {
                              return (value / 10000).toFixed(1) + '万'
                            }
                            return value.toLocaleString()
                          }
                        },
                        animationDelay: (idx: number) => idx * 100
                      }
                    ]
                  }}
                  style={{ height: '500px' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </Card>
            </Col>
          </Row>
        )}



      </div>
    </div>
  )
}

export default Reports