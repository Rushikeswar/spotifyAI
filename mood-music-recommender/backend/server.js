// backend/server.js
const express = require('express');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const dotenv = require('dotenv');
const Sentiment = require('sentiment');
const mongoose = require('mongoose');
const winston = require('winston');
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
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
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

// Initialize sentiment analyzer
const sentiment = new Sentiment();

// Function to analyze mood from text
function analyzeMood(text) {
  const result = sentiment.analyze(text);
  const score = result.score;
  
  // Simple mood mapping based on sentiment score
  if (score > 5) return 'very_happy';
  if (score > 2) return 'happy';
  if (score > 0) return 'positive';
  if (score === 0) return 'neutral';
  if (score > -3) return 'negative';
  if (score > -6) return 'sad';
  return 'very_sad';
}

// Mood-to-Spotify feature mapping
const moodMap = {
  very_happy: { target_energy: 0.8, target_valence: 0.8, seed_genres: ['pop', 'dance', 'happy'] },
  happy: { target_energy: 0.6, target_valence: 0.6, seed_genres: ['pop', 'indie_pop'] },
  positive: { target_energy: 0.5, target_valence: 0.5, seed_genres: ['pop', 'indie_pop', 'chill'] },
  neutral: { target_energy: 0.4, target_valence: 0.4, seed_genres: ['pop', 'indie_folk'] },
  negative: { target_energy: 0.3, target_valence: 0.4, seed_genres: ['indie', 'alternative'] },
  sad: { target_energy: 0.4, target_valence: 0.3, seed_genres: ['indie_folk', 'chill'] },
  very_sad: { target_energy: 0.3, target_valence: 0.2, seed_genres: ['classical', 'ambient'] }
};

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
  const expiryTime = new Date(session.timestamp.getTime() + session.expiresIn * 1000 - 60000);

  if (now > expiryTime) {
    spotifyApi.setRefreshToken(session.spotifyRefreshToken);
    try {
      const data = await spotifyApi.refreshAccessToken();
      session.spotifyAccessToken = data.body.access_token;
      session.expiresIn = data.body.expires_in;
      session.timestamp = now;
      await session.save();
    } catch (error) {
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
app.get('/api/spotify/login', (req, res) => {
  const scopes = [
    'user-read-private', 'user-read-email', 'user-top-read',
    'playlist-modify-public', 'playlist-modify-private', 'user-library-read'
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




// Modified chat endpoint with fixed recommendation parameters
// Chat & Recommendations
// Fixed chat endpoint with null checks
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  console.log("Received chat request:", { message, sessionId });

  try {
    // Validate session
    const session = await validateSession(sessionId);
    console.log("Session validated:", session.sessionId);

    // Analyze message for mood
    const mood = analyzeMood(message);
    console.log("Detected Mood:", mood);

    // Prepare response text based on mood
    const moodResponses = {
      'very_happy': "You sound really excited! Here's an energetic playlist to match your fantastic mood:",
      'happy': "Glad to hear you're feeling good! I've created a cheerful playlist for you:",
      'positive': "Sounds like you're in a nice mood! Here's a pleasant playlist I think you'll enjoy:",
      'neutral': "Here's a balanced playlist that might suit your current mood:",
      'negative': "Seems like things could be better. This playlist might help lift your spirits:",
      'sad': "I'm sorry you're feeling down. Here's a thoughtful playlist that might resonate with you:",
      'very_sad': "I'm here for you during tough times. This playlist has some comforting tracks:",
      'default': "I've created a playlist based on what you shared:"
    };
    
    const responseText = moodResponses[mood] || moodResponses['default'];

    // Map moods to search keywords
    const moodKeywords = {
      'very_happy': ['dance', 'party', 'happy', 'energetic'],
      'happy': ['feel good', 'happy', 'upbeat'],
      'positive': ['chill', 'positive', 'uplifting'],
      'neutral': ['relaxing', 'indie', 'focus'],
      'negative': ['melancholy', 'thoughtful', 'calm'],
      'sad': ['sad', 'emotional', 'ballad'],
      'very_sad': ['sad', 'ambient', 'piano']
    };

    let tracks = [];
    try {
      // Search for tracks based on mood
      const keywords = moodKeywords[mood] || ['popular'];
      const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
      
      const searchResults = await spotifyApi.search(randomKeyword, ['track'], { limit: 10 });
      
      if (searchResults?.body?.tracks?.items?.length) {
        tracks = searchResults.body.tracks.items.map(track => ({
          id: track.id,
          name: track.name,
          artist: track.artists[0]?.name || 'Unknown Artist',
          image: track.album?.images[0]?.url || null,
          uri: track.uri
        }));
      }
    } catch (searchError) {
      console.error("Track search error:", searchError);
    }

    // If no tracks found, try featured playlists
    if (!tracks.length) {
      try {
        const featuredPlaylists = await spotifyApi.getFeaturedPlaylists({ limit: 5 });
        
        for (const playlist of featuredPlaylists?.body?.playlists?.items || []) {
          try {
            const playlistTracks = await spotifyApi.getPlaylistTracks(playlist.id, { limit: 10 });
            if (playlistTracks?.body?.items?.length) {
              tracks = playlistTracks.body.items
                .filter(item => item?.track)
                .map(item => ({
                  id: item.track.id,
                  name: item.track.name,
                  artist: item.track.artists[0]?.name || 'Unknown Artist',
                  image: item.track.album?.images[0]?.url || null,
                  uri: item.track.uri
                }));
              break;
            }
          } catch (playlistError) {
            console.error(`Error fetching tracks for playlist ${playlist.id}:`, playlistError);
          }
        }
      } catch (featuredError) {
        console.error("Featured playlists error:", featuredError);
      }
    }

    // If no tracks from previous attempts, try new releases
    if (!tracks.length) {
      try {
        const newReleases = await spotifyApi.getNewReleases({ limit: 10 });
        
        if (newReleases?.body?.albums?.items?.length) {
          tracks = newReleases.body.albums.items.map(album => ({
            id: album.id,
            name: album.name,
            artist: album.artists[0]?.name || 'Unknown Artist',
            image: album.images[0]?.url || null,
            uri: album.uri
          }));
        }
      } catch (newReleasesError) {
        console.error("New releases error:", newReleasesError);
      }
    }

    // Send successful response
    res.json({ 
      response: tracks.length ? responseText : "I'm having trouble finding music right now. Please try again later.",
      mood,
      tracks
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
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Delete session
app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    await Session.deleteOne({ sessionId: req.params.sessionId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotify/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "Missing refresh token" });
  }
  
  try {
    spotifyApi.setRefreshToken(refreshToken);
    const data = await spotifyApi.refreshAccessToken();
    
    res.json({
      accessToken: data.body.access_token,
      expiresIn: data.body.expires_in
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
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