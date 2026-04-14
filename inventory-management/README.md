# 仓库管理系统

## 项目简介

仓库管理系统是一个基于 Electron 的本地化仓库管理解决方案，提供完整的库存管理、客户管理和报表统计功能。系统采用 SQLite 数据库存储数据，无需额外配置数据库服务器，开箱即用。

**版本**: 1.3.4  
**许可证**: MIT  
**开发者**: 小杨

## 功能特性

### 📊 仪表盘
- 数据概览和 KPI 统计
- 库存预警提醒
- 实时操作日志
- 待办事项通知

### 📦 仓库管理
- **商品列表**: 商品信息管理、分类管理、SKU 管理
- **商品入库**: 支持批次管理、SN 码追踪
- **商品出库**: 支持 FIFO 先进先出、客户门店关联
- **库存盘点**: 库存调整、盘点记录
- **批次管理**: 批次号追踪、批次库存查询

### 👥 客户管理
- **客户信息**: 客户基本信息管理
- **门店管理**: 客户门店信息维护，支持多门店管理

### 📈 报表统计
- **库存报表**: 库存明细、库存预警报表
- **出入库报表**: 出入库流水、批次追踪报表
- **SN 码溯源**: 支持按 SN 码查询出入库记录

### ⚙️ 系统设置
- **用户管理**: 用户账号管理
- **数据备份恢复**: 数据库备份、数据恢复功能
- **系统配置**: 系统参数配置
- **个人资料**: 用户个人信息管理

## 技术栈

### 前端技术
- **框架**: React 18 + TypeScript
- **UI 组件库**: Ant Design 5
- **状态管理**: Redux Toolkit
- **路由**: React Router v6
- **图表库**: ECharts 5 + echarts-for-react

### 桌面应用
- **框架**: Electron 28
- **构建工具**: Vite 5
- **打包工具**: Electron Builder

### 数据库
- **数据库**: Better-SQLite3 (SQLite)
- **数据库位置**: 
  - 开发环境: `data/inventory.db`
  - 生产环境: `安装目录/data/inventory.db`

### 其他工具
- **PDF 导出**: jsPDF + jspdf-autotable
- **Excel 导出**: XLSX
- **密码加密**: bcryptjs

## 系统要求

### 运行环境
- **操作系统**: Windows 10/11 (x64)
- **内存**: 建议 4GB 以上
- **磁盘空间**: 至少 500MB 可用空间

### 开发环境
- **Node.js**: 建议 18.x 或更高版本
- **npm**: 建议 9.x 或更高版本

## 安装和运行

### 开发环境

#### 1. 克隆项目

```bash
git clone <repository-url>
cd inventory-management
```

#### 2. 安装依赖

```bash
npm install
```

**注意**: 如果 `better-sqlite3` 安装失败，可以尝试以下命令：

```bash
# 方式 1: 使用预编译版本
npm run install:sqlite:prebuilt

# 方式 2: 手动安装 better-sqlite3
npm run install:better-sqlite3

# 方式 3: 安全安装（跳过构建）
npm run install:safe
```

#### 3. 数据库初始化

数据库会在首次启动时自动初始化。系统会自动执行以下操作：
- 创建数据库文件（如果不存在）
- 执行 `database/schema.sql` 创建表结构
- 执行 `database/seed.sql` 插入种子数据

默认管理员账号：
- **用户名**: `admin`
- **密码**: `admin123`

> ⚠️ **安全提示**: 首次登录后请立即修改默认密码。

#### 4. 启动开发服务器

```bash
# 启动开发模式（自动打开 Electron 窗口）
npm run dev

# 或者仅启动 Electron（需要先手动启动 Vite 开发服务器）
npm start
```

### 生产环境

#### 构建安装包

```bash
# 构建 NSIS 安装程序（推荐）
npm run build:installer

# 构建便携版（无需安装）
npm run build:portable

# 构建所有格式
npm run build:all
```

