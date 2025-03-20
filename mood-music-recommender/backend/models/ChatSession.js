const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now },
  emotion: {
    dominantEmotion: String,
    mood: String
  }
});

const chatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  messages: [messageSchema]
});

module.exports = mongoose.model("ChatSession", chatSessionSchema);