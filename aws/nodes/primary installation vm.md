Frontend
# Install Node.js and npm
sudo apt update
sudo apt install -y nodejs npm

# Install PHP and Composer
sudo apt install -y php php-cli php-mbstring php-xml php-bcmath php-curl
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Clone the repository and install dependencies
cd demo
npm install
composer require php-amqplib/php-amqplib

Backend

# Update package lists
sudo apt update

# Install Node.js and npm
sudo apt install -y nodejs npm

# Install PHP and required extensions
sudo apt install -y php php-cli php-mbstring php-xml php-mysql php-bcmath php-curl

# Install Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Clone repository and navigate to backend directory
# cd backend

# Install Node.js dependencies
npm install

# Install PHP dependencies
composer require php-amqplib/php-amqplib

Messaging

# Install RabbitMQ and its dependencies
sudo apt update
sudo apt install -y erlang
sudo apt install -y rabbitmq-server

# Enable and start RabbitMQ
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

# Create admin user (as configured in the code)
sudo rabbitmqctl add_user admin admin
sudo rabbitmqctl set_user_tags admin administrator
sudo rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"

Database

# Install MySQL
# Update package lists
sudo apt update

# Install MySQL
sudo apt install -y mysql-server

# Install PHP and MySQL extension (for scripts)
sudo apt install -y php php-cli php-mysql

# Install Composer (for PHP scripts)
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Secure MySQL installation (interactive)
sudo mysql_secure_installation

# Create database and import schema
sudo mysql -e "CREATE DATABASE IF NOT EXISTS real_estate;"
sudo mysql real_estate < schema.sql

# Create MySQL user with proper permissions
sudo mysql -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY 'admin';"
sudo mysql -e "GRANT ALL PRIVILEGES ON real_estate.* TO 'root'@'%';"
sudo mysql -e "FLUSH PRIVILEGES;"

# Configure MySQL to accept remote connections
sudo sed -i 's/bind-address\s*=\s*127.0.0.1/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf
sudo systemctl restart mysql