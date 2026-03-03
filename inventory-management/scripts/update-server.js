#!/usr/bin/env node

const express = require('express')
const path = require('path')
const fs = require('fs')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 8080

// 配置
const UPDATES_DIR = path.join(__dirname, '../release/incremental')
const STATIC_DIR = path.join(__dirname, '../release') // electron-updater 需要的静态文件目录

// 中间件
app.use(cors()) // 允许跨域
app.use(express.json())

// 静态文件服务（用于 electron-updater 的 latest.yml 和安装包）
app.use('/updates', express.static(STATIC_DIR))

// API: 检查增量更新
app.get('/api/updates/:currentVersion', (req, res) => {
  const currentVersion = req.params.currentVersion

  console.log(`[${new Date().toISOString()}] 检查更新请求: 当前版本 ${currentVersion}`)

  try {
    if (!fs.existsSync(UPDATES_DIR)) {
      console.warn('更新目录不存在:', UPDATES_DIR)
      return res.json({
        success: false,
        message: '更新目录不存在'
      })
    }

    // 查找所有可用的更新清单文件
    const files = fs.readdirSync(UPDATES_DIR)
    const availableUpdates = []

    for (const file of files) {
      if (file.endsWith('-update.json')) {
        try {
          const updateInfo = JSON.parse(
            fs.readFileSync(path.join(UPDATES_DIR, file), 'utf-8')
          )

          // 检查是否适用于当前版本
          if (updateInfo.fromVersion === currentVersion) {
            availableUpdates.push(updateInfo)
          }
        } catch (error) {
          console.error(`读取更新文件失败: ${file}`, error)
        }
      }
    }

    if (availableUpdates.length > 0) {
      // 返回最新的更新（按时间戳排序）
      const latest = availableUpdates.sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0]

      console.log(`找到更新: ${latest.fromVersion} -> ${latest.toVersion}`)

      // 构建完整的下载URL
      const baseUrl = `${req.protocol}://${req.get('host')}`
      latest.package.downloadUrl = `${baseUrl}/api/download/${latest.package.name}`

      return res.json({
        success: true,
        update: latest
      })
    } else {
      console.log(`未找到适用于版本 ${currentVersion} 的更新`)
      return res.json({
        success: false,
        message: `未找到适用于版本 ${currentVersion} 的更新`
      })
    }
  } catch (error) {
    console.error('检查更新失败:', error)
    return res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    })
  }
})

// API: 下载更新包
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename
  const filePath = path.join(UPDATES_DIR, filename)

  console.log(`[${new Date().toISOString()}] 下载请求: ${filename}`)

  // 安全检查：防止路径遍历攻击
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({
      success: false,
      message: '无效的文件名'
    })
  }

  if (!fs.existsSync(filePath)) {
    console.error('文件不存在:', filePath)
    return res.status(404).json({
      success: false,
      message: '文件不存在'
    })
  }

  // 设置响应头
  const stats = fs.statSync(filePath)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Length', stats.size)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

  // 支持断点续传
  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1
    const chunksize = (end - start) + 1

    res.status(206) // Partial Content
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Length', chunksize)

    const stream = fs.createReadStream(filePath, { start, end })
    stream.pipe(res)
  } else {
    // 普通下载
    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  }

  console.log(`开始下载: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    updatesDir: UPDATES_DIR,
    updatesDirExists: fs.existsSync(UPDATES_DIR),
    staticDir: STATIC_DIR,
    staticDirExists: fs.existsSync(STATIC_DIR)
  })
})

// 获取更新列表
app.get('/api/updates', (req, res) => {
  try {
    if (!fs.existsSync(UPDATES_DIR)) {
      return res.json({
        success: false,
        message: '更新目录不存在'
      })
    }

    const files = fs.readdirSync(UPDATES_DIR)
    const updates = []

    for (const file of files) {
      if (file.endsWith('-update.json')) {
        try {
          const updateInfo = JSON.parse(
            fs.readFileSync(path.join(UPDATES_DIR, file), 'utf-8')
          )
          updates.push(updateInfo)
        } catch (error) {
          console.error(`读取更新文件失败: ${file}`, error)
        }
      }
    }

    // 按时间戳排序（最新的在前）
    updates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    res.json({
      success: true,
      updates: updates
    })
  } catch (error) {
    console.error('获取更新列表失败:', error)
    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    })
  }
})

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err)
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: err.message
  })
})

// 处理未找到的路由
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  })
})

// 启动服务器
app.listen(PORT, () => {
  console.log('='.repeat(60))
  console.log('🚀 增量更新服务器已启动')
  console.log(`   端口: ${PORT}`)
  console.log(`   更新目录: ${UPDATES_DIR}`)
  console.log(`   静态文件目录: ${STATIC_DIR}`)
  console.log('')
  console.log('📡 API 端点:')
  console.log(`   GET  /api/updates/:version     - 检查更新`)
  console.log(`   GET  /api/updates              - 获取所有更新`)
  console.log(`   GET  /api/download/:filename   - 下载更新包`)
  console.log(`   GET  /api/health              - 健康检查`)
  console.log(`   GET  /updates/*               - 静态文件（electron-updater）`)
  console.log('='.repeat(60))

  // 检查目录是否存在
  if (!fs.existsSync(UPDATES_DIR)) {
    console.warn(`⚠️  警告: 更新目录不存在，正在创建: ${UPDATES_DIR}`)
    fs.mkdirSync(UPDATES_DIR, { recursive: true })
  }
})