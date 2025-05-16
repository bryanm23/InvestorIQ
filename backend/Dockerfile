# Stage 1: Node.js build
FROM node:18-alpine as node_builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Stage 2: PHP with Node.js
FROM php:8.0-fpm-alpine

# Install Node.js
COPY --from=node_builder /usr/local/bin/node /usr/local/bin/
COPY --from=node_builder /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=node_builder /usr/src/app/node_modules /usr/src/app/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

# Install system dependencies
RUN apk add --no-cache \
    bash \
    supervisor \
    rabbitmq-c \
    rabbitmq-c-dev \
    oniguruma \
    oniguruma-dev \
    $PHPIZE_DEPS

# Install PHP extensions
RUN docker-php-ext-install \
    pdo \
    pdo_mysql \
    sockets \
    mbstring

# Install AMQP extension
RUN pecl install amqp && \
    docker-php-ext-enable amqp

# Set working directory
WORKDIR /usr/src/app

# Copy application files
COPY . .

# Create supervisor log directory and PHP error log
RUN mkdir -p /var/log/supervisor /var/log/php && \
    touch /var/log/php/error.log && \
    chmod 777 /var/log/php/error.log

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port
EXPOSE 3000

# Start both Node.js app and PHP receivers using supervisor
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"] 