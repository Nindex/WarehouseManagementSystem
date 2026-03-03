# 仓库管理系统

## 项目简介

仓库管理系统是一个基于 Electron 的本地化仓库管理解决方案，提供完整的库存管理、采购管理、客户管理和报表统计功能。系统采用 SQLite 数据库存储数据，无需额外配置数据库服务器，开箱即用。

**版本**: 1.2.0 
**许可证**: MIT  
**作者**: Your Company

## 功能特性

### 📊 仪表盘
- 数据概览和 KPI 统计
- 库存预警提醒
- 实时操作日志
- 待办事项通知

### 📦 仓库管理
- **商品列表**: 商品信息管理、分类管理、SKU/条码管理
- **商品入库**: 支持批次管理、生产日期、过期日期记录
- **商品出库**: 支持按批次出库、客户门店关联
- **库存盘点**: 库存调整、盘点记录
- **批次管理**: 批次号追踪、批次库存查询

### 🛒 采购管理
- **采购订单**: 采购订单创建、审核、收货管理
- **供应商管理**: 供应商信息维护、联系方式管理
- **采购退货**: 采购退货单管理、退货审核流程

### 👥 客户管理
- **客户信息**: 客户基本信息管理
- **门店管理**: 客户门店信息维护，支持多门店管理

### 📈 报表统计
- **库存报表**: 库存明细、库存预警报表
- **采购报表**: 采购订单统计、供应商采购分析
- **出入库报表**: 出入库流水、批次追踪报表

### ⚙️ 系统设置
- **用户管理**: 用户账号管理、权限控制
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
- **数据库位置**: `data/inventory.db` (生产环境)

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
- **Python**: 3.x (用于编译 native 模块，可选)
- **Visual Studio Build Tools**: (Windows 平台编译 native 模块，可选)

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
- **密码**: `123`

#### 4. 启动开发服务器

```bash
# 启动开发模式（自动打开 Electron 窗口）
npm run dev

# 或者仅启动 Electron（需要先手动启动 Vite 开发服务器）
npm start
```

开发模式会启动：
- Vite 开发服务器（前端热重载）
- Electron 主进程（自动重启）
- 数据库自动初始化

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
- **安装程序**: `release/仓库管理系统 Setup 1.2.0.exe`
- **便携版**: `release/win-unpacked/仓库管理系统.exe`

#### 安装和使用

1. 运行安装程序 `仓库管理系统 Setup 1.2.0.exe`
2. 按照安装向导完成安装
3. 从桌面快捷方式或开始菜单启动应用
4. 使用默认账号登录（用户名: `admin`, 密码: `123`）

**数据库位置**: 安装后的数据库文件位于应用数据目录：
```
%APPDATA%/仓库管理系统/data/inventory.db
```

## 项目结构

