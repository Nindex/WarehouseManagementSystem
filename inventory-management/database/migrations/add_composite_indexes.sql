-- 性能优化：添加组合索引迁移脚本
-- 此脚本为现有数据库添加组合索引以提升查询性能

-- 库存交易记录组合索引（优化按商品、类型、时间查询）
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_composite 
ON inventory_transactions(product_id, type, created_at DESC);

-- 出库记录组合索引（优化按客户、时间查询）
CREATE INDEX IF NOT EXISTS idx_outbound_records_composite 
ON outbound_records(customer_id, outbound_date DESC);

-- 系统日志组合索引（优化按操作类型、时间查询）
CREATE INDEX IF NOT EXISTS idx_system_logs_composite 
ON system_logs(operation_type, created_at DESC);

-- SN状态组合索引（优化按商品、批次、状态查询）
CREATE INDEX IF NOT EXISTS idx_sn_status_composite 
ON sn_status(product_id, batch_number, status);

-- 产品搜索组合索引（支持分类+状态查询）
CREATE INDEX IF NOT EXISTS idx_products_category_status 
ON products(category_id, status, created_at DESC);

