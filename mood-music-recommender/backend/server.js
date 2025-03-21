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
app.use(cors({ origin: ["http://localhost:3000","http://localhost:5001"], credentials: true }));
app.use(express.json());
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

function recommendGenres(emotionAnalysis, userTopGenres = []) {
  const genreMapping = {
    "happy": ["pop", "dance", "indie pop", "house", "funk"],
    "sad": ["acoustic", "blues", "soul", "folk", "piano"],
    "angry": ["rock", "metal", "punk", "hard rock", "alternative"],
    "neutral": userTopGenres,
    "excited": ["edm", "electronic", "techno", "drum and bass"],
    "relaxed": ["chill", "ambient", "acoustic", "soft rock"],
    "nostalgic": ["classic rock", "retro", "jazz", "synthwave"]
  };

  // 1️ If emotion is unknown, default to neutral
  let emotion = emotionAnalysis.dominantEmotion || "neutral";

  // 2️ If emotion is mixed (e.g., "happy-sad"), split and blend genres
  let emotions = emotion.includes("-") ? emotion.split("-") : [emotion];
  let genres = emotions.flatMap(e => genreMapping[e] || []);

  // 3️ If user has preferred genres, blend them into recommendations
  if (userTopGenres.length > 0) {
    genres = [...new Set([...genres, ...userTopGenres])]; // Merge & remove duplicates
  }

  return genres.length ? genres : ["pop", "indie"]; // Final fallback
}



const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/callback'
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
// Add this to server.js
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

app.get('/api/spotify/login', (req, res) => {
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

app.get('/api/spotify/tracks', async (req, res) => {
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
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  console.log("Received chat request:", { message, sessionId });

  try {
    // Validate session and set access token
    const session = await validateSession(sessionId);
    console.log("Session validated:", session.sessionId);
    
    // Ensure access token is set for all subsequent Spotify API calls
    spotifyApi.setAccessToken(session.spotifyAccessToken);
    
    // Get chat history
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

    let userTopGenres = [];
    try {
      const topTracks = await spotifyApi.getMyTopTracks({ limit: 50, time_range: 'medium_term' });
      // Extract genres from top artists
      const genreCounts = {};
      for (const track of topTracks.body.items) {
        // Get the artist ID from the track
        const artistId = track.artists[0]?.id;
        
        if (artistId) {
          // Fetch the artist details to get their genres
          const artistData = await spotifyApi.getArtist(artistId);
          artistData.body.genres.forEach(genre => {
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
          });
        }
      }
      // Sort genres by frequency & pick top ones
      userTopGenres = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a]).slice(0, 5);
      console.log("User's Top Genres:", userTopGenres);
    } catch (error) {
      console.error("Failed to fetch user top genres:", error);
    }


    const recommendedGenres = recommendGenres(emotionAnalysis, userTopGenres);
    console.log("Recommended Genres:", recommendedGenres);

    const responseText = emotionAnalysis.generatedResponse;

    let tracks = [];
    
    // Fetch user-specific data with better error handling
    try {
      console.log("Attempting to fetch user-specific data with token:", session.spotifyAccessToken.substring(0, 10) + "...");
      
      // Verify the token works by getting user profile first
      try {
        const me = await spotifyApi.getMe();
        // console.log("Successfully retrieved user profile for:", me.body);
      } catch (profileError) {
        console.error("Failed to fetch user profile - token may be invalid:", profileError);
        throw new Error("Authentication error - please login again");
      }
      for (const genre in recommendedGenres)
      {
      // Now fetch recent tracks, top artists and playlists
      try {
        const recentTracks = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 50 });
        
        if (recentTracks?.body?.items?.length) {
            tracks.push(...recentTracks.body.items
              .filter(item => item.track && item.track.genres?.includes(genre))
              .map(item => ({
                id: item.track.id,
                name: item.track.name,
                artist: item.track.artists[0]?.name || 'Unknown Artist',
                image: item.track.album?.images[0]?.url || null,
                uri: item.track.uri,
                genre
              })));
        }
      } catch (recentError) {
        
        console.error("Failed to fetch recent tracks:", recentError);
      }
      console.log("1"+" "+tracks.length);
      // Fetch top artists only if we need more tracks
      try {
        const userPlaylists = await spotifyApi.getUserPlaylists({ limit: 50 });
        console.log(`Retrieved ${userPlaylists.body.items.length} user playlists`);
        
        for (const playlist of userPlaylists.body.items) {
          try {
            const playlistTracks = await spotifyApi.getPlaylistTracks(playlist.id, { limit: 10 });
            tracks.push(...playlistTracks.body.items
              .filter(item => item.track && item.track.genres?.includes(genre))
              .map(item => ({
                id: item.track.id,
                name: item.track.name,
                artist: item.track.artists[0]?.name || 'Unknown Artist',
                image: item.track.album?.images[0]?.url || null,
                uri: item.track.uri,
                genre
              })));
            if (tracks.length >= 10) break;
          } catch (playlistTracksError) {
            console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, playlistTracksError);
          }
        }
      } catch (userPlaylistsError) {
        console.error("Failed to fetch user playlists:", userPlaylistsError);
      }
      console.log("2"+" "+tracks.length);
        try {
          const topArtists = await spotifyApi.getMyTopArtists({ limit: 50, time_range: 'medium_term' });
          console.log(`Retrieved ${topArtists.body.items.length} top artists`);
          
          for (const artist of topArtists.body.items) {
            if (artist.genres.includes(genre)) {
              try {
                const artistTracks = await spotifyApi.getArtistTopTracks(artist.id);
                tracks.push(...artistTracks.body.tracks.map(track => ({
                  id: track.id,
                  name: track.name,
                  artist: track.artists[0]?.name || 'Unknown Artist',
                  image: track.album?.images[0]?.url || null,
                  uri: track.uri,
                  genre
                })));
              } catch (artistTracksError) {
                console.error(`Failed to fetch tracks for artist ${artist.name}:`, artistTracksError);
              }
            }
          }
        } catch (topArtistsError) {
         
          console.error("Failed to fetch top artists:", topArtistsError);
        }
        console.log("3"+" "+tracks.length);
    }
    } catch (error) {
      console.error("Error fetching user-specific data:", error);
     
      // If it's an authentication error, send a special response
      if (error.message.includes("Authentication error")) {
        return res.status(401).json({ 
          error: "Authentication required",
          details: error.message
        });
      }
    }
    
    // Fallback to genre-based search if needed
    if (tracks.length < 10) {
      console.log("Falling back to recently played songs");
    
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
              uri: item.track.uri,
              genre: item.track.genres || "unknown"
            }))
          ];
        }
    
        // Ensure at least 10 unique tracks
        tracks = [...new Map(tracks.map(track => [track.id, track])).values()].slice(0, 10);
      } catch (error) {
        console.error("Error fetching recently played songs:", error);
      }
    }
    
