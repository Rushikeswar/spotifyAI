// backend/server.js
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const winston = require('winston');
const axios = require('axios');

const ChatSession = require("./models/ChatSession");
dotenv.config();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});
const app = express();

const REACT_APP_FRONTEND_URL= process.env.REACT_APP_FRONTEND_URL || "http://localhost:3000"
const REACT_APP_PYTHON_BACKEND_URL= process.env.REACT_APP_PYTHON_BACKEND_URL ||  "http://localhost:5001"

app.use(cors({ origin: [REACT_APP_FRONTEND_URL,REACT_APP_PYTHON_BACKEND_URL], credentials: true }));
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI)
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

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || `${REACT_APP_FRONTEND_URL}/callback`
});

async function validateSession(sessionId) {
  const session = await Session.findOne({ sessionId });
  if (!session) throw new Error('Session not found');

  const now = new Date();
  const expiryTime = new Date(session.timestamp.getTime() + session.expiresIn * 1000 - 60000);

  if (now > expiryTime) {
    console.log('Refreshing token...');
    if (!session.spotifyRefreshToken) throw new Error('No refresh token available');

    try {
      spotifyApi.setRefreshToken(session.spotifyRefreshToken);
      const data = await spotifyApi.refreshAccessToken();
      session.spotifyAccessToken = data.body.access_token;
      session.expiresIn = data.body.expires_in;
      session.timestamp = now;
      await session.save(); // Ensure the new token is saved
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error('Failed to refresh authentication');
    }
  }

  spotifyApi.setAccessToken(session.spotifyAccessToken);
  return session;
}
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

          const spotifyUserResponse = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${session.spotifyAccessToken || token}` }
          });
  
          const userName = spotifyUserResponse.data.display_name || "User";

          const validatedSession = await validateSession(sessionId);
            return res.json({ 
              valid: true, 
              sessionId, 
              accessToken: validatedSession.spotifyAccessToken,
              userName,
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

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  console.log("Received chat request:", { message, sessionId });

  try {
    // Validate session and set access token
    const session = await validateSession(sessionId);
    spotifyApi.setAccessToken(session.spotifyAccessToken);

    // Get chat history
    const chatSession = await ChatSession.findOne({ sessionId });
    const conversationHistory = chatSession 
      ? chatSession.messages.slice(-5).map(msg => msg.text) 
      : [];

    let userGenres = [];
    try {
      const topArtists = await spotifyApi.getMyTopArtists({ limit: 50, time_range: 'medium_term' });
      const genreCounts = {};

      topArtists.body.items.forEach(artist => {
        artist.genres.forEach(genre => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
      });

      userGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]);
      console.log("User's All Genres:", userGenres);
    } catch (error) {
      console.error("Failed to fetch user genres:", error);
      userGenres = [];
    }

    // Call Python API for emotion analysis & response generation
    const emotionResponse = await axios.post(`${REACT_APP_PYTHON_BACKEND_URL}/analyze`, { 
      text: message,
      context: conversationHistory,
      userGenres
    });

    const emotionAnalysis = emotionResponse.data;
    console.log("AI Emotion Analysis:", emotionAnalysis);

    if (emotionAnalysis.isToxic) {
      return res.json({
        response: "I'm not comfortable responding to that message. Let's talk about music in a more positive way.",
        error: "Content policy violation"
      });
    }

    const recommendedGenres = emotionAnalysis.recommendedGenres;
    console.log("Recommended Genres:", recommendedGenres);

    function getRandomSubset(array, count) {
      return array.length <= count ? array : array.sort(() => 0.5 - Math.random()).slice(0, count);
    }

    let tracks = [];

    try {
      console.log("Fetching user-specific tracks...");

      // Run both recently played and top artists fetching in parallel
      const [recentTracksResponse, topArtistsResponse] = await Promise.all([
        spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 }),
        spotifyApi.getMyTopArtists({ limit: 5, time_range: 'medium_term' })
      ]);

      const recentTracks = recentTracksResponse?.body?.items || [];
      const topArtists = topArtistsResponse?.body?.items || [];

      if (recentTracks.length) {
        tracks = recentTracks
          .filter(item => item.track && item.track.artists.some(artist => recommendedGenres.includes(artist.genres)))
          .map(item => ({
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists[0]?.name || 'Unknown Artist',
            image: item.track.album?.images[0]?.url || null,
            uri: item.track.uri
          }));
      }

      if (tracks.length < 50) {
        // Fetch tracks from top artists in parallel
        const artistTrackPromises = topArtists
          .filter(artist => artist.genres.some(genre => recommendedGenres.includes(genre)))
          .map(artist => spotifyApi.getArtistTopTracks(artist.id).then(response => 
            response.body.tracks.map(track => ({
              id: track.id,
              name: track.name,
              artist: track.artists[0]?.name || 'Unknown Artist',
              image: track.album?.images[0]?.url || null,
              uri: track.uri
            }))
          ).catch(error => {
            console.error(`Failed to fetch tracks for ${artist.name}:`, error);
            return [];
          }));

        const allArtistTracks = (await Promise.all(artistTrackPromises)).flat();
        tracks.push(...getRandomSubset(allArtistTracks, 10));
      }
    } catch (error) {
      console.error("Error fetching user-specific data:", error);
      if (error.message.includes("Authentication error")) {
        return res.status(401).json({ error: "Authentication required", details: error.message });
      }
    }

    // Fallback to recently played if no tracks found
    if (tracks.length < 10) {
      console.log("Falling back to recently played songs...");

      try {
        const recentlyPlayed = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 });

        if (recentlyPlayed?.body?.items?.length) {
          tracks = [
            ...tracks,
            ...recentlyPlayed.body.items.map(item => ({
              id: item.track.id,
              name: item.track.name,
              artist: item.track.artists[0]?.name || 'Unknown Artist',
              image: item.track.album?.images[0]?.url || null,
              uri: item.track.uri
            }))
          ];
        }

        tracks = [...new Map(tracks.map(track => [track.id, track])).values()].slice(0, 10);
      } catch (error) {
        console.error("Error fetching recently played songs:", error);
      }
    }

    // Shuffle and limit results to 10 unique tracks
    const uniqueTracks = [...new Map(tracks.map(track => [track.id, track])).values()]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);

    console.log(`Returning ${uniqueTracks.length} tracks to client`);

    // Save message to chat history
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
      response: uniqueTracks.length ? emotionAnalysis.generatedResponse : "I'm having trouble finding music right now. Please try again later.",
      mood: emotionAnalysis.mood,
      emotion: emotionAnalysis.dominantEmotion,
      genres: recommendedGenres,
      tracks: uniqueTracks
    });

  } catch (err) {
    console.error("Chat API Backend Error:", err.message);
    res.status(err.message.includes('Session not found') || err.message.includes('Failed to refresh authentication') ? 401 : 500)
      .json({ error: err.message.includes('Session not found') ? "Authentication required" : "Something went wrong. Please try again.", details: err.message });
  }
});



app.get('/api/tracks', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const session = await validateSession(sessionId);
    const savedTracks = await spotifyApi.getMySavedTracks({ limit: 10 });
    
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

app.get('/api/spotify/check-token', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const session = await validateSession(sessionId);
    const userData = await spotifyApi.getMe();
    res.json({ valid: true, user: userData.body });
  } catch (error) {
    console.error("Token check failed:", error);
    res.status(401).json({ valid: false, error: error.message });
  }
});


app.get('/api/spotify/login', async(req, res) => {
  const scopes = [
    'user-read-private', 'user-read-email', 'user-read-recently-played', 
    'user-top-read', 'playlist-read-private', 'user-library-read',
    'playlist-modify-public', 'playlist-modify-private'
  ];

  // Ensure `clientId` is set before using it
  if (!process.env.SPOTIFY_CLIENT_ID) {
    return res.status(500).json({ error: "Missing Spotify Client ID" });
  }

  const authUrl = `https://accounts.spotify.com/authorize?` + 
    `client_id=${process.env.SPOTIFY_CLIENT_ID}` + 
    `&response_type=code` + 
    `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` + 
    `&scope=${encodeURIComponent(scopes.join(" "))}` + 
    `&show_dialog=true`;

  res.json({ url: authUrl });
});


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
    res.status(400).json({ error: "Authentication failed", details: err.message });
  }
});


app.post('/api/spotify/refresh', async (req, res) => {
  try {
    const { refreshToken, sessionId } = req.body;
    if (!refreshToken || !sessionId) return res.status(400).json({ error: "Missing refresh token or session ID" });

    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: "Session not found" });

    spotifyApi.setRefreshToken(refreshToken);
    const data = await spotifyApi.refreshAccessToken();

    session.spotifyAccessToken = data.body.access_token;
    session.expiresIn = data.body.expires_in;
    session.timestamp = new Date();
    await session.save();

    res.json({ accessToken: data.body.access_token, expiresIn: data.body.expires_in });
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


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));