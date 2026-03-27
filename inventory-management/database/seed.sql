-- 插入默认用户（密码已使用bcrypt哈希，明文密码为：123）
INSERT INTO users (username, password, name, email, phone) VALUES
('admin', '$2a$10$pQruickl6h9HfJy1YZjrEOnXd8LSXnKI9O1oXir1YIEKhOsL879f6', '系统管理员', 'admin@system.com', '13800138000');

-- 插入产品分类（必须在产品之前插入，因为产品有外键引用）
INSERT INTO categories (name, description) VALUES
('零食', '零食'),
('餐饮', '餐饮');

-- 插入默认产品（引用上面插入的分类ID）
INSERT INTO products (name, category_id, sku, barcode, description, unit, cost_price, selling_price, min_stock, max_stock) VALUES
('麻辣小面', 1, 'LAPTOP001', '1234567890123', '麻辣小面', '碗', 10.00, 10.00, 5, 50),
('无线鼠标', 2, 'MOUSE001', '1234567890124', '人体工学无线鼠标', '个', 45.00, 10.00, 20, 200),
('打印纸A4', 1, 'PAPER001', '1234567890125', 'A4打印纸,500张/包', '包', 18.00, 10.00, 50, 500);

-- 插入供应商
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
('科技电子有限公司', '王经理', '13800138000', 'wang@tech.com', '北京市朝阳区科技园A座'),
('办公用品批发中心', '李经理', '13800138001', 'li@office.com', '上海市浦东新区商务区B座');

--插入客户管理
INSERT INTO customers (name, contact_person, phone, email, address) VALUES
('麻爪爪', '王经理', '13800138000', 'wang@mazzao.com', '北京市朝阳区科技园A座'),
('鹅堂', '王经理', '13800138001', 'wang@eetang.com', '上海市浦东新区商务区B座');

--插入客户门店
INSERT INTO customer_stores (customer_id, store_name, address, contact_person, phone) VALUES
(1, '麻爪爪旗舰店', '北京市朝阳区科技园A座', '王经理', '13800138000'),
(2, '鹅堂旗舰店', '上海市浦东新区商务区B座', '王经理', '13800138001');
