// SignUp.js
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import SplineBackground from "../components/SplineBackground";
import "./Auth.css";

const SignUp = () => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState(""); // "success" or "error"
    const [isLoading, setIsLoading] = useState(false);
    
    const navigate = useNavigate();
    const { signup, user } = useAuth();
    
    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            navigate("/dashboard");
        }
    }, [user, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage("");
        setMessageType("");

        try {
            const { success, message } = await signup(name, email, password);
            
            if (success) {
                setMessageType("success");
                setMessage("Registration successful! You can now log in to your account.");
                
                // Clear the form
                setName("");
                setEmail("");
                setPassword("");
                
                // Redirect to login page after 2 seconds
                setTimeout(() => {
                    navigate("/login");
                }, 2000);
            } else {
                setMessageType("error");
                setMessage(message || "Registration failed. Please try again.");
            }
        } catch (err) {
            console.error("Signup error:", err);
            setMessageType("error");
            setMessage("An unexpected error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <SplineBackground 
                sceneUrl="https://prod.spline.design/KFDZ6CKKnsor93Y6/scene.splinecode"
            />
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength="8"
                />
                <button type="submit" disabled={isLoading}>
                    {isLoading ? "Creating Account..." : "Sign Up"}
                </button>
            </form>
            {message && (
                <div className={`message ${messageType}`}>
                    {message}
                </div>
            )}
            <div className="auth-links">
                <p>
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </div>
        </div>
    );
};

export default SignUp;
