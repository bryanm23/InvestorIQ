// src/pages/Dashboard.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { useProperty } from "../PropertyContext";
import Spline from '@splinetool/react-spline';
import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { 
    savedProperties, 
    loading, 
    error, 
    fetchSavedProperties,
    deleteProperty 
  } = useProperty();

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
    await logout();
    navigate("/");
  };

  const handleRemoveProperty = async (propertyId) => {
    if (window.confirm("Are you sure you want to remove this property from your saved list?")) {
      try {
        const result = await deleteProperty(propertyId);
        if (!result.success) {
          // Show error message only if there's an error
          alert(result.message);
        }
        // No need to trigger a refresh as the PropertyContext already updates the state
      } catch (error) {
        console.error("Error removing property:", error);
        alert("An error occurred while removing the property");
      }
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-spline">
        <Spline scene="https://prod.spline.design/R31YUaRL3bLxFmRl/scene.splinecode" />
      </div>
      <div className="dashboard-taskbar">
        <button onClick={handleSearch}>Search</button>
        <button onClick={handleMarketStats}>Market Statistics</button>
        <button onClick={handleProfile}>Profile</button>
        <button onClick={handleLogout}>Logout</button>
      </div>
      <div className="dashboard-content">
        <div className="saved-properties-container">
          <div className="saved-properties-header">
            <h2>Saved Properties</h2>
            {user && <p className="welcome-message">Welcome, {user.name}!</p>}
            <div className="header-buttons">
              <button 
                className="search-properties-btn"
                onClick={() => navigate('/search')}
              >
                Search for Properties
              </button>
              <button 
                className="refresh-properties-btn"
                onClick={() => {
                  // Clear the sessionStorage flag to force a refresh
                  sessionStorage.removeItem('propertiesLoaded');
                  // Fetch saved properties
                  fetchSavedProperties();
                }}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh Properties'}
              </button>
            </div>
          </div>
          
          {loading && <p className="loading-message">Loading saved properties...</p>}
          {error && <p className="error-message">{error}</p>}
          
          {savedProperties.length > 0 ? (
            <div className="saved-properties-list">
              {savedProperties.map((property) => (
                <div key={property.property_id} className="property-card">
                  <div className="property-image">
                    {property.image_url ? (
                      <img 
                        src={property.image_url} 
                        alt={property.address}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://via.placeholder.com/300x200?text=No+Image";
                        }}
                      />
                    ) : (
                      <div className="no-image">No Image Available</div>
                    )}
                  </div>
                  <div className="property-details">
                    <h3>{property.address}</h3>
                    <p className="property-price">{formatPrice(property.price)}</p>
                    <p className="property-features">
                      <span className="feature">{property.bedrooms} bed</span> • 
                      <span className="feature">{property.bathrooms} bath</span> • 
                      <span className="feature">{property.sqft} sqft</span>
                    </p>
                    <p className="property-type">{property.property_type}</p>
                    <div className="property-actions">
                      <button
                        className="view-details-btn"
                        onClick={() => navigate(`/search?propertyId=${property.property_id}`)}
                      >
                        View Details
                      </button>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveProperty(property.property_id)}
                        title="Remove from saved properties"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="no-properties-message">
                <p>No saved properties found.</p>
                <p>Use the Search feature to find and save properties you're interested in.</p>
                <button 
                  className="search-now-btn"
                  onClick={() => navigate('/search')}
                >
                  Search Now
                </button>
              </div>
            )
          )}
        </div>
        
        <div className="dashboard-stats">
          <h3>Your Property Stats</h3>
          <div className="stats-container">
            <div className="stat-card">
              <div className="stat-value">{savedProperties.length}</div>
              <div className="stat-label">Saved Properties</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {savedProperties.length > 0 
                  ? formatPrice(savedProperties.reduce((sum, prop) => sum + Number(prop.price || 0), 0) / savedProperties.length) 
                  : '$0'}
              </div>
              <div className="stat-label">Average Price</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
