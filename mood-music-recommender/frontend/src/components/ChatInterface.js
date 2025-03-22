import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styled from 'styled-components';
import TrackList from './TrackList';
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
const REACT_APP_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

function ChatInterface({ token, sessionId,apiRequest }) {
  const navigate = useNavigate();
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [validatedSessionId, setValidatedSessionId] = useState(sessionId);
  const [validatedToken, setValidatedToken] = useState(token);
  const [userName, setUserName] = useState('');

  const [input, setInput] = useState('');
  const [tracks, setTracks] = useState([]);
  const [playbackUris, setPlaybackUris] = useState([]);
  const [currentMood, setCurrentMood] = useState('neutral');
  const messagesEndRef = useRef(null);

  // Add session verification effect
  useEffect(() => {
    const verifySession = async () => {
      try {
        const storedToken = localStorage.getItem('spotify_token');
        const storedSessionId = localStorage.getItem('session_id');
  
        if (!storedSessionId || !storedToken) {
          navigate('/login');
          return;
        }
  
        const response = await apiRequest(() =>
          axios.post(`${REACT_APP_BACKEND_URL}/api/session/verify`, {
            sessionId: storedSessionId,
            token: storedToken
          })
        );
        
  
        if (response.data.valid) {
          setIsSessionValid(true);
          setValidatedSessionId(response.data.sessionId || storedSessionId);
          setValidatedToken(response.data.accessToken || storedToken);
          // Store user's name
          setUserName(response.data.userName || "there"); 
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
  }, [navigate,apiRequest]);
  const [messages, setMessages] = useState([
    { text: `Hi ${userName} I'm your mood-based music assistant. How are you feeling today?`, isUser: false }
  ]);

  useEffect(() => {
    setMessages([
      { text: `Hi ${userName}! I'm your mood-based music assistant. How are you feeling today?`, isUser: false }
    ]);
  }, [userName]);

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await apiRequest(async () => 
          axios.get(`${REACT_APP_BACKEND_URL}/api/tracks`, {
            params: { sessionId: validatedSessionId }
          })
        );
        
        setTracks(response.data.tracks);
      } catch (error) {
        console.error("Failed to fetch tracks:", error);
      }
    };
  
    if (validatedSessionId) {
      fetchTracks();
    }
  }, [validatedSessionId,apiRequest]);


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
  
      const response = await apiRequest(async () => 
        axios.post(`${REACT_APP_BACKEND_URL}/api/chat`, {
          message: userMessage,
          sessionId: validatedSessionId
        })
      );
      
      
      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMsgId));
      
      // Add the actual response
      setMessages(prev => [...prev, { text: response.data.response, isUser: false }]);
  
      if (response.data.tracks) {
        setTracks(response.data.tracks);
        setPlaybackUris(response.data.tracks.map((track) => track.uri));
      }
      if (response.data.mood) {
        setCurrentMood(response.data.mood);
      }
    } catch (error) {
      console.error("Chat API Error:", error.response?.data || error.message);
      
      setMessages((prev) => [...prev, { text: "Sorry, I couldn't process your request.", isUser: false }]);
  
    }
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
            
          </>
        ) : (
          <p>Ask me for music recommendations to see tracks here!</p>
        )}
      </MusicPanel>
    </ChatContainer>
  );
}

export default ChatInterface;