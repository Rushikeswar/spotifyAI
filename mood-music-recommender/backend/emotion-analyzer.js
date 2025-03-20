const tf = require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');

// Global model variables
let useModel;


// Load models on startup
async function loadModels() {
  try {
    useModel = await use.load();
    console.log("TensorFlow models loaded successfully");
    return true;
  } catch (error) {
    console.error("Error loading TensorFlow models:", error);
    return false;
  }
}

// Initialize models when this module is imported
loadModels();

// Simple vectors for basic emotions (for demonstration)
// In a real implementation, these would be learned from data
const emotionVectors = {
  joy: Array(512).fill(0).map((_, i) => i % 3 === 0 ? 0.8 : 0),
  sadness: Array(512).fill(0).map((_, i) => i % 3 === 1 ? 0.8 : 0),
  anger: Array(512).fill(0).map((_, i) => i % 3 === 2 ? 0.8 : 0),
  fear: Array(512).fill(0).map((_, i) => i % 5 === 0 ? 0.8 : 0),
  surprise: Array(512).fill(0).map((_, i) => i % 5 === 1 ? 0.8 : 0),
  love: Array(512).fill(0).map((_, i) => i % 5 === 2 ? 0.8 : 0),
  relaxed: Array(512).fill(0).map((_, i) => i % 5 === 3 ? 0.8 : 0),
  neutral: Array(512).fill(0).map((_, i) => i % 7 === 0 ? 0.3 : 0)
};

// Cosine similarity calculation
function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Analyze text for emotional content
async function analyzeEmotion(text) {
  try {
    // Make sure models are loaded
    if (!useModel) {
      const loaded = await loadModels();
      if (!loaded) {
        // Fall back to simpler method if models fail to load
        return fallbackEmotionAnalysis(text);
      }
    }
    
    // Get text embedding using Universal Sentence Encoder
    const embeddings = await useModel.embed([text]);
    const embedding = embeddings.arraySync()[0];
    
    // Compare with emotion vectors using cosine similarity
    const similarities = Object.entries(emotionVectors).map(([emotion, vector]) => ({
      emotion,
      score: cosineSimilarity(embedding, vector)
    }));
    
    // Sort by score (highest first)
    similarities.sort((a, b) => b.score - a.score);
    

    // Map top emotions to mood categories
    const dominantEmotion = similarities[0].emotion;
    const emotionToMood = {
      'joy': 'very_happy',
      'sadness': 'sad',
      'anger': 'negative',
      'fear': 'negative',
      'surprise': 'positive',
      'love': 'happy',
      'relaxed': 'positive',
      'neutral': 'neutral'
    };
    
    const mood = emotionToMood[dominantEmotion] || 'neutral';
    
    return {
      mood,
      dominantEmotion,
      intensity: similarities[0].score,
      emotionScores: similarities,
      isToxic
    };
  } catch (error) {
    console.error("Error analyzing emotion with TensorFlow:", error);
    return fallbackEmotionAnalysis(text);
  }
}

// Fallback emotion analysis when TensorFlow fails
function fallbackEmotionAnalysis(text) {
  try {
    // Use the same vader-sentiment from your existing code
    const vader = require('vader-sentiment');
    const result = vader.SentimentIntensityAnalyzer.polarity_scores(text);
    const score = result.compound;
    
    // Map score to mood (same as your original function)
    let mood;
    if (score > 0.5) mood = 'very_happy';
    else if (score > 0.25) mood = 'happy';
    else if (score > 0) mood = 'positive';
    else if (score === 0) mood = 'neutral';
    else if (score > -0.25) mood = 'negative';
    else if (score > -0.5) mood = 'sad';
    else mood = 'very_sad';
    
    // Map mood to emotion
    const moodToEmotion = {
      'very_happy': 'joy',
      'happy': 'joy',
      'positive': 'relaxed',
      'neutral': 'neutral',
      'negative': 'anger',
      'sad': 'sadness',
      'very_sad': 'sadness'
    };
    
    return {
      mood,
      dominantEmotion: moodToEmotion[mood],
      intensity: Math.abs(score),
      emotionScores: [{
        emotion: moodToEmotion[mood],
        score: Math.abs(score)
      }],
      isToxic: false
    };
  } catch (error) {
    console.error("Error in fallback emotion analysis:", error);
    return {
      mood: 'neutral',
      dominantEmotion: 'neutral',
      intensity: 0.5,
      emotionScores: [{ emotion: 'neutral', score: 0.5 }],
      isToxic: false
    };
  }
}

