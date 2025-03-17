import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import Login from './components/Login';
import Callback from './components/Callback';
import ChatInterface from './components/ChatInterface';

const AppContainer = styled.div`
  text-align: center;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #282c34;
  color: white;
`;

const Header = styled.header`
  padding: 20px;
  background-color: #1db954;
  color: white;
`;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function App() {
  const [token, setToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // async function verifySession() {
    //   const storedToken = localStorage.getItem('spotify_token');
    //   const storedSessionId = localStorage.getItem('session_id');
    //   const refreshToken = localStorage.getItem('spotify_refresh_token');

    //   if (storedToken && storedSessionId) {
    //     try {
    //       const response = await fetch(`${API_URL}/api/session/verify`, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ sessionId: storedSessionId, token: storedToken, refreshToken }),
    //       });

    //       const data = await response.json();
    //       if (data.valid) {
    //         setToken(data.accessToken);
    //         setSessionId(data.sessionId);
    //         localStorage.setItem('spotify_token', data.accessToken); // Update token
    //       } else {
    //         handleLogout();
    //       }
    //     } catch (error) {
    //       console.error("Session verification failed:", error);
    //       handleLogout();
    //     }
    //   }
    //   setLoading(false);
    // }
    async function verifySession() {
      const storedToken = localStorage.getItem('spotify_token');
      const storedSessionId = localStorage.getItem('session_id');
      const refreshToken = localStorage.getItem('spotify_refresh_token');
    
      if (storedToken && storedSessionId) {
        try {
          const response = await fetch(`${API_URL}/api/session/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: storedSessionId, token: storedToken, refreshToken }),
          });
    
          const data = await response.json();
          if (data.valid) {
            setToken(data.accessToken);
            setSessionId(data.sessionId);
            localStorage.setItem('spotify_token', data.accessToken); // Update token
          } else {
            console.log("Session invalid. Logging out.");
            handleLogout();
          }
        } catch (error) {
          console.error("Session verification failed:", error);
          handleLogout();
        }
      } else {
        console.log("No stored session. Redirecting to login.");
        handleLogout();
      }
      setLoading(false);
    }
    
    

    verifySession();
  }, []);

  const handleLogin = (accessToken, sessionId, refreshToken) => {
    setToken(accessToken);
    setSessionId(sessionId);
    localStorage.setItem('spotify_token', accessToken);
    localStorage.setItem('session_id', sessionId);
    if (refreshToken) {
      localStorage.setItem('spotify_refresh_token', refreshToken);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setSessionId(null);
    localStorage.removeItem('spotify_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('session_id');
    sessionStorage.removeItem('auth_in_progress'); // Ensure it's removed on logout
  };
  
  

  if (loading) {
    return <AppContainer>Loading...</AppContainer>;
  }

  return (
    <Router>
      <AppContainer>
        <Header>
          <h1>Mood Music Recommender</h1>
          {token && <button onClick={handleLogout}>Logout</button>}
        </Header>

        <Routes>
          <Route path="/login" element={token ? <Navigate to="/chat" /> : <Login />} />
          <Route path="/callback" element={<Callback onLogin={handleLogin} />} />
          <Route path="/chat" element={token ? <ChatInterface token={token} sessionId={sessionId} /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={token ? "/chat" : "/login"} />} />
        </Routes>
      </AppContainer>
    </Router>
  );
}

export default App;
