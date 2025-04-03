const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  sessionId: String,
  spotifyAccessToken: String,
  spotifyRefreshToken: String,
  expiresIn: Number,
  timestamp: Date
});

module.exports = mongoose.model('Session', sessionSchema);