-- 客户表结构更新：邮箱改为服务费到期时间
-- 创建服务费记录表

-- 1. 为 customers 表添加 service_fee_expiry_date 列（如果不存在）
ALTER TABLE customers ADD COLUMN service_fee_expiry_date TEXT;

-- 2. 创建服务费记录表
CREATE TABLE IF NOT EXISTS service_fee_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    payment_date TEXT,
    is_paid INTEGER DEFAULT 0,
    amount REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_service_fee_records_customer ON service_fee_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_fee_records_dates ON service_fee_records(start_date, end_date);
