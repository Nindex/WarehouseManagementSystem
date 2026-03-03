-- 批次库存表：记录每个批次的库存数量
CREATE TABLE IF NOT EXISTS inventory_batches (
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

-- 出库记录表：记录出库信息（客户、批次等）
CREATE TABLE IF NOT EXISTS outbound_records (
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

-- 出库SN明细表：记录每个SN码的出库信息
CREATE TABLE IF NOT EXISTS outbound_sn_items (
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

-- SN码状态表：记录每个SN码的状态（入库/出库）
CREATE TABLE IF NOT EXISTS sn_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    batch_number TEXT,
    status INTEGER NOT NULL DEFAULT 0,
    inbound_date DATETIME,
    outbound_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(sku, serial_number)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_batch ON inventory_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_outbound_records_product ON outbound_records(product_id);
CREATE INDEX IF NOT EXISTS idx_outbound_records_customer ON outbound_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_outbound_records_store ON outbound_records(store_id);
CREATE INDEX IF NOT EXISTS idx_outbound_records_batch ON outbound_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_outbound_records_date ON outbound_records(outbound_date);
CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_outbound ON outbound_sn_items(outbound_id);
CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_store ON outbound_sn_items(store_id);
CREATE INDEX IF NOT EXISTS idx_outbound_sn_items_serial ON outbound_sn_items(serial_number);
CREATE INDEX IF NOT EXISTS idx_sn_status_product ON sn_status(product_id);
CREATE INDEX IF NOT EXISTS idx_sn_status_sku ON sn_status(sku);
CREATE INDEX IF NOT EXISTS idx_sn_status_serial ON sn_status(serial_number);
CREATE INDEX IF NOT EXISTS idx_sn_status_batch ON sn_status(batch_number);
CREATE INDEX IF NOT EXISTS idx_sn_status_status ON sn_status(status);
CREATE INDEX IF NOT EXISTS idx_sn_status_sku_serial ON sn_status(sku, serial_number);

