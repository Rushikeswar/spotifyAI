import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import styled from 'styled-components';

const CallbackContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 70vh;
`;

const ErrorMessage = styled.div`
  color: #e74c3c;
  margin-top: 15px;
  padding: 10px;
  border-radius: 5px;
  background-color: rgba(231, 76, 60, 0.1);
  max-width: 600px;
  text-align: center;
`;

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Callback({ onLogin,apiRequest }) {  
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingStep, setProcessingStep] = useState('Initializing...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code from URL
        const code = new URLSearchParams(location.search).get('code');
        if (!code) {
          setError("Missing authorization code.");
          setLoading(false);
          navigate('/login');
          return;
        }
        
        setProcessingStep('Exchanging authorization code for tokens...');
        console.log('Processing authorization code:', code.substring(0, 10) + '...');
        
        // Exchange code for tokens
        const response = await apiRequest(async () => axios.post(`${API_URL}/api/spotify/callback`, { code }));

        
        if (!response.data.accessToken) {
          throw new Error("No access token received from server");
        }
        
        console.log('Received access token:', response.data.accessToken.substring(0, 10) + '...');
        
        // Get a session ID for the new token
        setProcessingStep('Creating session...');
        const sessionResponse = await apiRequest(async () => 
          axios.post(`${API_URL}/api/session/verify`, {
            token: response.data.accessToken,
            refreshToken: response.data.refreshToken || null
          })
        );
        
        
        if (!sessionResponse.data.valid) {
          throw new Error("Failed to create or validate session");
        }
        
        // Save everything to localStorage
        localStorage.setItem('spotify_token', response.data.accessToken);
        localStorage.setItem('session_id', sessionResponse.data.sessionId);
        
        if (response.data.refreshToken) {
          localStorage.setItem('spotify_refresh_token', response.data.refreshToken);
        }
        
        console.log('Session created successfully:', sessionResponse.data.sessionId);
        setProcessingStep('Authentication complete!');
        
        // Call the onLogin callback
        onLogin(response.data.accessToken, sessionResponse.data.sessionId, response.data.refreshToken);
        
        // Navigate to chat
        navigate('/chat');
      } catch (err) {
        console.error("Spotify Callback Error:", err);
        
        let errorMessage = "Authentication failed. ";
        
        if (err.response?.data?.error) {
          errorMessage += err.response.data.error;
        } else if (err.message) {
          errorMessage += err.message;
        } else {
          errorMessage += "Please try again.";
        }
        
        setError(errorMessage);
        setLoading(false);
        
        // Wait a bit before redirecting on error
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [location, navigate, onLogin]);

  return (
    <CallbackContainer>
      {loading ? (
        <div>
          <p>Authenticating with Spotify...</p>
          <p>{processingStep}</p>
        </div>
      ) : error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : null}
    </CallbackContainer>
  );
}

export default Callback;