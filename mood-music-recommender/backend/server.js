// backend/server.js
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const winston = require('winston');
const axios = require('axios');


const ChatSession = require("./models/ChatSession");



// Load environment variables
dotenv.config();
// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});
// Initialize Express app
const app = express();
app.use(cors({ origin: ["http://localhost:3000","http://localhost:5001"], credentials: true }));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define session schema and model
const sessionSchema = new mongoose.Schema({
  sessionId: String,
  spotifyAccessToken: String,
  spotifyRefreshToken: String,
  expiresIn: Number,
  timestamp: Date
});
const Session = mongoose.model('Session', sessionSchema);

function recommendGenres(emotionAnalysis) {
  const genreMapping = {
      "happy": ["pop", "dance", "indie"],
      "sad": ["acoustic", "blues", "soul"],
      "angry": ["rock", "metal", "punk"],
      "neutral": ["classical", "lofi", "jazz"]
  };
  return genreMapping[emotionAnalysis.dominantEmotion] || ["pop"];
}



// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/callback'
});

// Function to check if a session is valid and refresh if necessary
async function validateSession(sessionId) {
  const session = await Session.findOne({ sessionId });
  if (!session) throw new Error('Session not found');

  const now = new Date();
  const expiryTime = new Date(session.timestamp.getTime() + session.expiresIn * 1000 - 60000); // 1 minute buffer

  if (now > expiryTime) {
    console.log('Refreshing token...');
    if (!session.spotifyRefreshToken) {
      throw new Error('Refresh token not available');
    }

    spotifyApi.setRefreshToken(session.spotifyRefreshToken);
    try {
      const data = await spotifyApi.refreshAccessToken();
      session.spotifyAccessToken = data.body.access_token;
      session.expiresIn = data.body.expires_in;
      session.timestamp = now;
      await session.save();
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Failed to refresh authentication');
    }
  }

  spotifyApi.setAccessToken(session.spotifyAccessToken);
  return session;
}

// Add new session verification endpoint
app.post('/api/session/verify', async (req, res) => {
  const { sessionId, token, refreshToken } = req.body;
  try {
    if (sessionId) {
      const session = await Session.findOne({ sessionId });
      
      if (session) {
        if (refreshToken && (!session.spotifyRefreshToken || session.spotifyRefreshToken === '')) {
          session.spotifyRefreshToken = refreshToken;
          await session.save();
        }
        
        try {
          const validatedSession = await validateSession(sessionId);
            return res.json({ 
              valid: true, 
              sessionId, 
              accessToken: validatedSession.spotifyAccessToken
            });
        } catch (validationError) {
          console.error('Session validation error:', validationError);
        }
      }
    }

    if (token) {
      const newSessionId = Date.now().toString();
      const newSession = new Session({
        sessionId: newSessionId,
        spotifyAccessToken: token,
        spotifyRefreshToken: refreshToken || '',
        expiresIn: 3600,
        timestamp: new Date()
      });
      await newSession.save();
      return res.json({ 
        valid: true, 
        sessionId: newSessionId, 
        isNew: true,
        accessToken: token
      });
    }

    return res.status(401).json({ 
      valid: false, 
      message: 'Authentication required' 
    });
  } catch (error) {
    return res.status(500).json({ 
      valid: false, 
      error: error.message 
    });
  }
});

// Spotify login route
app.get('/api/spotify/login', async(req, res) => {
  const scopes = [
    'user-read-private',           // Required for basic user info
    'user-read-email',             // Required for user email
    'user-read-recently-played',   // Required for recently played tracks
    'user-top-read',               // Required for top artists and tracks
    'playlist-read-private',       // Required for private playlists
    'playlist-read-collaborative', // Required for collaborative playlists
    'user-library-read'            // Required for saved tracks
  ];
  res.json({ url: spotifyApi.createAuthorizeURL(scopes, null, 'code') });
});

