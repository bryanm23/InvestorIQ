// apiUtils.js
import { useAuth } from '../AuthContext';
import { useState, useEffect } from 'react';

// API URL constants - using the same structure as in other components
const RENTCAST_API_URL = "http://100.71.100.5:8000/rentcast_sender.php";
const PROPERTY_MANAGER_API_URL = "http://100.71.100.5:8000/property_manager_sender.php";
const AUTH_API_URL = "http://100.71.100.5:8000/front_to_back_sender.php";

// Cache configuration
const CACHE_DURATION = {
  // Cache durations in milliseconds
  default: 5 * 60 * 1000, // 5 minutes
  getMarketStats: 60 * 60 * 1000, // 1 hour for market statistics
  getSavedProperties: 2 * 60 * 1000, // 2 minutes for saved properties
};

// Actions that can be cached (read-only operations)
const CACHEABLE_ACTIONS = [
  'getSavedProperties',
  'getProperties',
  'searchProperties',
  'getPropertyDetails',
  'getMarketStats',
  'verify_auth'
];

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Make an authenticated API request with caching and performance optimizations
 * @param {Object} options - Request options
 * @param {string} options.action - The action to perform
 * @param {Object} options.data - Data to send with the request
 * @param {boolean} options.includeAuth - Whether to include auth credentials
 * @param {boolean} options.useCache - Whether to use cache for this request (defaults to true for cacheable actions)
 * @returns {Promise<Object>} The response data
 */
const useApi = () => {
  const { refreshToken } = useAuth();
  const [cache, setCache] = useState({});
  const [pendingRequests, setPendingRequests] = useState({});
  
  // Clear expired cache entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newCache = { ...cache };
      let hasChanges = false;
      
      Object.keys(newCache).forEach(key => {
        if (newCache[key].expiry < now) {
          delete newCache[key];
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        setCache(newCache);
      }
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [cache]);
  
  // Generate a cache key from action and data
  const getCacheKey = (action, data) => {
    return `${action}:${JSON.stringify(data)}`;
  };
  
  // Check if an action is cacheable
  const isActionCacheable = (action) => {
    return CACHEABLE_ACTIONS.includes(action);
  };
  
  // Get cache duration for an action
  const getCacheDuration = (action) => {
    return CACHE_DURATION[action] || CACHE_DURATION.default;
  };
  
  // Fetch with timeout
  const fetchWithTimeout = async (url, options, timeout) => {
    const controller = new AbortController();
    const { signal } = controller;
    
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
  
  const apiRequest = async ({ action, data = {}, includeAuth = true, useCache = isActionCacheable(action) }) => {
    try {
      // Check cache for read operations if caching is enabled
      if (useCache) {
        const cacheKey = getCacheKey(action, data);
        const cachedItem = cache[cacheKey];
        
        if (cachedItem && cachedItem.expiry > Date.now()) {
          console.log(`Using cached response for ${action}`);
          return cachedItem.data;
        }
        
        // Check if there's already a pending request for this exact data
        if (pendingRequests[cacheKey]) {
          console.log(`Reusing pending request for ${action}`);
          return pendingRequests[cacheKey];
        }
      }
      
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          ...data 
        }),
        credentials: includeAuth ? 'include' : 'omit' // Include cookies if authenticated
      };
      
      // Create the promise for this request
      const requestPromise = (async () => {
        try {
          // Determine which endpoint to use based on the action
          let endpoint;
          if (action.startsWith('get') || action === 'searchProperties') {
            endpoint = RENTCAST_API_URL;
          } else if (action.includes('Property') || action.includes('property')) {
            endpoint = PROPERTY_MANAGER_API_URL;
          } else {
            endpoint = AUTH_API_URL;
          }
          
          // When running on VM, use the VM's hostname instead
          if (window.location.hostname === '100.71.100.5') {
            endpoint = endpoint.replace('localhost', '100.71.100.5');
          }
          
          console.log(`Making API request to: ${endpoint}`);
          
          let response = await fetchWithTimeout(endpoint, requestOptions, REQUEST_TIMEOUT);
          let result = await response.json();
          
          // If token expired, try to refresh and retry request
          if (result.status === 'error' && result.message?.includes('expired')) {
            const refreshResult = await refreshToken();
            
            if (refreshResult.success) {
              // Retry the original request with new token using the same endpoint
              response = await fetchWithTimeout(endpoint, requestOptions, REQUEST_TIMEOUT);
              result = await response.json();
            }
          }
          
          // Cache successful responses for read operations
          if (useCache && result.status === 'success') {
            const cacheKey = getCacheKey(action, data);
            const expiry = Date.now() + getCacheDuration(action);
            
            setCache(prevCache => ({
              ...prevCache,
              [cacheKey]: { data: result, expiry }
            }));
          }
          
          return result;
        } catch (error) {
          if (error.name === 'AbortError') {
            console.error(`API request timeout (${action})`);
            return { status: 'error', message: 'Request timeout' };
          }
          
          console.error(`API request error (${action}):`, error);
          return { status: 'error', message: 'Network error' };
        } finally {
          // Remove from pending requests when done
          if (useCache) {
            const cacheKey = getCacheKey(action, data);
            setPendingRequests(prev => {
              const newPending = { ...prev };
              delete newPending[cacheKey];
              return newPending;
            });
          }
        }
      })();
      
      // Store the promise for potential reuse
      if (useCache) {
        const cacheKey = getCacheKey(action, data);
        setPendingRequests(prev => ({
          ...prev,
          [cacheKey]: requestPromise
        }));
      }
      
      return requestPromise;
    } catch (error) {
      console.error(`API request setup error (${action}):`, error);
      return { status: 'error', message: 'Network error' };
    }
  };
  
  return { apiRequest };
};

export default useApi;
