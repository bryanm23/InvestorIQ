CREATE DATABASE IF NOT EXISTS real_estate;
USE real_estate;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR (100) NOT NULL,
    email VARCHAR (255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expiry DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    refresh_token VARCHAR(255) DEFAULT NULL,
    refresh_token_expiry DATETIME DEFAULT NULL,
    last_login DATETIME DEFAULT NULL

);


CREATE TABLE saved_properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    property_id VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) DEFAULT NULL,
    bedrooms INT DEFAULT NULL,
    bathrooms DECIMAL (3,1) DEFAULT NULL,
    sqft INT DEFAULT NULL,
    propery_type VARCHAR(50) DEFAULT NULL,
    image_url TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE property_investments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, 
    property_id VARCHAR(100) NOT NULL,
    down_payment_percent DECIMAL(5,2) DEFAULT 20.00,
    interest_rate DECIMAL (5,2) DEFAULT 4.50,
    loan_term INT DEFAULT 30,
    property_tax_rate DECIMAL (5,2) DEFAULT 1.20,
    insurance_cost DECIMAL (10,2) DEFAULT 1200.00,
    maintenance_cost DECIMAL (10,2) DEFAULT 1500.00,
    monthly_rent DECIMAL(10,2) DECIMAL NULL,
    appreciation_rate DECIMAL(5,2) DEFAULT 3.00,
    closing_costs DECIMAL(5,2) DEFAULT 3.00,
    vacancy_rate DECIMAL(5,2) DEFAULT 5.00,
    property_management_fee DECIMAL(5,2) DEFAULT 8.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

);
    