// Spotify callback route
app.post('/api/spotify/callback', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    console.log("Missing authorization code.");
    return res.status(400).json({ error: "Missing authorization code" });
  }

  try {
      const data = await spotifyApi.authorizationCodeGrant(code);
      if (!data.body.access_token) {
          throw new Error("No access token received from Spotify");
      }

      res.json({
          accessToken: data.body.access_token,
          refreshToken: data.body.refresh_token || null,
          expiresIn: data.body.expires_in,
      });

  } catch (err) {
      console.error("Spotify Authentication Error:", err);

      let errorMessage = "Authentication failed";
      if (err.body && err.body.error_description) {
          errorMessage = err.body.error_description;
      }

      res.status(400).json({
          error: errorMessage,
          details: err.message,
      });
  }
});

app.get('/api/spotify/tracks', async (req, res) => {
  const { sessionId } = req.query;

  try {
    const session = await validateSession(sessionId);
    spotifyApi.setAccessToken(session.spotifyAccessToken);

    // Fetch user's saved tracks
    const savedTracks = await spotifyApi.getMySavedTracks({ limit: 50 });
    const tracks = savedTracks.body.items.map(item => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists[0].name,
      album: item.track.album.name,
      image: item.track.album.images[0]?.url,
      uri: item.track.uri
    }));

    res.json({ tracks });
  } catch (error) {
    console.error("Failed to fetch saved tracks:", error);
    res.status(500).json({ error: "Failed to fetch saved tracks" });
  }
});


