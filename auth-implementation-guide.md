# Authentication Implementation Guide

This guide outlines the steps to implement a secure authentication system using JWT tokens stored in HTTP-only cookies. This approach combines the benefits of JWT (statelessness, distributed architecture compatibility) with the security advantages of HTTP-only cookies (XSS protection).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend Implementation](#backend-implementation)
  - [Dependencies](#backend-dependencies)
  - [JWT Configuration](#jwt-configuration)
  - [Middleware Setup](#middleware-setup)
  - [API Endpoints](#api-endpoints)
  - [Database Changes](#database-changes)
- [Frontend Implementation](#frontend-implementation)
  - [Dependencies](#frontend-dependencies)
  - [Authentication Context](#authentication-context)
  - [Protected Routes](#protected-routes)
  - [Component Modifications](#component-modifications)
- [Security Considerations](#security-considerations)
- [Testing](#testing)

## Architecture Overview

The authentication system will work as follows:

1. **Login Flow**:
   - User submits credentials
   - Backend validates credentials
   - On success, backend generates:
     - Short-lived access token (JWT)
     - Long-lived refresh token
   - Both tokens are set as HTTP-only cookies
   - User info (non-sensitive) is returned to frontend

2. **Authentication Flow**:
   - Protected routes check for user authentication
   - API requests include cookies automatically
   - Backend middleware validates the access token
   - If access token expires, refresh token is used to get a new one

3. **Logout Flow**:
   - Cookies are cleared from client
   - Refresh token is invalidated in database

## Backend Implementation

### Backend Dependencies

Install the required packages:

```bash
cd backend
npm install jsonwebtoken cookie-parser
```

### JWT Configuration

Add the following environment variables to your `.env` file:

```
JWT_SECRET=your_jwt_secret_key_here
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here
ACCESS_TOKEN_EXPIRY=30m
REFRESH_TOKEN_EXPIRY=7d
```

Create a new file `backend/auth/jwt-config.js`:

```javascript
// backend/auth/jwt-config.js
require('dotenv').config();

module.exports = {
  jwtSecret: process.env.JWT_SECRET || 'fallback_jwt_secret_for_dev',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'fallback_refresh_secret_for_dev',
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || '30m',
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
};
```

### Middleware Setup

Create a new file `backend/middleware/auth.js`:

```javascript
// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../auth/jwt-config');

// Middleware to verify JWT token
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
  }
};

module.exports = { authenticate };
```

### API Endpoints

Update your `backend/server.js` file to include the authentication endpoints:

```javascript
// Add these imports
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { authenticate } = require('./middleware/auth');
const { 
  jwtSecret, 
  refreshTokenSecret, 
  accessTokenExpiry, 
  refreshTokenExpiry,
  cookieOptions 
} = require('./auth/jwt-config');

// Add cookie parser middleware
app.use(cookieParser());

// Token generation functions
const createAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name },
    jwtSecret,
    { expiresIn: accessTokenExpiry }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    refreshTokenSecret,
    { expiresIn: refreshTokenExpiry }
  );
};

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ status: 'error', message: 'Email and password are required' });
  }
  
  try {
    // Use your existing RabbitMQ message queue for authentication
    // This is a placeholder for your actual authentication logic
    // You'll need to adapt this to work with your RabbitMQ setup
    
    // Example of what happens after successful authentication:
    const user = {
      id: 123, // Replace with actual user ID
      name: 'User Name', // Replace with actual user name
      email: email
    };
    
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    
    // Store refresh token in database (implement this function)
    // storeRefreshToken(user.id, refreshToken);
    
    // Set cookies
    res.cookie('token', accessToken, {
      ...cookieOptions,
      maxAge: 30 * 60 * 1000 // 30 minutes
    });
    
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      path: '/api/auth/refresh', // Restrict to refresh endpoint
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Return user info (without sensitive data)
    res.json({
      status: 'success',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ status: 'error', message: 'Authentication failed' });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ status: 'error', message: 'Refresh token required' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, refreshTokenSecret);
    
    // Verify refresh token in database (implement this function)
    // const isValid = await verifyRefreshToken(decoded.id, refreshToken);
    // if (!isValid) throw new Error('Invalid refresh token');
    
    // Get user from database (implement this function)
    // const user = await getUserById(decoded.id);
    
    // For this example, we'll create a mock user
    const user = {
      id: decoded.id,
      name: 'User Name'
    };
    
    // Create new access token
    const accessToken = createAccessToken(user);
    
    // Set new access token cookie
    res.cookie('token', accessToken, {
      ...cookieOptions,
      maxAge: 30 * 60 * 1000 // 30 minutes
    });
    
    res.json({ status: 'success' });
  } catch (err) {
    res.clearCookie('token');
    res.clearCookie('refreshToken');
    return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
  }
});

// Auth status endpoint
app.get('/api/auth/status', authenticate, (req, res) => {
  // User is authenticated if they reach this point
  res.json({
    status: 'success',
    user: {
      id: req.user.id,
      name: req.user.name
    }
  });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  // Get refresh token
  const refreshToken = req.cookies.refreshToken;
  
  // If refresh token exists, invalidate it in database
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, refreshTokenSecret);
      // Invalidate refresh token in database (implement this function)
      // invalidateRefreshToken(decoded.id, refreshToken);
    } catch (err) {
      // Token is invalid, but we'll still clear cookies
    }
  }
  
  // Clear cookies
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
  
  res.json({ status: 'success' });
});

// Example of a protected route
app.get('/api/protected-resource', authenticate, (req, res) => {
  res.json({
    status: 'success',
    message: 'This is a protected resource',
    userId: req.user.id
  });
});
```

### Database Changes

You'll need to create a table to store refresh tokens. Add this to your database schema:

```sql
CREATE TABLE refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

Create a file `backend/models/refreshToken.js` to handle refresh token operations:

```javascript
// backend/models/refreshToken.js
// This is a placeholder - adapt to your actual database connection method

const storeRefreshToken = async (userId, token, expiresAt) => {
  // Implementation depends on your database setup
  // Example with MySQL:
  /*
  const query = `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `;
  await db.query(query, [userId, token, expiresAt]);
  */
};

const verifyRefreshToken = async (userId, token) => {
  // Implementation depends on your database setup
  // Example with MySQL:
  /*
  const query = `
    SELECT * FROM refresh_tokens
    WHERE user_id = ? AND token = ? AND expires_at > NOW()
  `;
  const [rows] = await db.query(query, [userId, token]);
  return rows.length > 0;
  */
  return true; // Placeholder
};

const invalidateRefreshToken = async (userId, token) => {
  // Implementation depends on your database setup
  // Example with MySQL:
  /*
  const query = `
    DELETE FROM refresh_tokens
    WHERE user_id = ? AND token = ?
  `;
  await db.query(query, [userId, token]);
  */
};

const invalidateAllUserTokens = async (userId) => {
  // Implementation depends on your database setup
  // Example with MySQL:
  /*
  const query = `
    DELETE FROM refresh_tokens
    WHERE user_id = ?
  `;
  await db.query(query, [userId]);
  */
};

module.exports = {
  storeRefreshToken,
  verifyRefreshToken,
  invalidateRefreshToken,
  invalidateAllUserTokens
};
```

## Frontend Implementation

### Frontend Dependencies

No additional dependencies are required for the frontend implementation.

### Authentication Context

Create a new file `demo/src/context/AuthContext.js`:

```javascript
// demo/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';

// Create context
export const AuthContext = createContext();

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status', {
          credentials: 'include' // Important for sending cookies
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success') {
            setUser(data.user);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setError('Failed to check authentication status');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthStatus();
  }, []);

  // Login function
  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include' // Important for receiving cookies
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setUser(data.user);
        return { success: true, user: data.user };
      } else {
        setError(data.message || 'Login failed');
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error during login');
      return { success: false, message: 'Network error' };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include' // Important for sending cookies
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setUser(null);
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, message: 'Network error' };
    } finally {
      setLoading(false);
    }
  };

  // Value to be provided by the context
  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Protected Routes

Create a new file `demo/src/components/ProtectedRoute.js`:

```javascript
// demo/src/components/ProtectedRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // You could render a loading spinner here
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    // Redirect to login page, but save the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is authenticated, render the protected component
  return children;
};

export default ProtectedRoute;
```

### Component Modifications

Update your `demo/src/App.js` file to include the AuthProvider and protected routes:

```javascript
import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import SavedProperties from "./pages/SavedProperties";
import Profile from "./pages/Profile";
import MarketStatistics from "./pages/MarketStatistics";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Protected routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/search" element={
              <ProtectedRoute>
                <Search />
              </ProtectedRoute>
            } />
            <Route path="/saved-properties" element={
              <ProtectedRoute>
                <SavedProperties />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/market-statistics" element={
              <ProtectedRoute>
                <MarketStatistics />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
```

Update your `demo/src/pages/Login.js` file:

```javascript
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// SPLINE SCENE TEMPORARILY DISABLED
// To re-enable, uncomment the import statement below and the SplineBackground component in the return section
// import SplineBackground from "../components/SplineBackground";
import "./Auth.css";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState(""); // "success" or "error"
    const [isLoading, setIsLoading] = useState(false);
    
    const navigate = useNavigate();
    const location = useLocation();
    const { login } = useAuth();
    
    // Get the redirect path from location state or default to /dashboard
    const from = location.state?.from?.pathname || "/dashboard";

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");
        setMessageType("");
        setIsLoading(true);
        
        try {
            const result = await login(email, password);
            
            if (result.success) {
                setMessageType("success");
                setMessage("Login successful! Redirecting...");
                
                // Redirect to the page the user was trying to access, or dashboard
                setTimeout(() => navigate(from), 1500);
            } else {
                setMessageType("error");
                
                // Provide specific error messages based on the server response
                if (result.message && result.message.includes("Invalid credentials")) {
                    setMessage("Invalid email or password. Please try again.");
                } else if (result.message && result.message.includes("not found")) {
                    setMessage("Email not registered. Please check your email or sign up for an account.");
                } else {
                    setMessage(result.message || "Login failed. Please try again.");
                }
            }
        } catch (error) {
            console.error("Login error:", error);
            setMessageType("error");
            setMessage("An unexpected error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* SPLINE SCENE TEMPORARILY DISABLED
              * To re-enable, remove these comment markers and uncomment the component below */}
            {/* <SplineBackground 
                sceneUrl="https://prod.spline.design/AlMO0fHr7OoFL8Pz/scene.splinecode"
            /> */}
            <form onSubmit={handleSubmit}>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    disabled={isLoading}
                />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Login"}
                </button>
            </form>
            {message && (
                <div className={`message ${messageType}`}>
                    {message}
                </div>
            )}
            <div className="auth-links">
                <p>
                    Don't have an account? <a href="/signup">Sign Up</a>
                </p>
                <p>
                    <a href="/forgot-password">Forgot Password?</a>
                </p>
            </div>
        </div>
    );
};

export default Login;
```

Update your `demo/src/pages/Dashboard.js` file:

```javascript
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
// SPLINE SCENE TEMPORARILY DISABLED
// To re-enable, uncomment the import statement below and the SplineBackground component in the return section
// import SplineBackground from "../components/SplineBackground";
import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSearch = () => {
    navigate("/search");
  };

  const handleMarketStats = () => {
    navigate("/market-statistics");
  };

  const handleProfile = () => {
    navigate("/profile");
  };

  const handleLogout = async () => {
    // Use the logout function from AuthContext
    const result = await logout();
    
    if (result.success) {
      // Redirect to landing page
      navigate("/");
    } else {
      // Handle logout failure
      console.error("Logout failed:", result.message);
      // You could show an error message to the user here
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-taskbar">
        <button onClick={handleSearch}>Search</button>
        <button onClick={handleMarketStats}>Market Statistics</button>
        <button onClick={handleProfile}>Profile</button>
        <button onClick={handleLogout}>Logout</button>
      </div>
      <div className="dashboard-content">
        {/* Welcome message with user's name */}
        {user && (
          <div className="welcome-message">
            <h1>Welcome, {user.name}!</h1>
          </div>
        )}
        
        {/* 
         * SPLINE SCENE TEMPORARILY DISABLED
         * To re-enable, remove these comment markers and uncomment the component below
         */}
        {/* <SplineBackground 
          sceneUrl="https://prod.spline.design/R31YUaRL3bLxFmRl/scene.splinecode"
          className="dashboard-spline"
        /> */}
        <div className="saved-properties-container">
          <h2>Saved Properties</h2>
          <p>Your saved properties will appear here.</p>
          
          {/* Saved properties implementation as in original file */}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

## Security Considerations

1. **JWT Secret Keys**:
   - Use strong, unique secrets for both access and refresh tokens
   - Store secrets securely (environment variables, secret management service)
   - Rotate secrets periodically

2. **Cookie Security**:
   - Always use `HttpOnly` flag to prevent JavaScript access
   - Use `Secure` flag in production to ensure HTTPS-only
   - Use `SameSite=Strict` to prevent CSRF attacks
   - Set appropriate expiration times

3. **CSRF Protection**:
   - For mutation operations, consider implementing CSRF tokens
   - The `SameSite=Strict` cookie attribute helps mitigate CSRF

4. **Token Validation**:
   - Always validate tokens on the server side
   - Check expiration time
   - Verify signature
   - Validate claims

5. **Refresh Token Rotation**:
   - Implement one-time use refresh tokens for enhanced security
   - When a refresh token is used, invalidate it and issue a new one

6. **Token Revocation**:
   - Implement a mechanism to revoke refresh tokens
   - Consider a token blacklist for critical security events

7. **Error Handling**:
   - Don't expose sensitive information in error messages
   - Log authentication failures for security monitoring

## Testing

Test your authentication system thoroughly:

1. **Login Flow**:
   - Successful login with valid credentials
   - Failed login with invalid credentials
   - Cookie setting and HTTP-only flag

2. **Protected Routes**:
   - Access with valid token
   - Redirect to login when no token is present
   - Redirect to login when token is invalid/expired

3. **Token Refresh**:
   - Automatic refresh when access token expires
   - Failed refresh with invalid refresh token

4. **Logout**:
   - Cookie clearing
   - Refresh token invalidation

5. **Security**:
   - XSS protection (attempt to access cookies via JavaScript)
   - CSRF protection
   - Token validation