// Music genre recommendation based on emotion
function recommendGenres(emotionAnalysis) {
  const { dominantEmotion, intensity, emotionScores } = emotionAnalysis;
  
  // Map emotions to music genres
  const emotionGenreMap = {
    'joy': ['pop', 'dance', 'funk', 'disco', 'happy'],
    'sadness': ['sad', 'indie', 'folk', 'acoustic', 'ambient', 'piano'],
    'anger': ['rock', 'metal', 'punk', 'grunge', 'alternative'],
    'fear': ['ambient', 'soundtrack', 'instrumental', 'electronic'],
    'surprise': ['experimental', 'electronic', 'indie', 'pop'],
    'love': ['r&b', 'soul', 'romantic', 'slow', 'ballad'],
    'relaxed': ['lofi', 'ambient', 'chillout', 'jazz', 'classical'],
    'neutral': ['pop', 'indie', 'alternative', 'rock', 'electronic']
  };
  
  // Intensity modifiers
  const intensityModifiers = {
    high: ['energetic', 'upbeat', 'fast'],
    medium: [],
    low: ['slow', 'calm', 'acoustic', 'instrumental']
  };
  
  // Get base genres for dominant emotion
  let genres = [...(emotionGenreMap[dominantEmotion] || [])];
  
  // Add secondary emotion influence if score is close
  if (emotionScores[1] && emotionScores[1].score > emotionScores[0].score * 0.8) {
    const secondaryGenres = emotionGenreMap[emotionScores[1].emotion] || [];
    genres = [...genres, ...secondaryGenres];
  }
  
  // Apply intensity modifiers
  const intensityLevel = intensity > 0.7 ? 'high' : (intensity > 0.4 ? 'medium' : 'low');
  genres = [...genres, ...intensityModifiers[intensityLevel]];
  
  // Deduplicate and randomize selection
  const uniqueGenres = [...new Set(genres)];
  const shuffled = uniqueGenres.sort(() => 0.5 - Math.random());
  
  return shuffled.slice(0, 5);
}

// Generate a human-like response based on emotion
function generateResponse(emotionAnalysis) {
  const { mood, dominantEmotion, intensity } = emotionAnalysis;
  
  // Base responses from your original code
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
  
  // Additional emotion-specific phrases
  const emotionPhrases = {
    'joy': [
      "Your enthusiasm is contagious!",
      "That positive energy is exactly what great music is all about.",
      "I love your upbeat vibe!"
    ],
    'sadness': [
      "Music can be such a comfort during tough times.",
      "Sometimes the right song can really help when you're feeling down.",
      "I hope these tracks bring you some peace."
    ],
    'anger': [
      "These tracks might help channel those intense feelings.",
      "Some powerful music that matches your energy.",
      "Sometimes music helps us process our stronger emotions."
    ],
    'relaxed': [
      "That laid-back energy inspired this selection.",
      "Perfect for keeping that chill vibe going.",
      "These tracks should complement your relaxed state."
    ],
    'neutral': [
      "Here's something to add some color to your day.",
      "A mix of tracks that might spark something interesting.",
      "A versatile playlist for whatever direction your mood takes."
    ]
  };
  
  // Get base response for mood
  let response = moodResponses[mood] || moodResponses['default'];
  
  // Add emotion-specific phrase if available
  const phrases = emotionPhrases[dominantEmotion];
  if (phrases && intensity > 0.5) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    response = `${randomPhrase} ${response}`;
  }
  
  return response;
}

module.exports = {
  analyzeEmotion,
  recommendGenres,
  generateResponse
};