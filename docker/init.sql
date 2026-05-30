-- Create read-only user for the MCP
CREATE USER 'mcp_test'@'%' IDENTIFIED BY 'mcp_password';
-- Grant Read-Only permissions (Defense in Depth)
GRANT SELECT, SHOW VIEW ON mcp_test_db.* TO 'mcp_test'@'%';
FLUSH PRIVILEGES;

USE mcp_test_db;

-- 1. Customers (Root node)
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- 3. Categories (Standalone root)
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
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
    status ENUM('pending', 'shipped', 'delivered') DEFAULT 'pending',
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
INSERT INTO customers (name, email) VALUES 
    ('John Doe', 'john@example.com'),
    ('Jane Smith', 'jane@example.com');

INSERT INTO shipping_addresses (customer_id, street, city, country) VALUES
    (1, '123 Main St', 'New York', 'USA'),
    (2, '456 Oak Ave', 'London', 'UK');

INSERT INTO categories (name, description) VALUES
    ('Electronics', 'Gadgets and devices'),
    ('Books', 'Physical and digital books');

INSERT INTO products (category_id, name, price, stock) VALUES
    (1, 'Smartphone X', 999.00, 50),
    (1, 'Wireless Headphones', 199.50, 100),
    (2, 'TypeScript Mastery', 39.99, 200);

INSERT INTO orders (customer_id, status) VALUES
    (1, 'shipped'),
    (2, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 999.00), -- John bought 1 Smartphone
    (1, 2, 2, 199.50), -- John bought 2 Headphones
    (2, 3, 1, 39.99);  -- Jane bought 1 Book
