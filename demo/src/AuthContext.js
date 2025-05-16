// AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

axios.defaults.timeout = 5000;           // Wait up to 5 seconds before erroring
axios.defaults.withCredentials = true;

const AuthContext = createContext();

// Use the same API URL structure as Search.js and MarketStatistics.js
const API_URL = "http://100.71.100.5:8000/front_to_back_sender.php";

// Set a longer timeout for API requests (60 seconds)
const API_TIMEOUT = 60000; // 60 seconds in milliseconds

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if user is already logged in on page load
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    verifyAuth();
  }, []);

  // Verify authentication with the server
  const verifyAuth = async () => {
    try {
      setLoading(true);
      // Using axios like in Search.js and MarketStatistics.js
      const response = await axios.post(API_URL, {
        action: 'verify_auth'
      }, {
        withCredentials: true, // Include cookies
        timeout: API_TIMEOUT // Set longer timeout
      });

      const data = response.data;

      if (data.status === 'success') {
        // User is authenticated
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        // Try to refresh token
        await refreshToken();
      }
    } catch (err) {
      console.error('Auth verification error:', err);
      setError('Authentication verification failed');
      // Don't logout on network errors if we have a user in localStorage
      if (!localStorage.getItem('user')) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh access token using refresh token
  const refreshToken = async () => {
    try {
      const response = await axios.post(API_URL, {
        action: 'refresh_token'
      }, {
        withCredentials: true, // Include cookies
        timeout: API_TIMEOUT // Set longer timeout
      });

      const data = response.data;

      if (data.status === 'success') {
        // Token refreshed, verify auth again
        await verifyAuth();
      } else {
        // Refresh token invalid, logout
        logout();
      }
    } catch (err) {
      console.error('Token refresh error:', err);
      // Don't logout on network errors if we have a user in localStorage
      if (!localStorage.getItem('user')) {
        logout();
      }
    }
  };

  // Login function
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(API_URL, {
        action: 'login',
        email,
        password
      }, {
        withCredentials: true, // Include cookies
        timeout: API_TIMEOUT // Set longer timeout
      });

      const data = response.data;

      if (data.status === 'success') {
        // Set user data in state and localStorage
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        return { success: true, message: data.message };
      } else {
        setError(data.message || 'Login failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Signup function
  const signup = async (name, email, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(API_URL, {
        action: 'signup',
        name,
        email,
        password
      }, {
        timeout: API_TIMEOUT // Set longer timeout
      });

      const data = response.data;

      if (data.status === 'success') {
        return { success: true, message: data.message };
      } else {
        setError(data.message || 'Signup failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Update user profile function
  const updateProfile = async (userData) => {
    try {
      setLoading(true);
      setError(null);

      console.log('Updating profile with data:', userData);
      console.log('Current user:', user);

      const requestData = {
        action: 'updateProfile',
        ...userData,
        user_id: user?.id
      };

      console.log('Sending request data:', requestData);

      const response = await axios.post(API_URL, requestData, {
        withCredentials: true, // Include cookies
        timeout: API_TIMEOUT // Set longer timeout
      });

      console.log('Profile update response:', response.data);

      const data = response.data;

      if (data.status === 'success') {
        // Update user data in state and localStorage
        const updatedUser = { ...user, ...userData };
        // Remove password fields from the updated user object
        delete updatedUser.currentPassword;
        delete updatedUser.newPassword;
        delete updatedUser.confirmPassword;
        
        console.log('Updated user data:', updatedUser);
        
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        return { success: true, message: data.message || 'Profile updated successfully' };
      } else {
        console.error('Profile update failed:', data.message);
        setError(data.message || 'Profile update failed');
        return { success: false, message: data.message || 'Profile update failed' };
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setLoading(true);
      
      // Send logout request if user exists
      if (user) {
        await axios.post(API_URL, {
          action: 'logout',
          user_id: user.id
        }, {
          withCredentials: true, // Include cookies
          timeout: API_TIMEOUT // Set longer timeout
        });
      }
      
      // Clear user data regardless of server response
      setUser(null);
      localStorage.removeItem('user');
      
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Forgot password function
  const forgotPassword = async (email) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(API_URL, {
        action: 'forgotPassword',
        email
      }, {
        timeout: API_TIMEOUT // Set longer timeout
      });

      const data = response.data;

      if (data.status === 'success') {
        return { success: true, message: data.message };
      } else {
        setError(data.message || 'Password reset failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error. Please try again.' };
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        signup,
        logout,
        forgotPassword,
        verifyAuth,
        refreshToken,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