app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  console.log("Received chat request:", { message, sessionId });

  try {
    // Validate session and set access token
    const session = await validateSession(sessionId);
    console.log("Session validated:", session.sessionId);
    spotifyApi.setAccessToken(session.spotifyAccessToken); // Set the access token

    const chatSession = await ChatSession.findOne({ sessionId });
    let conversationHistory = [];
    
    if (chatSession) {
      conversationHistory = chatSession.messages
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5)
        .map(msg => msg.text)
        .reverse();
    }
    
    // Call Python backend for emotion analysis and response generation
    const emotionResponse = await axios.post("http://localhost:5001/analyze", { 
      text: message,
      context: conversationHistory
    });
    const emotionAnalysis = emotionResponse.data;
    console.log("AI Emotion Analysis:", emotionAnalysis);

    if (emotionAnalysis.isToxic) {
      return res.json({
        response: "I'm not comfortable responding to that message. Let's talk about music in a more positive way.",
        error: "Content policy violation"
      });
    }

    const recommendedGenres = recommendGenres(emotionAnalysis);
    console.log("Recommended Genres:", recommendedGenres);

    const responseText = emotionAnalysis.generatedResponse;

    let tracks = [];
    try {
      // Fetch user-specific data if available
      let recentTracks, topArtists, userPlaylists;
    
      // Fetch recently played tracks
      try {
        console.log(session.spotifyAccessToken);
        recentTracks = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 5 });
      
        // Fetch top artists
        topArtists = await spotifyApi.getMyTopArtists({ limit: 5, time_range: 'medium_term' });
      
        // Fetch user playlists
        userPlaylists = await spotifyApi.getUserPlaylists({ limit: 5 });
      } catch (error) {
        console.error("Spotify API Error:", error);
      }
    
      // Process recently played tracks
      if (recentTracks?.body?.items?.length) {
        tracks = recentTracks.body.items.map(item => ({
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artists[0]?.name || 'Unknown Artist',
          image: item.track.album?.images[0]?.url || null,
          uri: item.track.uri
        }));
      }
    
      // Process top artists and their top tracks
      if (tracks.length < 5 && topArtists?.body?.items?.length) {
        for (const artist of topArtists.body.items) {
          try {
            const artistTracks = await spotifyApi.getArtistTopTracks(artist.id, 'IN'); // 'US' is the market code
            if (artistTracks?.body?.tracks?.length) {
              tracks = [
                ...tracks,
                ...artistTracks.body.tracks.map(track => ({
                  id: track.id,
                  name: track.name,
                  artist: track.artists[0]?.name || 'Unknown Artist',
                  image: track.album?.images[0]?.url || null,
                  uri: track.uri
                }))
              ];
            }
            if (tracks.length >= 10) break; // Stop if we have enough tracks
          } catch (error) {
            console.error("Failed to fetch artist top tracks:", error);
          }
        }
      }
    
      // Process user playlists
      if (tracks.length < 5 && userPlaylists?.body?.items?.length) {
        for (const playlist of userPlaylists.body.items) {
          try {
            const playlistTracks = await spotifyApi.getPlaylistTracks(playlist.id, { limit: 10 });
            if (playlistTracks?.body?.items?.length) {
              tracks = [
                ...tracks,
                ...playlistTracks.body.items.map(item => ({
                  id: item.track.id,
                  name: item.track.name,
                  artist: item.track.artists[0]?.name || 'Unknown Artist',
                  image: item.track.album?.images[0]?.url || null,
                  uri: item.track.uri
                }))
              ];
            }
            if (tracks.length >= 10) break; // Stop if we have enough tracks
          } catch (error) {
            console.error("Failed to fetch playlist tracks:", error);
          }
        }
      }
    
      console.log("Final Tracks:", tracks);
    } catch (error) {
      console.error("Error fetching user-specific data:", error);
    }
    
    // Fallback to genre-based search if needed
    if (tracks.length < 5) {
      try {
        for (const genre of recommendedGenres) {
          const searchResults = await spotifyApi.search(`genre:${genre}`, ['track'], { limit: 3 });
          if (searchResults?.body?.tracks?.items?.length) {
            tracks = [...tracks, ...searchResults.body.tracks.items.map(track => ({
              id: track.id,
              name: track.name,
              artist: track.artists[0]?.name || 'Unknown Artist',
              image: track.album?.images[0]?.url || null,
              uri: track.uri,
              genre
            }))];
          }
          if (tracks.length >= 10) break;
        }
      } catch (error) {
        console.error("Genre search error:", error);
      }
    }

    const uniqueTracks = tracks.reduce((unique, track) => {
      if (!unique.some(t => t.id === track.id)) {
        unique.push(track);
      }
      return unique;
    }, []).slice(0, 10);

    if (chatSession) {
      chatSession.messages.push({
        text: message,
        timestamp: new Date(),
        emotion: {
          dominantEmotion: emotionAnalysis.dominantEmotion,
          mood: emotionAnalysis.mood
        }
      });
      await chatSession.save();
    } else {
      await new ChatSession({
        sessionId,
        messages: [{
          text: message,
          timestamp: new Date(),
          emotion: {
            dominantEmotion: emotionAnalysis.dominantEmotion,
            mood: emotionAnalysis.mood
          }
        }]
      }).save();
    }

    res.json({ 
      response: uniqueTracks.length ? responseText : "I'm having trouble finding music right now. Please try again later.",
      mood: emotionAnalysis.mood,
      emotion: emotionAnalysis.dominantEmotion,
      genres: recommendedGenres,
      tracks: uniqueTracks
    });
  } catch (err) {
    console.error("Chat API Backend Error:", err.message);
    res.status(err.message.includes('Session not found') || err.message.includes('Failed to refresh authentication') ? 401 : 500).json({ 
      error: err.message.includes('Session not found') || err.message.includes('Failed to refresh authentication') ? "Authentication required" : "Something went wrong with your request. Please try again.",
      details: err.message
    });
  }
});

// Create playlist endpoint
app.post('/api/playlist/create', async (req, res) => {
  const { name, trackUris, sessionId } = req.body;
  try {
    const session = await validateSession(sessionId);
    spotifyApi.setAccessToken(session.spotifyAccessToken);
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, name, { public: false });
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, playlist: { id: playlist.body.id, name: playlist.body.name, url: playlist.body.external_urls.spotify } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotify/refresh', async (req, res) => {
  const { refreshToken, sessionId } = req.body;
  if (!refreshToken || !sessionId) {
    return res.status(400).json({ error: "Missing refresh token or session ID" });
  }

  try {
    spotifyApi.setRefreshToken(refreshToken);
    const data = await spotifyApi.refreshAccessToken();

    // Update the session with the new access token and expiry
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.spotifyAccessToken = data.body.access_token;
    session.expiresIn = data.body.expires_in;
    session.timestamp = new Date();
    await session.save();

    res.json({
      accessToken: data.body.access_token,
      expiresIn: data.body.expires_in,
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.status(401).json({ error: "Failed to refresh token. Please re-authenticate." });
  }
});

// Global error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));