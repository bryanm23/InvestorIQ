// Login.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import SplineBackground from "../components/SplineBackground";
import "./Auth.css";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState(""); // "success" or "error"
    const [isLoading, setIsLoading] = useState(false);
    
    const navigate = useNavigate();
    const { login, user } = useAuth();
    
    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            navigate("/dashboard");
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");
        setMessageType("");
        setIsLoading(true);
        
        try {
            const { success, message } = await login(email, password);
            
            if (success) {
                setMessageType("success");
                setMessage("Login successful! Redirecting to dashboard...");
                
                // Redirect to dashboard after a short delay
                setTimeout(() => navigate("/dashboard"), 1500);
            } else {
                setMessageType("error");
                setMessage(message || "Login failed. Please try again.");
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
            <SplineBackground 
                sceneUrl="https://prod.spline.design/AlMO0fHr7OoFL8Pz/scene.splinecode"
            />
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
                    Don't have an account? <Link to="/signup">Sign Up</Link>
                </p>
                <p>
                    <Link to="/forgot-password">Forgot Password?</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
