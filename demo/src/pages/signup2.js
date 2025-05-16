import React, { useState } from "react";
import axios from "axios";

// Use the same API URL structure as other components
const API_URL = "http://100.71.100.5:8000/front_to_back_sender.php";

const SignUp = () => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            console.log("Submitting signup with:", { name, email, password });

            // Using axios like in other components
            const response = await axios.post(API_URL, {
                action: "signup",
                username: name,
                email: email,
                password: password
            });

            console.log("Response status:", response.status);
            console.log("Response headers:", response.headers);

            // Axios automatically parses JSON
            const data = response.data;
            console.log("Response data:", data);

            if (data.message && data.message.includes("sent successfully")) {
                setMessage("✅ You are all set, please login to your account");
            } else {
                setMessage(`❌ Signup failed: ${data.message}`);
            }
        } catch (error) {
            console.error("Complete Signup Error:", error);
            setMessage(`❌ Unexpected error: ${error.message}`);
        }
    };

    return (
        <div>
            <h2>Sign Up</h2>
            <form onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    placeholder="Name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                />
                <input 
                    type="email" 
                    placeholder="Email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                />
                <input 
                    type="password" 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                />
                <button type="submit">Sign Up</button>
            </form>
            {message && <p>{message}</p>}
        </div>
    );
};

export default SignUp;
