

//ignore, this was used for testing. idk why its still here tbh, maybe incase we ever need it
//uses express JS instead of that out of date php stuff

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const response = await fetch("http://localhost:8000/front_to_back_sender.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "login",
                    email: email,
                    password: password
                }),
            });

            const data = await response.json();
            if (data.status === "success") {
                setMessage("Welcome back!");
                setTimeout(() => navigate("/search"), 1500);
            } else {
                setMessage(`Login failed: ${data.message}`);
            }
        } catch (err) {
            setMessage("Network error.");
        }
    };

    return (
        <div>
            <h2>Login</h2>
            <form onSubmit={handleSubmit}>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
                <button type="submit">Login</button>
            </form>
            {message && <p>{message}</p>}
        </div>
    );
};

export default Login;