```
inventory-management/
├── src/                          # 源代码目录
│   ├── components/               # React 组件
│   │   ├── ActivityLogModal/     # 操作日志弹窗
│   │   ├── BatchInventoryModal/ # 批次管理弹窗
│   │   ├── ErrorBoundary.tsx    # 错误边界
│   │   ├── Layout/              # 布局组件
│   │   └── StockTransactionModal/ # 库存交易弹窗
│   ├── database/                 # 数据库相关
│   │   ├── DatabaseService.ts   # 数据库服务
│   │   ├── init.ts              # 数据库初始化
│   │   ├── schema.sql           # 数据库架构
│   │   └── migrations/          # 数据库迁移
│   ├── pages/                    # 页面组件
│   │   ├── Dashboard/           # 仪表盘
│   │   ├── Inventory/           # 仓库管理
│   │   ├── Procurement/         # 采购管理
│   │   ├── Customers/           # 客户管理
│   │   ├── Stores/              # 门店管理
│   │   ├── Reports/             # 报表统计
│   │   ├── Settings/            # 系统设置
│   │   ├── Login/               # 登录页
│   │   └── Register/            # 注册页
│   ├── services/                 # 服务层
│   │   ├── api.ts               # API 接口
│   │   └── database/             # 数据库服务
│   ├── store/                    # Redux 状态管理
│   │   ├── index.ts             # Store 配置
│   │   ├── hooks.ts             # Redux Hooks
│   │   └── slices/              # Redux Slices
│   ├── types/                    # TypeScript 类型定义
│   ├── utils/                    # 工具函数
│   ├── App.tsx                   # 应用根组件
│   └── main.tsx                  # 应用入口
├── electron/                     # Electron 主进程
│   ├── main.ts                   # 主进程入口
│   ├── preload.ts                # 预加载脚本
│   └── database/                 # 数据库初始化（主进程）
├── database/                      # 数据库脚本
│   ├── schema.sql                # 数据库架构
│   ├── seed.sql                  # 种子数据
│   └── migrations/               # 数据库迁移脚本
├── scripts/                       # 构建和工具脚本
│   ├── dev.js                    # 开发服务器
│   ├── install-better-sqlite3.js # SQLite 安装脚本
│   └── ...                       # 其他工具脚本
├── dist/                         # 构建输出目录（前端）
├── release/                      # 打包输出目录
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 配置（渲染进程）
├── vite.main.config.ts           # Vite 配置（主进程）
├── vite.preload.config.ts        # Vite 配置（预加载）
└── forge.config.ts               # Electron Forge 配置
```

## 数据库说明

### 数据库文件位置

- **开发环境**: `data/inventory.db` (项目根目录下的 data 文件夹)
- **生产环境**: `%APPDATA%/仓库管理系统/data/inventory.db`

### 主要数据表

| 表名 | 说明 |
|------|------|
| `users` | 用户表，存储系统用户信息 |
| `categories` | 产品分类表 |
| `products` | 产品表，存储商品基本信息 |
| `inventory` | 库存表，存储商品库存信息 |
| `inventory_batches` | 批次库存表，支持批次管理 |
| `inventory_transactions` | 库存变动记录表，记录所有库存操作 |
| `suppliers` | 供应商表 |
| `purchase_orders` | 采购订单表 |
| `purchase_order_items` | 采购订单明细表 |
| `purchase_returns` | 采购退货表 |
| `purchase_return_items` | 采购退货明细表 |
| `customers` | 客户表 |
| `customer_stores` | 客户门店表 |
| `outbound_records` | 出库记录表 |
| `outbound_sn_items` | 出库SN明细表 |
| `sn_status` | SN码状态表 |
| `system_settings` | 系统设置表 |
| `system_logs` | 系统操作日志表 |

### 数据库特性

- **自动初始化**: 首次启动时自动创建数据库和表结构
- **自动迁移**: 支持数据库结构迁移（通过 `migrations` 目录）
- **种子数据**: 开发和生产环境都会执行 `seed.sql` 插入初始数据
- **索引优化**: 包含单列索引和组合索引，优化查询性能
- **外键约束**: 保证数据完整性

### 备份和恢复

系统提供数据备份和恢复功能：
- **备份位置**: `data/backups/` 目录
- **备份格式**: SQLite 数据库文件（`.db`）
- **备份方式**: 通过系统设置页面进行手动备份

## 开发指南

### 开发模式启动

```bash
# 启动完整开发环境（推荐）
npm run dev

# 仅启动 Electron（需要手动启动 Vite）
npm start
```

开发模式特性：
- 前端代码热重载（HMR）
- Electron 主进程自动重启
- 开发工具自动打开
- 详细的错误提示

### 代码结构说明

#### 前端架构
- **组件化开发**: 使用 React 函数组件 + Hooks
- **状态管理**: Redux Toolkit 管理全局状态
- **路由管理**: React Router 实现页面路由
- **API 调用**: 通过 IPC 与 Electron 主进程通信

