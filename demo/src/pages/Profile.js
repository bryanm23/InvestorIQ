import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import "./Profile.css";

const Profile = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState({});

  // Load user data when component mounts
  useEffect(() => {
    if (user) {
      setFormData(prevData => ({
        ...prevData,
        name: user.name || "",
        email: user.email || ""
      }));
    }
  }, [user]);

  const validateForm = () => {
    const newErrors = {};
    
    // Validate name
    if (formData.name.trim() === "") {
      newErrors.name = "Name is required";
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = "Valid email is required";
    }
    
    // Validate password fields if any password field is filled
    if (formData.currentPassword || formData.newPassword || formData.confirmPassword) {
      if (!formData.currentPassword) {
        newErrors.currentPassword = "Current password is required to change password";
      }
      
      if (formData.newPassword.length < 8) {
        newErrors.newPassword = "Password must be at least 8 characters";
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value
    });
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: ""
      });
    }
    
    // Clear any previous messages
    if (message.text) {
      setMessage({ type: "", text: "" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log("Form submission started");
    console.log("Current form data:", formData);
    
    // Validate form
    if (!validateForm()) {
      console.log("Form validation failed");
      return;
    }
    
    setLoading(true);
    setMessage({ type: "", text: "" });
    
    try {
      // Prepare data for update
      const updateData = {
        name: formData.name,
        email: formData.email
      };
      
      // Add password data if password is being changed
      if (formData.currentPassword && formData.newPassword) {
        updateData.currentPassword = formData.currentPassword;
        updateData.newPassword = formData.newPassword;
      }
      
      console.log("Sending update data:", updateData);
      
      // Call the updateProfile function from AuthContext
      const result = await updateProfile(updateData);
      
      console.log("Profile update result:", result);
      
      if (result.success) {
        console.log("Profile update successful");
        setMessage({ type: "success", text: result.message || "Profile updated successfully!" });
        
        // Clear password fields after successful update
        setFormData({
          ...formData,
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
      } else {
        console.error("Profile update failed:", result.message);
        setMessage({ type: "error", text: result.message || "Failed to update profile" });
      }
    } catch (error) {
      console.error("Profile update error:", error);
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <button onClick={handleBack} className="back-button">Back to Dashboard</button>
        <h1>User Profile</h1>
      </div>
      
      <div className="profile-content">
        <div className="profile-avatar">
          <div className="avatar-placeholder">
            <span>{user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U'}</span>
          </div>
          <button className="upload-button">Upload Photo</button>
        </div>
        
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-section">
            <h2>Personal Information</h2>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading || authLoading}
              />
              {errors.name && <div className="error-message">{errors.name}</div>}
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading || authLoading}
              />
              {errors.email && <div className="error-message">{errors.email}</div>}
            </div>
          </div>
          
          <div className="form-section">
            <h2>Change Password</h2>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handleChange}
                disabled={loading || authLoading}
              />
              {errors.currentPassword && <div className="error-message">{errors.currentPassword}</div>}
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                disabled={loading || authLoading}
              />
              {errors.newPassword && <div className="error-message">{errors.newPassword}</div>}
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading || authLoading}
              />
              {errors.confirmPassword && <div className="error-message">{errors.confirmPassword}</div>}
            </div>
          </div>
          
          <button 
            type="submit" 
            className="save-button" 
            disabled={loading || authLoading}
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Profile;
