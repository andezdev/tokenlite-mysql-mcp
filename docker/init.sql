-- Create read-only user for the MCP
CREATE USER 'mcp_test'@'%' IDENTIFIED BY 'mcp_password';
GRANT SELECT, SHOW VIEW ON mcp_test_db.* TO 'mcp_test'@'%';
FLUSH PRIVILEGES;

-- Create test table
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    registration_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert seed data
INSERT INTO customers (name, email) VALUES
('Ana Garcia', 'ana@example.com'),
('Luis Perez', 'luis@example.com'),
('Maria Lopez', 'maria@example.com'),
('Carlos Ruiz', 'carlos@example.com'),
('Laura Gomez', 'laura@example.com');