#### 主进程架构
- **窗口管理**: Electron BrowserWindow 管理应用窗口
- **IPC 通信**: 通过 `ipcMain` 和 `ipcRenderer` 实现进程间通信
- **数据库操作**: 在主进程中使用 Better-SQLite3 操作数据库

### 数据库迁移机制

系统支持数据库结构迁移：

1. **迁移文件位置**: `database/migrations/` 或 `src/database/migrations/`
2. **迁移执行**: 应用启动时自动检测并执行未执行的迁移
3. **迁移命名**: 建议使用时间戳或版本号命名，如 `20240101_add_field.sql`

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

## 构建和打包

### 构建命令

```bash
# 清理构建目录
npm run clean

# 仅构建代码（不打包）
npm run build:code

# 构建并打包（目录格式）
npm run build

# 构建 NSIS 安装程序
npm run build:installer

# 构建便携版
npm run build:portable

# 构建所有格式
npm run build:all
```

### 打包配置

打包配置位于 `package.json` 的 `build` 字段：

- **应用 ID**: `com.company.inventory`
- **产品名称**: `仓库管理系统`
- **输出目录**: `release/`
- **Windows 目标**: NSIS 安装程序 + 便携版

### 输出文件说明

#### NSIS 安装程序
- **文件**: `仓库管理系统 Setup 1.2.0.exe`
- **特性**: 
  - 支持自定义安装目录
  - 创建桌面快捷方式
  - 创建开始菜单项
  - 支持卸载

#### 便携版
- **目录**: `win-unpacked/`
- **可执行文件**: `仓库管理系统.exe`
- **特性**: 
  - 无需安装，直接运行
  - 数据存储在应用目录

### 构建注意事项

1. **Native 模块**: `better-sqlite3` 需要针对目标平台编译
2. **ASAR 打包**: Native 模块需要从 ASAR 中解包（已配置）
3. **资源文件**: `database/` 目录会作为额外资源打包

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
- 生产环境: `%APPDATA%/仓库管理系统/data/inventory.db`

#### Q: 如何重置数据库？
**A**: 删除数据库文件后重启应用，系统会自动重新初始化。

### 依赖安装问题

#### Q: `better-sqlite3` 安装失败
**A**: 尝试以下解决方案：

```bash
# 1. 检查 Python 环境
npm run check:python

# 2. 检查 Visual Studio Build Tools
npm run check:vs

# 3. 使用预编译版本
npm run install:sqlite:prebuilt

# 4. 手动重建
npm run rebuild:sqlite
```

#### Q: Electron 下载失败
**A**: 项目已配置使用国内镜像源（npmmirror.com），如果仍然失败：
- 检查网络连接
- 清除 Electron 缓存: 删除 `${CACHE}/electron/` 目录
- 手动下载 Electron 到缓存目录

### 构建相关问题

#### Q: 构建失败，提示找不到模块
**A**: 
- 确保已执行 `npm install`
- 清理构建目录: `npm run clean`
- 重新构建: `npm run build:code`

#### Q: 打包后的应用无法启动
**A**: 
- 检查 native 模块是否正确打包
- 查看应用日志文件: `logs/` 目录
- 确保所有依赖都已正确打包

#### Q: 安装程序无法安装
**A**: 
- 检查是否有管理员权限
- 检查杀毒软件是否拦截
- 尝试以管理员身份运行安装程序

### 运行时问题

#### Q: 应用启动后白屏
**A**: 
- 打开开发者工具查看错误信息（开发模式）
- 检查控制台日志
- 确认前端资源是否正确加载

#### Q: 登录后无法访问页面
**A**: 
- 检查 Redux 状态是否正确
- 查看浏览器控制台错误
- 确认路由配置是否正确

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题或建议，请通过以下方式联系：
- **邮箱**: 2275337077@qq.com
- **项目地址**: [GitHub Repository]

---
