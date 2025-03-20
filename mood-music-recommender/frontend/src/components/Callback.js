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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Callback({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

//   useEffect(() => {
//     // Using ref to track if the effect has run
//     const authInProgress = sessionStorage.getItem('auth_in_progress');
    
//     if (authInProgress === 'true') {
//       console.log('Auth already in progress, preventing duplicate execution');
//       return;
//     }
    
//     sessionStorage.setItem('auth_in_progress', 'true');
    
//     const handleCallback = async () => {
//       try {
//         // Get the authorization code from URL
//         const code = new URLSearchParams(location.search).get('code');
//         if (!code) {
//           setError("Missing authorization code.");
//           setLoading(false);
//           navigate('/login');
//           return;
//         }
        
//         console.log('Processing authorization code:', code);
        
//         // Exchange code for tokens
//         const response = await axios.post(`${API_URL}/api/spotify/callback`, { code });
        
//         if (response.data.accessToken) {
//           console.log('Received access token');
          
//           // Get a session ID for the new token
//           const sessionResponse = await axios.post(`${API_URL}/api/session/verify`, {
//             token: response.data.accessToken,
//             refreshToken: response.data.refreshToken || null
//           });
          
//           if (sessionResponse.data.valid) {
//             // Save everything to localStorage
//             localStorage.setItem('spotify_token', response.data.accessToken);
//             localStorage.setItem('session_id', sessionResponse.data.sessionId);
            
//             if (response.data.refreshToken) {
//               localStorage.setItem('spotify_refresh_token', response.data.refreshToken);
//             }
            
//             onLogin(response.data.accessToken, sessionResponse.data.sessionId, response.data.refreshToken);
            
//             // Clear auth_in_progress flag
//             sessionStorage.removeItem('auth_in_progress');
            
//             // Navigate to chat
//             navigate('/chat');
//           } else {
//             throw new Error("Failed to create session.");
//           }
//         } else {
//           throw new Error("No access token received.");
//         }
//       } catch (err) {
//         console.error("Spotify Callback Error:", err);
//         setError("Authentication failed. Please try again.");
        
//         // Clear auth_in_progress flag on error
//         sessionStorage.removeItem('auth_in_progress');
        
//         navigate('/login');
//       } finally {
//         setLoading(false);
//       }
//     };
    
//     // Check if we already have a valid token
//     const storedToken = localStorage.getItem('spotify_token');
//     const storedSessionId = localStorage.getItem('session_id');
    
//     // if (storedToken && storedSessionId) {
//     //   console.log('Using stored token');
//     //   onLogin(storedToken, storedSessionId);
//     //   sessionStorage.removeItem('auth_in_progress');
//     //   navigate('/chat');
//     // } else {
//     //   handleCallback();
//     // }
    
//     // Cleanup function to remove the in-progress flag if component unmounts
    
//     if (storedToken && storedSessionId) {
//   console.log('Token found, but forcing re-authentication.');
//   handleCallback(); // Always refresh token after logout
// } else {
//   handleCallback();
// }


//     return () => {
//       sessionStorage.removeItem('auth_in_progress');
//     };
//   }, []); // Empty dependency array ensures this runs only once
useEffect(() => {
  const handleCallback = async () => {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) {
      setError("Missing authorization code.");
      setLoading(false);
      navigate('/login');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/api/spotify/callback`, { code });
      if (response.data.accessToken) {
        const sessionResponse = await axios.post(`${API_URL}/api/session/verify`, {
          token: response.data.accessToken,
          refreshToken: response.data.refreshToken || null,
        });

        if (sessionResponse.data.valid) {
          localStorage.setItem('spotify_token', response.data.accessToken);
          localStorage.setItem('session_id', sessionResponse.data.sessionId);
          if (response.data.refreshToken) {
            localStorage.setItem('spotify_refresh_token', response.data.refreshToken);
          }
          onLogin(response.data.accessToken, sessionResponse.data.sessionId, response.data.refreshToken);
          navigate('/chat');
        } else {
          throw new Error("Failed to create session.");
        }
      } else {
        throw new Error("No access token received.");
      }
    } catch (err) {
      console.error("Spotify Callback Error:", err);
      setError("Authentication failed. Please try again.");
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  handleCallback();
}, [location, navigate, onLogin]);
  return (
    <CallbackContainer>
      {loading ? <p>Authenticating with Spotify...</p> : error && <p>{error}</p>}
    </CallbackContainer>
  );
}

export default Callback;