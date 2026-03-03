-- 仓库管理系统数据库架构
-- 基于技术架构文档设计

-- 用户表
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 产品分类表
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- 产品表
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    unit TEXT NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    selling_price DECIMAL(10,2) DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER DEFAULT 0,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 库存表
CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    batch_number TEXT,
    production_date DATE,
    expiry_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 库存变动记录表
CREATE TABLE inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('in', 'out', 'adjust', 'transfer')),
    quantity INTEGER NOT NULL,
    balance INTEGER NOT NULL,
    batch_number TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 供应商表
CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    bank_info TEXT,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 采购订单表
CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'received', 'cancelled')),
    total_amount DECIMAL(10,2) DEFAULT 0,
    order_date DATE NOT NULL,
    expected_date DATE,
    actual_date DATE,
    notes TEXT,
    created_by INTEGER,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- 采购订单明细表
CREATE TABLE purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 采购退货表
CREATE TABLE purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'completed', 'rejected')),
    created_by INTEGER,
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- 客户表
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    -- credit_limit DECIMAL(10,2) DEFAULT 0,  -- 已移除信用额度字段
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 销售订单表
CREATE TABLE sales_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'shipped', 'delivered', 'cancelled')),
    total_amount DECIMAL(10,2) DEFAULT 0,
    order_date DATE NOT NULL,
    shipped_date DATE,
    delivered_date DATE,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 销售订单明细表
CREATE TABLE sales_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    shipped_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 系统设置表
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统操作日志表
CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    operation_type TEXT NOT NULL,
    table_name TEXT,
    record_id INTEGER,
    old_values TEXT,
    new_values TEXT,
    description TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 客户表
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 客户门店表
CREATE TABLE customer_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    store_name TEXT NOT NULL,
    address TEXT,
    contact_person TEXT,
    phone TEXT,
    status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    UNIQUE(customer_id, store_name)
);

-- 批次库存表
CREATE TABLE inventory_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_number TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    production_date DATE,
    expiry_date DATE,
    inbound_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(product_id, batch_number)
);

-- 出库记录表
CREATE TABLE outbound_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_id INTEGER NOT NULL,
    batch_number TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    store_id INTEGER,
    quantity INTEGER NOT NULL,
    outbound_price DECIMAL(10,2),
    outbound_date DATETIME NOT NULL,
    location TEXT,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (store_id) REFERENCES customer_stores(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 出库SN明细表
CREATE TABLE outbound_sn_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outbound_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    batch_number TEXT,
    customer_id INTEGER,
    store_id INTEGER,
    serial_number TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    outbound_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (outbound_id) REFERENCES outbound_records(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (store_id) REFERENCES customer_stores(id),
    UNIQUE(product_id, serial_number)
);

-- SN码状态表
CREATE TABLE sn_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL,
    batch_number TEXT,
    status INTEGER NOT NULL DEFAULT 0,
    inbound_date DATETIME,
    outbound_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(product_id, serial_number)
);

-- 创建索引
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_created_at ON inventory_transactions(created_at);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_order_items_order ON purchase_order_items(order_id);
CREATE INDEX idx_purchase_order_items_product ON purchase_order_items(product_id);
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);
CREATE INDEX idx_sales_order_items_order ON sales_order_items(order_id);
CREATE INDEX idx_sales_order_items_product ON sales_order_items(product_id);
CREATE INDEX idx_system_logs_user ON system_logs(user_id);
CREATE INDEX idx_system_logs_operation ON system_logs(operation_type);
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customer_stores_customer ON customer_stores(customer_id);
CREATE INDEX idx_customer_stores_status ON customer_stores(status);
CREATE INDEX idx_inventory_batches_product ON inventory_batches(product_id);
CREATE INDEX idx_inventory_batches_batch ON inventory_batches(batch_number);
CREATE INDEX idx_outbound_records_product ON outbound_records(product_id);
CREATE INDEX idx_outbound_records_customer ON outbound_records(customer_id);
CREATE INDEX idx_outbound_records_store ON outbound_records(store_id);
CREATE INDEX idx_outbound_records_batch ON outbound_records(batch_id);
CREATE INDEX idx_outbound_records_date ON outbound_records(outbound_date);
CREATE INDEX idx_outbound_sn_items_outbound ON outbound_sn_items(outbound_id);
CREATE INDEX idx_outbound_sn_items_store ON outbound_sn_items(store_id);
CREATE INDEX idx_outbound_sn_items_serial ON outbound_sn_items(serial_number);
CREATE INDEX idx_sn_status_product ON sn_status(product_id);
CREATE INDEX idx_sn_status_serial ON sn_status(serial_number);
CREATE INDEX idx_sn_status_batch ON sn_status(batch_number);
CREATE INDEX idx_sn_status_status ON sn_status(status);

-- 插入默认数据
INSERT INTO users (username, password, name, email) VALUES 
('admin', 'admin123', '系统管理员', 'admin@system.com');

INSERT INTO products (sku, name, category_id, description, unit, cost_price, selling_price, min_stock, max_stock) VALUES 
('PROD001', '无线鼠标', NULL, '2.4G无线鼠标', '个', 45.00, 89.00, 10, 100),
('PROD002', 'A4打印纸', NULL, '80克A4复印纸', '包', 15.00, 25.00, 20, 200),
('PROD003', '工业轴承', NULL, '6201型号轴承', '个', 25.00, 45.00, 50, 500),

INSERT INTO inventory (product_id, quantity, location, batch_number, production_date, expiry_date) VALUES 
(1, 50, 'A1-01', 'B2024001', '2024-01-01', '2025-01-01'),
(2, 100, 'B2-01', 'B2024002', '2024-01-15', '2025-01-15'),
(3, 200, 'C3-01', 'B2024003', '2024-02-01', '2025-02-01'),

INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES 
('科技电子有限公司', '王经理', '13800138001', 'wang@tech.com', '北京市朝阳区'),
('办公用品批发中心', '李经理', '13800138002', 'li@office.com', '上海市浦东新区'),
('机械设备制造厂', '张经理', '13800138003', 'zhang@machine.com', '广州市天河区');

-- 系统设置将在应用首次运行时通过 SystemSettingService 自动创建