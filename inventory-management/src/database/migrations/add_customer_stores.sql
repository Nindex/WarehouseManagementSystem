-- 客户门店表
CREATE TABLE IF NOT EXISTS customer_stores (
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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_customer_stores_customer ON customer_stores(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_stores_status ON customer_stores(status);

