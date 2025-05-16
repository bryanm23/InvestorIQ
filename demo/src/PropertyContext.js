// src/PropertyContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

axios.defaults.timeout = 10000;           // Wait up to 5 seconds before erroring
axios.defaults.withCredentials = true;

const PropertyContext = createContext();

// Use the same API URL structure as Search.js and MarketStatistics.js
const API_URL = "http://100.71.100.5:8000/property_manager_sender.php";

export const PropertyProvider = ({ children }) => {
  const [savedProperties, setSavedProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Add event listener for page refresh
  useEffect(() => {
    // Function to handle page refresh
    const handleBeforeUnload = () => {
      // Clear the flag when the page is refreshed
      sessionStorage.removeItem('propertiesLoaded');
    };

    // Add event listener for page refresh
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function to remove event listener
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Load saved properties when user logs in or when the component mounts (page refresh)
  useEffect(() => {
    if (user) {
      // Set a flag in sessionStorage to track if we've already loaded properties in this session
      const hasLoadedProperties = sessionStorage.getItem('propertiesLoaded');
      
      if (!hasLoadedProperties) {
        fetchSavedProperties();
        // Mark that we've loaded properties in this session
        sessionStorage.setItem('propertiesLoaded', 'true');
      }
    } else {
      setSavedProperties([]);
      // Clear the flag when user logs out
      sessionStorage.removeItem('propertiesLoaded');
    }
  }, [user]);

  // Fetch saved properties from the backend
  const fetchSavedProperties = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.post(API_URL, {
        action: 'getSavedProperties',
        user_id: user.id
      }, {
        withCredentials: true // Include cookies
      });
      
      const data = response.data;
      
      if (data.status === 'success') {
        setSavedProperties(data.properties || []);
      } else {
        setError(data.message || 'Failed to fetch saved properties');
        console.error('Error fetching saved properties:', data.message);
      }
    } catch (err) {
      setError('Network error while fetching saved properties');
      console.error('Error fetching saved properties:', err);
    } finally {
      setLoading(false);
    }
  };

  // Save a property
  const saveProperty = async (property) => {
    if (!user) return { success: false, message: 'You must be logged in to save properties' };
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("Saving property:", property);
      
      const response = await axios.post(API_URL, {
        action: 'saveProperty',
        user_id: user.id,
        property_id: property.id,
        address: property.address,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        sqft: property.sqft,
        property_type: property.property_type,
        image_url: property.image_url
      }, {
        withCredentials: true, // Include cookies
        timeout: 40000
      });
      
      const data = response.data;
      
      if (data.status === 'success') {
        // Add the property to the local state
        setSavedProperties(prev => [property, ...prev]);
        
        // Update the sessionStorage flag to ensure properties are reloaded when needed
        sessionStorage.setItem('propertiesLoaded', 'true');
        
        return { success: true, message: 'Property saved successfully' };
      } else {
        setError(data.message || 'Failed to save property');
        console.error('Error saving property:', data.message);
        return { success: false, message: data.message || 'Failed to save property' };
      }
    } catch (err) {
      setError('Network error while saving property');
      console.error('Error saving property:', err);
      return { success: false, message: 'Network error while saving property' };
    } finally {
      setLoading(false);
    }
  };

  // Delete a saved property
  const deleteProperty = async (propertyId) => {
    if (!user) return { success: false, message: 'You must be logged in to delete saved properties' };
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("Deleting property:", propertyId);
      
      const response = await axios.post(API_URL, {
        action: 'deleteSavedProperty',
        user_id: user.id,
        property_id: propertyId
      }, {
        withCredentials: true, // Include cookies
        timeout: 40000
      });
      
      const data = response.data;
      
      if (data.status === 'success') {
        // Remove the property from the local state
        setSavedProperties(prev => prev.filter(p => p.property_id !== propertyId));
        
        // Update the sessionStorage flag to ensure properties are reloaded when needed
        sessionStorage.setItem('propertiesLoaded', 'true');
        
        return { success: true, message: 'Property removed from saved list' };
      } else {
        setError(data.message || 'Failed to delete property');
        console.error('Error deleting property:', data.message);
        return { success: false, message: data.message || 'Failed to delete property' };
      }
    } catch (err) {
      setError('Network error while deleting property');
      console.error('Error deleting property:', err);
      return { success: false, message: 'Network error while deleting property' };
    } finally {
      setLoading(false);
    }
  };

  // Check if a property is saved
  const isPropertySaved = (propertyId) => {
    return savedProperties.some(p => p.property_id === propertyId);
  };

  return (
    <PropertyContext.Provider
      value={{
        savedProperties,
        loading,
        error,
        fetchSavedProperties,
        saveProperty,
        deleteProperty,
        isPropertySaved
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
};

export const useProperty = () => useContext(PropertyContext);

export default PropertyContext;
