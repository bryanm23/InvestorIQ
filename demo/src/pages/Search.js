import React, { useState, useRef, useEffect } from "react";
import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import axios from "axios";
import { useAuth } from "../AuthContext";
import { useProperty } from "../PropertyContext";
import { useNavigate } from "react-router-dom";
import Spline from '@splinetool/react-spline';
import "./Search.css";

axios.defaults.timeout = 10000; // or 10000 for 10s
axios.defaults.withCredentials = true;

const API_URL = "http://100.71.100.5:8000/rentcast_sender.php";

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
];

const defaultCenter = { lat: 40.742, lng: -74.179 };
const mapContainerStyle = {
  width: "100%",
  height: "100%",
  flex: 1,
  display: "flex",
};

const getUserFriendlyErrorMessage = (error) => {
  const errorMessage = error?.message || '';
  const errorString = String(errorMessage).toLowerCase();
  if (errorString.includes('404') && errorString.includes('no data found')) {
    return "We couldn't find any properties matching your search criteria.";
  }
  if (errorString.includes('api error') || errorString.includes('rentcast')) {
    return "There was a problem connecting to the property database.";
  }
  if (errorString.includes('timeout')) {
    return "The search took too long. Please try again.";
  }
  if (errorString.includes('connection') || errorString.includes('network')) {
    return "Network issue. Please check your connection.";
  }
  return "Something went wrong. Try again with different search parameters.";
};