console.log("4"+" "+tracks.length);
 // Shuffle tracks
    tracks = tracks.sort(() => Math.random() - 0.5);
    // Ensure unique tracks and limit to 10
    const uniqueTracks = tracks.reduce((unique, track) => {
      if (!unique.some(t => t.id === track.id)) {
        unique.push(track);
      }
      return unique;
    }, []).slice(0, 10);

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
// app.post('/api/chat', async (req, res) => {
//   const { message, sessionId } = req.body;
//   console.log("Received chat request:", { message, sessionId });

//   try {
//     // Validate session and set access token
//     const session = await validateSession(sessionId);
//     console.log("Session validated:", session.sessionId);
    
//     // Ensure access token is set for all subsequent Spotify API calls
//     spotifyApi.setAccessToken(session.spotifyAccessToken);
    
//     // Get chat history
//     const chatSession = await ChatSession.findOne({ sessionId });
//     let conversationHistory = chatSession ? chatSession.messages.slice(-5).map(msg => msg.text) : [];

    
//     // Call Python backend for emotion analysis and response generation
//     const emotionResponse = await axios.post("http://localhost:5001/analyze", { 
//       text: message,
//       context: conversationHistory
//     });
//     const emotionAnalysis = emotionResponse.data;
//     console.log("AI Emotion Analysis:", emotionAnalysis);

//     if (emotionAnalysis.isToxic) {
//       return res.json({
//         response: "I'm not comfortable responding to that message. Let's talk about music in a more positive way.",
//         error: "Content policy violation"
//       });
//     }

//     const recommendedGenres = recommendGenres(emotionAnalysis);
//     console.log("Recommended Genres:", recommendedGenres);

//     const responseText = emotionAnalysis.generatedResponse;

//     let tracks = [];
    
//     // Fetch user-specific data with better error handling
//     try {
//       console.log("Attempting to fetch user-specific data with token:", session.spotifyAccessToken.substring(0, 10) + "...");
      
//       // Verify the token works by getting user profile first
//       try {
//         const me = await spotifyApi.getMe();
//         // console.log("Successfully retrieved user profile for:", me.body);
//       } catch (profileError) {
//         console.error("Failed to fetch user profile - token may be invalid:", profileError);
//         throw new Error("Authentication error - please login again");
//       }
      
//       // Now fetch recent tracks, top artists and playlists
//       for (const genre of recommendedGenres) {
//         try {
//           // Fetch user's recent tracks
//           const recentTracks = await spotifyApi.getMyRecentlyPlayedTracks({ limit: 20 });
//           if (recentTracks?.body?.items?.length) {
//             tracks.push(...recentTracks.body.items
//               .filter(item => item.track && item.track.genres?.includes(genre))
//               .map(item => ({
//                 id: item.track.id,
//                 name: item.track.name,
//                 artist: item.track.artists[0]?.name || 'Unknown Artist',
//                 image: item.track.album?.images[0]?.url || null,
//                 uri: item.track.uri,
//                 genre
//               })));
              
