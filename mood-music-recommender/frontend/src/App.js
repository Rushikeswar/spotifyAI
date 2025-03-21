import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import Login from './components/Login';
import Callback from './components/Callback';
import ChatInterface from './components/ChatInterface';
import axios from 'axios';
import { refreshToken } from "./auth";

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
    async function verifySession() {
      if (!sessionId || !token) {
        console.log("No session or token, redirecting to login.");
        setLoading(false);
        return;
      }
      try {
        const response = await axios.post(`${API_URL}/api/session/verify`, {
          sessionId,
          token,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.valid) {
          const newAccessToken = response.data.accessToken || token;
          setToken(newAccessToken);
          setSessionId(response.data.sessionId || sessionId);
          localStorage.setItem("spotify_token", newAccessToken);
          localStorage.setItem("session_id", response.data.sessionId || sessionId);
        } else {
          handleLogout();
        }
      } catch (error) {
        console.error("Session verification failed:", error);
        handleLogout();
      }
      setLoading(false);
    }
    verifySession();
  }, [sessionId, token]);
  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.removeItem("auth_in_progress");
    window.location.href = "/login";
  };
  const apiRequest = useCallback(
    async (apiFunc, retry = true) => {
      try {
        const response = await apiFunc({
          headers: { Authorization: `Bearer ${token}` },
        });
        return response;
      } catch (error) {
        if (error.response?.status === 401 && retry) {
          console.log("Unauthorized error, attempting token refresh...");
          const newToken = await refreshToken();
          if (newToken) {
            localStorage.setItem("spotify_token", newToken);
            return await apiRequest(apiFunc, false);
          }
        }
        throw error;
      }
    },
    [token]
  );
  

 // ✅ Dependency array updated

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
          <Route path="/login" element={token ? <Navigate to="/chat" /> : <Login apiRequest={apiRequest}/>} />
          <Route path="/callback" element={<Callback apiRequest={apiRequest} onLogin={(t, s, r) => {
          setToken(t);
          setSessionId(s);
          localStorage.setItem("spotify_token", t);
          localStorage.setItem("session_id", s);
          if (r) localStorage.setItem("spotify_refresh_token", r);
        }} />} />
         <Route path="/chat" element={token ? <ChatInterface token={token} sessionId={sessionId} refreshToken={refreshToken} apiRequest={apiRequest}/> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={token ? "/chat" : "/login"} />} />
        </Routes>
      </AppContainer>
    </Router>
  );
}

// ✅ Axios Interceptors for Handling Token Expiry
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshToken();
        if (newToken) {
          localStorage.setItem("spotify_token", newToken);
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return axios(originalRequest);
        }
      } catch (refreshError) {
        console.error("Token refresh failed, logging out:", refreshError);
      }
    }

    localStorage.clear();
    sessionStorage.removeItem("auth_in_progress");
    window.location.href = "/login";

    return Promise.reject(error);
  }
);


export default App;
