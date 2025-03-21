import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import Login from './components/Login';
import Callback from './components/Callback';
import ChatInterface from './components/ChatInterface';
import axios from 'axios';
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
// Add this to App.js

function App() {
  const [token, setToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshToken = async () => {
    const refreshToken = localStorage.getItem('spotify_refresh_token');
    const sessionId = localStorage.getItem('session_id');
    
    if (!refreshToken || !sessionId) {
      throw new Error('No refresh token or session ID available');
    }
    
    try {
      const response = await axios.post(`${API_URL}/api/spotify/refresh`, {
        refreshToken,
        sessionId
      });
      
      if (response.data.accessToken) {
        const newToken = response.data.accessToken;
        localStorage.setItem('spotify_token', newToken);
        setToken(newToken);
        return newToken;
      } else {
        throw new Error('No access token in response');
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      handleLogout();
      throw error;
    }
  };
  useEffect(() => {
      async function verifySession() {
        const storedToken = localStorage.getItem('spotify_token');
        const storedSessionId = localStorage.getItem('session_id');
        const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
      
        if (storedSessionId) {
          try {
            // Try to verify and refresh token if needed
            const response = await fetch(`${API_URL}/api/session/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                sessionId: storedSessionId, 
                token: storedToken, 
                refreshToken: storedRefreshToken 
              }),
            });
      
            const data = await response.json();
            if (data.valid) {
              setToken(data.accessToken);
              setSessionId(data.sessionId);
              // Update localStorage with potentially refreshed token
              localStorage.setItem('spotify_token', data.accessToken);
              localStorage.setItem('session_id', data.sessionId);
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
          <Route path="/chat" element={token ? <ChatInterface token={token} sessionId={sessionId} refreshToken={refreshToken} /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={token ? "/chat" : "/login"} />} />
        </Routes>
      </AppContainer>
    </Router>
  );
}

// Set up axios interceptors
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If the error status is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        const sessionId = localStorage.getItem('session_id');
        
        if (refreshToken && sessionId) {
          const response = await axios.post(`${API_URL}/api/spotify/refresh`, {
            refreshToken,
            sessionId
          });
          
          if (response.data.accessToken) {
            localStorage.setItem('spotify_token', response.data.accessToken);
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.accessToken}`;
            originalRequest.headers['Authorization'] = `Bearer ${response.data.accessToken}`;
            return axios(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error("Token refresh interceptor failed:", refreshError);
      }
      
      // If refresh failed, redirect to login
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);
export default App;
