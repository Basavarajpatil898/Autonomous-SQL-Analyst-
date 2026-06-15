CREATE DATABASE IF NOT EXISTS autonomous_sql_analyst;
USE autonomous_sql_analyst;

CREATE TABLE IF NOT EXISTS customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(120) NOT NULL,
    city VARCHAR(80) NOT NULL,
    signup_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_name VARCHAR(120) NOT NULL,
    category VARCHAR(60) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    order_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    line_total DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO customers (full_name, city, signup_date) VALUES
('Aarav Shah', 'Bengaluru', '2025-01-12'),
('Mira Iyer', 'Chennai', '2025-01-21'),
('Noah Fernandes', 'Mumbai', '2025-02-02'),
('Siya Kapoor', 'Delhi', '2025-02-14'),
('Rohan Mehta', 'Pune', '2025-03-03');

INSERT INTO products (product_name, category, unit_price) VALUES
('Insight Dashboard', 'Software', 199.00),
('Data Sync Pro', 'Software', 299.00),
('Analyst Notebook', 'Accessories', 39.00),
('Cloud Credits Pack', 'Services', 499.00),
('Forecast Toolkit', 'Software', 149.00);

INSERT INTO orders (customer_id, order_date, status) VALUES
(1, '2025-03-01', 'completed'),
(2, '2025-03-08', 'completed'),
(1, '2025-03-19', 'completed'),
(3, '2025-04-02', 'completed'),
(4, '2025-04-05', 'completed'),
(5, '2025-04-11', 'processing'),
(2, '2025-04-18', 'completed'),
(3, '2025-04-21', 'completed');

INSERT INTO order_items (order_id, product_id, quantity, line_total) VALUES
(1, 1, 1, 199.00),
(1, 3, 2, 78.00),
(2, 2, 1, 299.00),
(2, 3, 1, 39.00),
(3, 4, 1, 499.00),
(4, 5, 2, 298.00),
(5, 1, 1, 199.00),
(5, 2, 1, 299.00),
(6, 3, 3, 117.00),
(7, 4, 1, 499.00),
(8, 1, 2, 398.00),
(8, 5, 1, 149.00);

