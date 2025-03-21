import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styled from 'styled-components';
import TrackList from './TrackList';
import SpotifyWebPlayer from './SpotifyWebPlayer';
import { useNavigate } from 'react-router-dom';

const ChatContainer = styled.div`
  display: flex;
  height: calc(100vh - 80px);
  background-color: #121212;
`;

const ChatPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  background-color: #282828;
  border-radius: 10px;
  margin: 10px;
  overflow: hidden;
`;

const MusicPanel = styled.div`
  flex: 1;
  padding: 20px;
  background-color: #282828;
  border-radius: 10px;
  margin: 10px;
  overflow-y: auto;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
`;

const Message = styled.div`
  max-width: 80%;
  padding: 10px 15px;
  border-radius: 18px;
  margin-bottom: 10px;
  word-wrap: break-word;
  background-color: ${props => props.isUser ? '#1DB954' : '#535353'};
  color: white;
  align-self: ${props => props.isUser ? 'flex-end' : 'flex-start'};
`;

const InputForm = styled.form`
  display: flex;
  margin-top: 20px;
`;

const Input = styled.input`
  flex: 1;
  padding: 10px 15px;
  border-radius: 20px;
  border: none;
  background-color: #404040;
  color: white;
  
  &:focus {
    outline: none;
  }
`;

const SendButton = styled.button`
  padding: 10px 20px;
  margin-left: 10px;
  border: none;
  border-radius: 20px;
  background-color: #1DB954;
  color: white;
  cursor: pointer;
  
  &:hover {
    background-color: #1ED760;
  }
`;

const PlayerContainer = styled.div`
  position: fixed;
  bottom: 0;
  width: 100%;
  padding: 10px 0;
  background-color: #181818;