构建输出位置：
- **安装程序**: `release/仓库管理系统 Setup x.x.x.exe`
- **便携版**: `release/win-unpacked/仓库管理系统.exe`

## 项目结构

```
inventory-management/
├── src/                          # 源代码目录
│   ├── components/               # React 组件
│   │   ├── Layout/              # 布局组件
│   │   └── ErrorBoundary.tsx    # 错误边界
│   ├── database/                 # 数据库相关
│   │   ├── DatabaseService.ts   # 数据库服务
│   │   ├── init.ts              # 数据库初始化
│   │   ├── schema.sql           # 数据库架构
│   │   └── migrations/          # 数据库迁移脚本
│   ├── pages/                    # 页面组件
│   │   ├── Dashboard/           # 仪表盘
│   │   ├── Inventory/           # 仓库管理
│   │   ├── Customers/           # 客户管理
│   │   ├── Stores/              # 门店管理
│   │   ├── Reports/             # 报表统计
│   │   ├── Settings/            # 系统设置
│   │   ├── Login/               # 登录页
│   │   └── Register/            # 注册页
│   ├── services/                 # 服务层
│   │   ├── api.ts               # API 接口
│   │   └── database/            # 数据库服务
│   ├── store/                    # Redux 状态管理
│   ├── types/                    # TypeScript 类型定义
│   ├── utils/                    # 工具函数
│   ├── App.tsx                   # 应用根组件
│   └── main.tsx                  # 应用入口
├── electron/                     # Electron 主进程
│   ├── main.ts                   # 主进程入口
│   ├── preload.ts                # 预加载脚本
│   └── database/                 # 数据库相关
├── database/                      # 数据库脚本
│   ├── schema.sql                # 数据库架构
│   └── migrations/               # 数据库迁移脚本
├── scripts/                       # 构建和工具脚本
├── dist/                         # 构建输出目录（前端）
├── release/                      # 打包输出目录
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
└── vite.config.ts                # Vite 配置
```

## 数据库说明

### 主要数据表

| 表名 | 说明 |
|------|------|
| `users` | 用户表，存储系统用户信息 |
| `categories` | 产品分类表 |
| `products` | 产品表，存储商品基本信息 |
| `inventory` | 库存表，存储商品库存信息 |
| `inventory_batches` | 批次库存表，支持批次管理 |
| `inventory_transactions` | 库存变动记录表 |
| `sn_code_status` | SN码状态表 |
| `repair_records` | 维修记录表 |
| `customers` | 客户表 |
| `customer_stores` | 客户门店表 |
| `outbound_records` | 出库记录表 |
| `outbound_sn_items` | 出库 SN 明细表 |
| `sn_status` | SN 码状态表 |
| `system_settings` | 系统设置表 |
| `system_logs` | 系统操作日志表 |

### 数据库特性

- **自动初始化**: 首次启动时自动创建数据库和表结构
- **自动迁移**: 支持数据库结构迁移（通过 `migrations` 目录）
- **索引优化**: 包含单列索引和组合索引，优化查询性能
- **外键约束**: 保证数据完整性
- **事务支持**: 关键操作使用事务保证数据一致性

### 备份和恢复

系统提供数据备份和恢复功能：
- **备份位置**: `安装目录/data/backups/` 目录
- **备份格式**: SQLite 数据库文件（`.db`）
- **自动备份**: 每天首次启动时自动备份
- **手动备份**: 通过系统设置页面进行手动备份

## 开发指南

### 开发模式特性

- 前端代码热重载（HMR）
- Electron 主进程自动重启
- 开发工具自动打开
- 详细的错误提示

### 数据库迁移机制

系统支持数据库结构迁移：

1. **迁移文件位置**: `database/migrations/` 或 `src/database/migrations/`
2. **迁移执行**: 应用启动时自动检测并执行未执行的迁移

示例迁移文件：
```sql
-- migrations/add_composite_indexes.sql
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_composite 
ON inventory_transactions(product_id, type, created_at DESC);
```

