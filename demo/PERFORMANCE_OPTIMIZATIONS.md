# Performance Optimizations

This document outlines the performance optimizations implemented to improve API response times and overall application performance.

## Server-Side Optimizations

### 1. Response Caching

We've implemented a caching system for read-only operations in the following PHP sender files:

- `property_manager_sender.php`
- `front_to_back_sender.php`
- `rentcast_sender.php`

The caching system works by:
- Storing successful API responses in a local cache directory
- Using different cache expiration times based on the type of data
- Bypassing the RabbitMQ message queue for cached responses

#### Cache Configuration

- Property data: 5 minutes cache lifetime
- Market statistics: 1 hour cache lifetime
- Authentication verification: 1 minute cache lifetime

### 2. Reduced Timeouts

We've reduced the timeout values for RabbitMQ operations:

- `property_manager_sender.php`: Reduced from 10s to 3s
- `front_to_back_sender.php`: Reduced from 10s to 3s
- `rentcast_sender.php`: Reduced from 30s to 10s

This prevents long-running requests from blocking the application and provides faster error feedback.

### 3. Cache Maintenance

Two scripts have been added to manage the cache:

- `cache_cleanup.php`: Removes expired cache files
- `cleanup_cron.sh`: Shell script for running the cleanup via cron

To set up automatic cache cleanup, add the following to your crontab:

```
0 * * * * /path/to/Capstone-Group-01/demo/cleanup_cron.sh
```

This will run the cleanup every hour.

## Client-Side Optimizations

### 1. React Component Caching

The `apiUtils.js` file has been enhanced with:

- Client-side caching for read operations
- Request deduplication (prevents duplicate simultaneous requests)
- Request timeout handling
- Automatic cache expiration

#### Cache Configuration

- Default cache duration: 5 minutes
- Market statistics: 1 hour
- Saved properties: 2 minutes

### 2. Request Optimization

- Added request timeout (8 seconds) to prevent UI blocking
- Implemented request batching for similar requests
- Added proper error handling for network issues

## Usage Guidelines

### For Developers

1. **Using the API Utility**:
   ```javascript
   const { apiRequest } = useApi();
   
   // With caching (default for read operations)
   const result = await apiRequest({
     action: 'getProperties',
     data: { location: 'New York' }
   });
   
   // Force bypass cache
   const freshResult = await apiRequest({
     action: 'getProperties',
     data: { location: 'New York' },
     useCache: false
   });
   ```

2. **Cache Invalidation**:
   - The cache is automatically invalidated after its expiration time
   - For manual cache cleanup, run `php cache_cleanup.php`

3. **Monitoring Performance**:
   - Check the log files for performance metrics:
     - `rentcast_sender.log`
     - `cache_cleanup.log`
     - `cron_cleanup.log`

## Future Improvements

1. **Implement Redis Caching**:
   - Replace file-based caching with Redis for better performance
   - Enable distributed caching across multiple servers

2. **Add Request Compression**:
   - Implement gzip compression for API responses

3. **Implement Connection Pooling**:
   - Maintain persistent connections to RabbitMQ

4. **Add Performance Monitoring**:
   - Implement detailed performance metrics collection