`;
const API_URL = 'http://localhost:5000';
function ChatInterface({ token, sessionId }) {
  const navigate = useNavigate();
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [validatedSessionId, setValidatedSessionId] = useState(sessionId);
  const [validatedToken, setValidatedToken] = useState(token);
  const [messages, setMessages] = useState([
    { text: "Hi there! I'm your mood-based music assistant. How are you feeling today?", isUser: false }
  ]);
  const [input, setInput] = useState('');
  const [tracks, setTracks] = useState([]);
  const [playbackUris, setPlaybackUris] = useState([]);
  const [currentMood, setCurrentMood] = useState('neutral');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const messagesEndRef = useRef(null);

  // Add session verification effect
  useEffect(() => {
    const verifySession = async () => {
      try {
        const storedToken = localStorage.getItem('spotify_token');
        const storedSessionId = localStorage.getItem('session_id');
        const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
  
        if (!storedSessionId || !storedToken) return navigate('/login');
  
        const response = await axios.post(`${API_URL}/api/session/verify`, {
          sessionId: storedSessionId,
          token: storedToken,
          refreshToken: storedRefreshToken
        });
  
        if (response.data.valid) {
          setIsSessionValid(true);
          setValidatedSessionId(response.data.sessionId || storedSessionId);
          setValidatedToken(response.data.accessToken || storedToken);
          
          // Make sure we're always using the most current token
          localStorage.setItem('spotify_token', response.data.accessToken || storedToken);
          localStorage.setItem('session_id', response.data.sessionId || storedSessionId);
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error("Session verification failed:", error);
        navigate('/login');
      }
    };
    verifySession();
  }, [navigate]);
  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/spotify/tracks`, {
          params: { sessionId: validatedSessionId }
        });
        setTracks(response.data.tracks);
      } catch (error) {
        console.error("Failed to fetch tracks:", error);
      }
    };
  
    if (validatedSessionId) {
      fetchTracks();
    }
  }, [validatedSessionId]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !isSessionValid) return;
  
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { text: userMessage, isUser: true }]);
  
    // Add loading message
    const loadingMsgId = Date.now();
    setMessages(prev => [...prev, { id: loadingMsgId, text: "Thinking...", isUser: false, isLoading: true }]);
    
    try {
      const currentToken = localStorage.getItem('spotify_token');
      console.log("Sending chat request with:", {
        message: userMessage,
        sessionId: validatedSessionId,
        token: `${currentToken.substring(0, 10)}...`
      });
  
      const response = await axios.post(`http://localhost:5000/api/chat`, {
        message: userMessage,
        sessionId: validatedSessionId
      });
  
      console.log("Chat API Response:", response.data);
      
      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMsgId));
      
      // Add the actual response
      setMessages(prev => [...prev, { text: response.data.response, isUser: false }]);
  
      if (response.data.tracks && response.data.tracks.length > 0) {
        setTracks(response.data.tracks);
        setPlaybackUris(response.data.tracks.map(track => track.uri));
      }
      
      if (response.data.mood) {
        setCurrentMood(response.data.mood);
      }
    } catch (error) {
      console.error("Chat API Error:", error.response?.data || error.message);
      
      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMsgId));
      
      // Add error message
      setMessages(prev => [...prev, { 
        text: "Sorry, I couldn't process your request. Please try again.", 
        isUser: false 
      }]);
      
      handleApiError(error);
    }
  };
  

  const createPlaylist = async () => {
    if (!tracks.length || !isSessionValid) return;
    setIsCreatingPlaylist(true);
    const name = playlistName || `My ${currentMood.replace('_', ' ')} Playlist`;
    try {
       await axios.post(`http://localhost:5000/api/playlist/create`, {
        name,
        trackUris: tracks.map(track => track.uri),
        sessionId: validatedSessionId
      });
      
      setMessages(prev => [...prev, { 
        text: `Created playlist "${name}" successfully! You can find it in your Spotify account.`, 
        isUser: false 
      }]);
    } catch (error) {handleApiError(error);}
    finally{      setIsCreatingPlaylist(false);
      setPlaylistName('');}
  };

  const handleApiError = async (error) => {
    if (error.response?.status === 401) {
      try {
        const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
        const storedSessionId = localStorage.getItem('session_id');
        
        if (!storedRefreshToken || !storedSessionId) {
          // If we don't have refresh token or session ID, redirect to login
          navigate('/login');
          return;
        }
        
        const response = await axios.post(`${API_URL}/api/spotify/refresh`, {
          refreshToken: storedRefreshToken,
          sessionId: storedSessionId,
        });
  
        if (response.data.accessToken) {
          // Update local storage and state with new token
          localStorage.setItem('spotify_token', response.data.accessToken);
          setValidatedToken(response.data.accessToken);
          
          // Retry the original request that failed (you might want to implement this)
          return;
        }
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        // Clear invalid tokens and redirect to login
        localStorage.removeItem('spotify_token');
        localStorage.removeItem('spotify_refresh_token');
        navigate('/login');
        return;
      }
    }
    
    setMessages(prev => [...prev, { 
      text: "Sorry, something went wrong. Please try again.", 
      isUser: false 
    }]);
  };
  return (
    <ChatContainer>
      <ChatPanel>
        <h2>Chat with Music Assistant</h2>
        <MessagesContainer>
          {messages.map((message, index) => (
            <Message key={index} isUser={message.isUser}>
              {message.text}
            </Message>
          ))}
          <div ref={messagesEndRef} />
        </MessagesContainer>
        <InputForm onSubmit={handleSendMessage}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me how you're feeling or what music you like..."
            disabled={!isSessionValid}
          />
          <SendButton type="submit" disabled={!isSessionValid}>Send</SendButton>
        </InputForm>
      </ChatPanel>
      
      <MusicPanel>
        <h2>Recommended Tracks</h2>
        {currentMood !== 'neutral' && (
          <p>Based on your mood: <strong>{currentMood.replace('_', ' ')}</strong></p>
        )}
        {tracks.length > 0 ? (
          <>
            <TrackList tracks={tracks} />
            
            <div style={{ marginTop: '20px' }}>
              <h3>Save as Playlist</h3>
              <input
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder={`My ${currentMood.replace('_', ' ')} Playlist`}
                style={{ padding: '8px', marginRight: '10px', borderRadius: '4px', border: 'none' }}
                disabled={!isSessionValid}
              />
              <button 
                onClick={createPlaylist}
                disabled={isCreatingPlaylist || !isSessionValid}
                style={{ 
                  padding: '8px 15px', 
                  backgroundColor: '#1DB954',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSessionValid ? 'pointer' : 'not-allowed',
                  opacity: isSessionValid ? 1 : 0.7
                }}
              >
                {isCreatingPlaylist ? 'Creating...' : 'Create Playlist'}
              </button>
            </div>
          </>
        ) : (
          <p>Ask me for music recommendations to see tracks here!</p>
        )}
      </MusicPanel>
      
      {/* {playbackUris.length > 0 && (
        <PlayerContainer>
          <SpotifyWebPlayer token={validatedToken} uris={playbackUris} />
        </PlayerContainer>
      )} */}
    </ChatContainer>
  );
}

export default ChatInterface;