### 添加新功能

1. **创建页面组件**: 在 `src/pages/` 下创建新页面
2. **添加路由**: 在 `src/App.tsx` 中添加路由配置
3. **添加菜单**: 在 `src/components/Layout/MainLayout.tsx` 中添加菜单项
4. **创建服务**: 在 `src/services/database/` 下创建数据库服务
5. **添加类型**: 在 `src/types/index.ts` 中添加 TypeScript 类型定义

## 常见问题

### 数据库相关问题

#### Q: 数据库初始化失败
**A**: 检查以下事项：
- 确保应用有写入权限
- 检查磁盘空间是否充足
- 查看控制台错误信息

#### Q: 数据库文件在哪里？
**A**: 
- 开发环境: 项目根目录下的 `data/inventory.db`
- 生产环境: `安装目录/data/inventory.db`

#### Q: 如何重置数据库？
**A**: 删除数据库文件后重启应用，系统会自动重新初始化。

### 依赖安装问题

#### Q: `better-sqlite3` 安装失败
**A**: 尝试以下解决方案：

```bash
# 1. 使用预编译版本
npm run install:sqlite:prebuilt

# 2. 手动重建
npm run rebuild:sqlite
```

#### Q: Electron 下载失败
**A**: 项目已配置使用国内镜像源（npmmirror.com），如果仍然失败：
- 检查网络连接
- 清除 Electron 缓存: 删除 `${CACHE}/electron/` 目录

### 运行时问题

#### Q: 应用启动后白屏
**A**: 
- 打开开发者工具查看错误信息（F12 或 Ctrl+Shift+I）
- 检查控制台日志
- 确认前端资源是否正确加载

#### Q: 登录后无法访问页面
**A**: 
- 检查 Redux 状态是否正确
- 查看控制台错误
- 确认路由配置是否正确

## 更新日志

### v1.3.4
- 添加入库/出库/盘点页面统一筛选功能
  - 支持按商品名称/SKU筛选
  - 支持按分类筛选
  - 支持按库存状态筛选（正常/库存不足/无库存/库存过多）
  - 支持按商品状态筛选（启用/停用）
- 添加维修记录功能
  - SN码支持维修记录管理
  - 记录维修时间、部件、配件费、维修费、其他费用、质保信息
  - 支持添加多个维修部件，自动计算小计和总计金额
  - 新增数据库表: `repair_records`、`repair_parts`
- 批次管理优化
  - 存放位置支持点击直接修改
  - 批次列表展示优化
- 系统设置页面优化
  - Tab切换时左边菜单栏同步高亮
- 操作日志优化
  - 启用/停用商品日志显示中文「启用商品」/「停用商品」
  - 删除有库存变动记录的商品时提示信息优化
- 修复删除商品的外键约束错误
  - 添加库存变动记录检查（包括启用和停用商品）
  - 执行物理删除时使用 PRAGMA foreign_keys 控制外键约束
  - 按正确顺序删除所有关联数据（出库记录、批次库存、SN码、维修记录等）
- 修复注册时 users 表缺少 name 列的问题
  - 添加数据库迁移函数检查并添加 name 列

### v1.3.3
- 修复数据库事务伪实现问题，现在使用真正的事务机制
- 修复默认密码明文存储问题，使用 bcrypt 哈希加密
- 修复库存预警逻辑缺陷
- 修复出库时批次数量可能变为负数的问题
- 修复 SQL 注入风险，添加表名白名单验证
- 删除重复的 customers 表定义

### v1.2.0
- 添加 SN 码追踪功能
- 添加批次管理功能
- 优化库存报表查询性能
- 支持自动备份

### v1.1.0
- 添加客户门店管理
- 添加出库记录管理
- 优化用户界面

### v1.0.0
- 初始版本发布
- 基础库存管理功能
- 用户认证系统

## 许可证

MIT License

## 联系方式

如有问题或建议，请通过以下方式联系：
- **邮箱**: 2275337077@qq.com
