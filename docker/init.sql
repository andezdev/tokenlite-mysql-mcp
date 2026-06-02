-- Create read-only user for the MCP
CREATE USER 'mcp_test'@'%' IDENTIFIED BY 'mcp_password';

CREATE DATABASE IF NOT EXISTS mcp_test_db;
USE mcp_test_db;

-- 0. Dummy Table for AST Firewall Testing
CREATE TABLE test_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

-- Grant Read-Only permissions (Defense in Depth)
GRANT SELECT, SHOW VIEW ON mcp_test_db.* TO 'mcp_test'@'%';
-- Grant Write permissions ONLY to the dummy table for testing AST Firewall
GRANT INSERT, UPDATE, DELETE, DROP ON mcp_test_db.test_permissions TO 'mcp_test'@'%';
FLUSH PRIVILEGES;

-- 1. Customers (Root node)
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50) DEFAULT NULL,
    company VARCHAR(255) DEFAULT NULL,
    tier ENUM('free', 'starter', 'pro', 'enterprise') DEFAULT 'free',
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NULL
);

-- 2. Shipping Addresses (Explicit FK to customers)
CREATE TABLE shipping_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    CONSTRAINT fk_customer_address FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 3. Categories (Self-referencing: parent_id → categories.id)
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parent_id INT DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    INDEX idx_parent_id (parent_id)
);

-- 4. Products (Explicit FK to categories)
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 0,
    CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 5. Orders (Heuristic FK to customers - intentionally missing CONSTRAINT)
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    status ENUM('pending', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
    total DECIMAL(10,2) DEFAULT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50) DEFAULT NULL,
    shipping_notes TEXT DEFAULT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_id (customer_id)
);

-- 5b. Tags (PK is VARCHAR uuid, not INT id - tests non-standard PK resolution)
CREATE TABLE tags (
    uuid VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- 5c. Product Tags (tag_id is INT but tags.uuid is VARCHAR - type mismatch, should be rejected)
CREATE TABLE product_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    tag_id INT NOT NULL,
    CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES products(id)
    -- tag_id intentionally has no FK constraint, and type mismatches tags.uuid (VARCHAR vs INT)
);

-- 6. Order Items (Mixed: Explicit FK to orders, Heuristic FK to products)
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id)
    -- Intentionally missing FK to products to test heuristics
);

-- SEED DATA
INSERT INTO customers (name, email, phone, company, tier, notes) VALUES
    ('John Doe', 'john@example.com', '+1-555-0101', 'Acme Corp', 'enterprise', 'Key account — annual contract, dedicated support rep assigned'),
    ('Jane Smith', 'jane@example.com', NULL, NULL, 'free', NULL);

INSERT INTO shipping_addresses (customer_id, street, city, country) VALUES
    (1, '123 Main St', 'New York', 'USA'),
    (2, '456 Oak Ave', 'London', 'UK');

INSERT INTO categories (parent_id, name, description) VALUES
    (NULL, 'Electronics', 'Gadgets and devices'),
    (NULL, 'Books', 'Physical and digital books'),
    (1, 'Smartphones', 'Mobile phones and accessories'),
    (1, 'Audio', 'Headphones, speakers, and audio gear');

INSERT INTO products (category_id, name, price, stock) VALUES
    (1, 'Smartphone X', 999.00, 50),
    (1, 'Wireless Headphones', 199.50, 100),
    (2, 'TypeScript Mastery', 39.99, 200);

INSERT INTO orders (customer_id, status, total, currency, payment_method, shipping_notes) VALUES
    (1, 'shipped', 1397.50, 'USD', 'credit_card', 'Express delivery requested — fragile items, handle with care'),
    (2, 'pending', 39.99, 'EUR', 'paypal', NULL);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 999.00), -- John bought 1 Smartphone
    (1, 2, 2, 199.50), -- John bought 2 Headphones
    (2, 3, 1, 39.99);  -- Jane bought 1 Book

INSERT INTO tags (uuid, name) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'bestseller'),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'new-arrival');

INSERT INTO product_tags (product_id, tag_id) VALUES
    (1, 1),
    (2, 2);

-- BULK SEED DATA (For Safe-Query Optimizer Testing & Benchmark)
DELIMITER //
CREATE PROCEDURE SeedLargeData()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE tier_val VARCHAR(20);
    DECLARE status_val VARCHAR(20);
    DECLARE payment_val VARCHAR(50);
    DECLARE notes_val TEXT;
    WHILE i <= 1500 DO
        SET tier_val = ELT(1 + (i % 4), 'free', 'starter', 'pro', 'enterprise');
        SET status_val = ELT(1 + (i % 5), 'pending', 'shipped', 'delivered', 'cancelled', 'refunded');
        SET payment_val = ELT(1 + (i % 3), 'credit_card', 'paypal', 'bank_transfer');

        INSERT INTO customers (name, email, phone, company, tier, notes) VALUES (
            CONCAT('Bulk User ', i),
            CONCAT('bulk_', i, '@example.com'),
            IF(i % 3 = 0, NULL, CONCAT('+1-555-', LPAD(i, 4, '0'))),
            IF(i % 5 = 0, NULL, CONCAT('Company #', i)),
            tier_val,
            IF(i % 4 = 0, NULL, CONCAT('Customer notes for user ', i, ' — account review pending'))
        );

        INSERT INTO orders (customer_id, status, total, currency, payment_method, shipping_notes) VALUES (
            i + 2,
            status_val,
            IF(i % 10 = 0, NULL, ROUND(10 + RAND() * 990, 2)),
            ELT(1 + (i % 3), 'USD', 'EUR', 'GBP'),
            payment_val,
            IF(i % 3 = 0, NULL, CONCAT('Shipping ref #', LPAD(i, 6, '0'), ' — standard delivery'))
        );
        SET i = i + 1;
    END WHILE;
END //
DELIMITER ;
CALL SeedLargeData();
DROP PROCEDURE SeedLargeData;

-- Force InnoDB to update statistics so EXPLAIN is accurate immediately
ANALYZE TABLE customers;
ANALYZE TABLE orders;
ANALYZE TABLE categories;
ANALYZE TABLE tags;
ANALYZE TABLE product_tags;
