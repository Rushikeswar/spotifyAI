import React, { useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';

const LoginContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 70vh;
`;

const LoginButton = styled.button`
  background-color: #1db954;
  color: white;
  border: none;
  border-radius: 30px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  margin-top: 20px;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #1ed760;
    transform: scale(1.05);
  }
  
  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const Description = styled.p`
  max-width: 600px;
  line-height: 1.6;
  margin-bottom: 30px;
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

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

function Login({apiRequest}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest(async () => axios.get(`${API_URL}/api/spotify/login`));

      window.location.href = response.data.url;
    } catch (error) {
      console.error('Login error:', error);
      setError('Failed to connect to Spotify. Please try again later.');
      setIsLoading(false);
    }
  };
  
  return (
    <LoginContainer>
      <h2>Welcome to Mood Music Recommender</h2>
      <Description>
        Chat with our AI to discover personalized music recommendations based on your mood.
      </Description>
      <LoginButton onClick={handleLogin} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Login with Spotify'}
      </LoginButton>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </LoginContainer>
  );
}

export default Login;