//           }
//           console.log("1"+" "+tracks.length);
//           // Fetch user's top artists and their tracks
//           const topArtists = await spotifyApi.getMyTopArtists({ limit: 20});
//           for (const artist of topArtists.body.items) {
//             if (artist.genres.includes(genre)) {
//               try {
//                 const artistTracks = await spotifyApi.getArtistTopTracks(artist.id);
//                 tracks.push(...artistTracks.body.tracks.map(track => ({
//                   id: track.id,
//                   name: track.name,
//                   artist: track.artists[0]?.name || 'Unknown Artist',
//                   image: track.album?.images[0]?.url || null,
//                   uri: track.uri,
//                   genre
//                 })));
//               } catch (artistTracksError) {
//                 console.error(`Failed to fetch tracks for artist ${artist.name}:`, artistTracksError);
//               }
//             }
//           }
//           console.log("2"+" "+tracks.length);
//           // Fetch user's playlists and filter by genre
//           const userPlaylists = await spotifyApi.getUserPlaylists({ limit: 20 });
//           for (const playlist of userPlaylists.body.items) {
//             try {
//               const playlistTracks = await spotifyApi.getPlaylistTracks(playlist.id, { limit: 10 });
//               tracks.push(...playlistTracks.body.items
//                 .filter(item => item.track && item.track.genres?.includes(genre))
//                 .map(item => ({
//                   id: item.track.id,
//                   name: item.track.name,
//                   artist: item.track.artists[0]?.name || 'Unknown Artist',
//                   image: item.track.album?.images[0]?.url || null,
//                   uri: item.track.uri,
//                   genre
//                 })));
//                 } catch (playlistTracksError) {
//                   console.error(`Failed to fetch tracks for playlist ${playlist.name}:`, playlistTracksError);
//                 }
//           }
//           console.log("3"+" "+tracks.length);

//         } catch (error) {
//           console.error(`Failed to fetch genre-based tracks for ${genre}:`, error);
//         }
//       }
      
//     } catch (error) {
//       console.error("Error fetching user-specific data:", error);
//     }
//         // Fallback to genre-based search if needed
//         if (tracks.length < 10) {
//           console.log("Falling back to genre-based recommendations");
//           try {
//             for (const genre of recommendedGenres) {
//               const searchResults = await spotifyApi.search(`genre:${genre}`, ['track'], { limit: 20 });
//               if (searchResults?.body?.tracks?.items?.length) {
//                 tracks = [...tracks, ...searchResults.body.tracks.items.map(track => ({
//                   id: track.id,
//                   name: track.name,
//                   artist: track.artists[0]?.name || 'Unknown Artist',
//                   image: track.album?.images[0]?.url || null,
//                   uri: track.uri,
//                   genre
//                 }))];
//               }
//               if (tracks.length >= 10) break;
//             }
//           } catch (error) {
//             console.error("Genre search error:", error);
//           }
//         }
//         console.log("4"+" "+tracks.length);
//     // Shuffle tracks
//     tracks = tracks.sort(() => Math.random() - 0.5);
    
//     // Ensure unique tracks and limit to 10
//     const uniqueTracks = tracks.reduce((unique, track) => {
//       if (!unique.some(t => t.id === track.id)) {
//         unique.push(track);
//       }
//       return unique;
//     }, []).slice(0, 10);

//     console.log(`Returning ${uniqueTracks.length} tracks to client`);

//     // Save message to chat history
//     if (chatSession) {
//       chatSession.messages.push({
//         text: message,
//         timestamp: new Date(),
//         emotion: {
//           dominantEmotion: emotionAnalysis.dominantEmotion,
//           mood: emotionAnalysis.mood
//         }
//       });
//       await chatSession.save();
//     } else {
//       await new ChatSession({
//         sessionId,
//         messages: [{
//           text: message,
//           timestamp: new Date(),
//           emotion: {
//             dominantEmotion: emotionAnalysis.dominantEmotion,
//             mood: emotionAnalysis.mood
//           }
//         }]
//       }).save();
//     }

//     res.json({ 
//       response: uniqueTracks.length ? responseText : "I'm having trouble finding music right now. Please try again later.",
//       mood: emotionAnalysis.mood,
//       emotion: emotionAnalysis.dominantEmotion,
//       genres: recommendedGenres,
//       tracks: uniqueTracks
//     });
//   } catch (err) {
//     console.error("Chat API Backend Error:", err.message);
//     res.status(err.message.includes('Session not found') || err.message.includes('Failed to refresh authentication') ? 401 : 500).json({ 
//       error: err.message.includes('Session not found') || err.message.includes('Failed to refresh authentication') ? "Authentication required" : "Something went wrong with your request. Please try again.",
//       details: err.message
//     });
//   }
// });
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

const apiRequest = async (apiFunc, retry = true) => {
  try {
    return await apiFunc();
  } catch (error) {
    if (error.response?.status === 401 && retry) {
      console.log("Unauthorized error, trying token refresh...");
      const newToken = await refreshToken();
      if (newToken) {
        return await apiRequest(apiFunc, false); // Retry the request once
      }
    }
    throw error;
  }
};


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));