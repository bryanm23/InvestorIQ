// ForgotPassword.js
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import "./Auth.css";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const { forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");
    setMessageType("");
    
    try {
      const { success, message } = await forgotPassword(email);
      
      if (success) {
        setMessageType("success");
        setMessage("Reset link sent! Please check your email and follow the instructions.");
        setEmail(""); // Clear the email field
      } else {
        setMessageType("error");
        setMessage(message || "Could not send reset link. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      setMessageType("error");
      setMessage("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Forgot Password</h2>
      <p>Enter your email to receive a password reset link.</p>
      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          name="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
      
      {message && (
        <div className={`message ${messageType}`}>
          {message}
        </div>
      )}
      
      <div style={{ marginTop: "20px" }}>
        <Link to="/login">Back to Login</Link>
      </div>
    </div>
  );
};

export default ForgotPassword;