import React from "react";
import { Link, useNavigate } from "react-router-dom";
import Spline from "@splinetool/react-spline";
import "./LandingPage.css";
import backgroundImage from "../background-island.png";

const LandingPage = () => {
  const navigate = useNavigate();
  
  const containerStyle = {
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  };
  
  function onLoad(spline) {
    // Map of object IDs to their corresponding routes
    const objectRoutes = {
      // Signup buttons
      "c1ad8f9e-23b9-4089-b3f7-b3aed354be4e": "/signup", // black
      "0a61c546-a417-44fe-a34d-0b697f559728": "/signup", // white
      
      // Login buttons
      "b3bbb600-8800-4a7f-b22c-ec26ebd7b0af": "/login", // black
      "cff611a9-15ec-4dd7-adfd-b4a927c81a6a": "/login"  // white
    };
    
    // Set up event listeners for all objects
    Object.entries(objectRoutes).forEach(([objectId, route]) => {
      const object = spline.findObjectById(objectId);
      if (object && typeof object.addEventListener === 'function') {
        object.addEventListener("mouseDown", () => {
          navigate(route);
        });
      } else {
        console.log(`Object with ID ${objectId} doesn't support addEventListener or wasn't found`);
      }
    });
  }

  return (
    <div className="landing-page">
      <div className="landing-taskbar">
        <div className="taskbar-left">
          <span className="taskbar-logo">InvestorIQ</span>
        </div>
        <div className="taskbar-center">
          <span className="taskbar-description">Find, analyze, and save properties with ease.</span>
        </div>
        <div className="taskbar-right">
          <Link to="/signup" className="taskbar-button">Sign Up</Link>
          <Link to="/login" className="taskbar-button">Log In</Link>
          <a href="/about" className="taskbar-button" target="_blank" rel="noopener noreferrer">About Us</a>
        </div>
      </div>
      
      <div className="landing-container" style={containerStyle}>
        <Spline 
          scene="https://prod.spline.design/a3s6JFRdqNflq43Y/scene.splinecode"
          onLoad={onLoad}
        />
        
        {/* Content area is intentionally left empty for the Spline scene */}
      </div>
    </div>
  );
};

export default LandingPage;