const Search = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { saveProperty, deleteProperty, isPropertySaved, savedProperties } = useProperty();
  
  const [formData, setFormData] = useState({
    address: "",
    city: "",
    state: "",
    zipCode: "",
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
  });

  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [savingProperties, setSavingProperties] = useState({});
  const [mapZoom, setMapZoom] = useState(15);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mapRef = useRef(null);

  // Function to handle saving/unsaving a property
  const handleSaveProperty = async (e, property) => {
    e.stopPropagation(); // Prevent triggering the card click
    
    if (!user) {
      const confirmLogin = window.confirm("You need to be logged in to save properties. Would you like to go to the login page?");
      if (confirmLogin) {
        navigate("/login");
      }
      return;
    }
    
    const propertyId = property.id || `${property.latitude}_${property.longitude}_${property.formattedAddress}`;
    
    // Set the property as being processed
    setSavingProperties(prev => ({ ...prev, [propertyId]: true }));
    
    try {
      // Check if property is already saved
      const isSaved = isPropertySaved(propertyId);
      
      let result;
      if (isSaved) {
        // Unsave the property
        result = await deleteProperty(propertyId);
        if (result.success) {
          console.log("Property removed from saved list");
        }
      } else {
        // Save the property
        const propertyToSave = {
          id: propertyId,
          property_id: propertyId,
          address: property.formattedAddress,
          price: property.price || property.listPrice || 0,
          bedrooms: property.bedrooms || 0,
          bathrooms: property.bathrooms || 0,
          sqft: property.squareFootage || property.livingArea || 0,
          property_type: property.propertyType || 'Residential',
          image_url: property.streetViewUrl || null
        };
        
        result = await saveProperty(propertyToSave);
        if (result.success) {
          console.log("Property saved successfully");
        }
      }
      
      if (!result.success) {
        console.error("Error with property action:", result.message);
        alert(result.message);
      }
    } catch (error) {
      console.error("Error saving/removing property:", error);
      alert("An error occurred while saving/removing the property");
    } finally {
      // Clear the processing state
      setSavingProperties(prev => {
        const newState = { ...prev };
        delete newState[propertyId];
        return newState;
      });
    }
  };
  
  // Function to navigate to dashboard to view saved properties
  const viewSavedProperties = () => {
    navigate("/dashboard");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProperties([]);

    try {
      const searchResponse = await axios.post(API_URL, {
        action: "rentcast_search",
        params: formData,
      });

      if (searchResponse.data.status !== 'success') {
        throw new Error(searchResponse.data.message || "Search failed");
      }

      const data = searchResponse.data.data;

      if (!data || data.length === 0) {
        setError("No properties found. Try different search parameters.");
        setLoading(false);
        return;
      }

      const updatedProperties = await Promise.all(
        data.map(async (property) => {
          // Generate a consistent property ID
          const propertyId = property.id || `${property.latitude}_${property.longitude}_${property.formattedAddress}`;
          property.id = propertyId;
          
          if (property.latitude && property.longitude) {
            try {
              const streetViewResponse = await axios.post(API_URL, {
                action: "streetView",
                params: {
                  latitude: property.latitude,
                  longitude: property.longitude,
                  size: "600x300",
                  fov: 90,
                  heading: 0,
                  pitch: 0
                }
              });

              if (streetViewResponse.data.status === 'success' && 
                  streetViewResponse.data.data && 
                  streetViewResponse.data.data.url) {
                return {
                  ...property,
                  streetViewUrl: streetViewResponse.data.data.url,
                  hasStreetView: true
                };
              }
            } catch {}
          }
          return {
            ...property,
            streetViewUrl: null,
            hasStreetView: false
          };
        })
      );

      setProperties(updatedProperties);

      if (updatedProperties.length > 0) {
        setMapCenter({
          lat: updatedProperties[0].latitude,
          lng: updatedProperties[0].longitude,
        });
        setMapZoom(17);
      }
    } catch (err) {
      console.error("Search error:", err);
      setError(getUserFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePropertyClick = (property) => {
    if (mapRef.current && property.latitude && property.longitude) {
      const newZoom = Math.min(mapZoom + (mapZoom * 0.7), 20);
      setMapCenter({ lat: property.latitude, lng: property.longitude });
      setMapZoom(newZoom);
      mapRef.current.panTo({ lat: property.latitude, lng: property.longitude });
      mapRef.current.setZoom(newZoom);
    }
  };

  const geocodeAddress = async () => {
    if (formData.address && formData.city && formData.state) {
      try {
        const fullAddress = `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode}`;
        const geocodeResponse = await axios.post(API_URL, {
          action: "geocode",
          params: { address: fullAddress },
        });

        if (geocodeResponse.data.status === 'OK' &&
            geocodeResponse.data.results &&
            geocodeResponse.data.results.length > 0) {
          const { lat, lng } = geocodeResponse.data.results[0].geometry.location;
          setMapCenter({ lat, lng });
          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(15);
          }
        }
      } catch {}
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.address && formData.city && formData.state) {
        geocodeAddress();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData.address, formData.city, formData.state, formData.zipCode]);

  return (
    <div className="search-page">
      <div className="search-container">
        <div className="search-spline">
          <Spline scene="https://prod.spline.design/NSVcsdfW1SF9VkBv/scene.splinecode" />
        </div>
        <div className="search-header">
          <div className="search-title-container">
            {user && (
              <button 
                className="dashboard-btn"
                onClick={viewSavedProperties}
              >
                Dashboard
              </button>
            )}
            <h1>Real Estate Search</h1>
          </div>
          <form onSubmit={handleSubmit} className="search-form">
            {Object.keys(formData).map((field) => (
              <input
                key={field}
                type={field.includes("bed") || field.includes("bath") ? "number" : "text"}
                name={field}
                placeholder={field.replace(/([A-Z])/g, " $1").trim()}
                value={formData[field]}
                onChange={handleChange}
              />
            ))}
            <button type="submit">Search</button>
          </form>
        </div>

        <div className="property-list">
          {loading && <p className="loading">Loading properties...</p>}
          {error && <p className="error">{error}</p>}
          {properties.length > 0 ? (
            properties.map((property, index) => (
              <div key={index} className="property-card" onClick={() => handlePropertyClick(property)}>
                <div className="property-image-container">
                  {property.hasStreetView && property.streetViewUrl ? (
                    <img 
                      src={property.streetViewUrl} 
                      alt="Street View" 
                      className="property-image"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://via.placeholder.com/600x300?text=No+Street+View";
                      }} 
                    />
                  ) : (
                    <div className="no-streetview">
                      <img 
                        src="https://via.placeholder.com/600x300?text=No+Street+View" 
                        alt="No Street View" 
                        className="property-image" 
                      />
                    </div>
                  )}
                </div>
                <div className="property-info">
                  <h2>{property.formattedAddress}</h2>
                  <p><strong>Type:</strong> {property.propertyType || 'Single Family'}</p>
                  <p><strong>Bedrooms:</strong> {property.bedrooms || 'N/A'} | <strong>Bathrooms:</strong> {property.bathrooms || 'N/A'}</p>
                  <p><strong>Size:</strong> {property.squareFootage ? `${property.squareFootage} sq. ft.` : 'N/A'}</p>
                </div>
                <button 
                  className={`save-property-btn ${isPropertySaved(property.id) ? 'saved' : ''}`}
                  onClick={(e) => handleSaveProperty(e, property)}
                  disabled={savingProperties[property.id]}
                  title={isPropertySaved(property.id) ? "Remove from saved properties" : "Save this property to your dashboard"}
                >
                  {savingProperties[property.id] 
                    ? 'Processing...' 
                    : isPropertySaved(property.id) 
                      ? '★ Saved' 
                      : '☆ Save Property'
                  }
                </button>
              </div>
            ))
          ) : (
            !loading && !error && <p className="no-results">No properties found.</p>
          )}
        </div>
      </div>

      <div className="map-container">
        <LoadScript googleMapsApiKey="AIzaSyCB9ZQm7xpe7AFDM9eYa8m0ZQjOVL2U6gQ">
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={mapZoom}
            options={{ styles: darkMapStyle }}
            onLoad={(map) => (mapRef.current = map)}
          >
            {properties.map((property, index) =>
              property.latitude && property.longitude ? (
                <Marker
                  key={index}
                  position={{ lat: property.latitude, lng: property.longitude }}
                  title={property.formattedAddress}
                />
              ) : null
            )}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
};

export default Search;
