import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import SavedProperties from "./pages/SavedProperties";
import Profile from "./pages/Profile";
import MarketStatistics from "./pages/MarketStatistics";
import About from "./pages/About";
import { AuthProvider } from "./AuthContext";
import { PropertyProvider } from "./PropertyContext";
import ProtectedRoute from "./ProtectedRoute";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <PropertyProvider>
        <Router>
          <div className="app-container">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/search" element={<Search />} />
              <Route path="/about" element={<About />} />
              
              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/saved-properties" element={<SavedProperties />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/market-statistics" element={<MarketStatistics />} />
              </Route>
              
              {/* Redirect unknown routes to landing page */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Router>
      </PropertyProvider>
    </AuthProvider>
  );
}

export default App;
