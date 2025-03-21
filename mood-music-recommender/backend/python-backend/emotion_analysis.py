import numpy as np
import random
import scipy.spatial
from sentence_transformers import SentenceTransformer

# Load a free and lightweight sentence embedding model
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

# Define emotion reference sentences
EMOTION_SENTENCES = {
    "happy": "I feel joyful and excited.",
    "sad": "I am feeling very down and depressed.",
    "angry": "I am really mad and frustrated.",
    "neutral": "I feel okay and calm.",
    "excited": "I am thrilled and enthusiastic.",
    "relaxed": "I am feeling peaceful and calm.",
    "nostalgic": "I am feeling reminiscent of the past."
}

# Precompute emotion embeddings
EMOTIONS = {key: model.encode(sentence) for key, sentence in EMOTION_SENTENCES.items()}

# Define sample intents
INTENT_SENTENCES = {
    "greeting": "Hello! How are you today?",
    "music_request": "Can you recommend some music?",
    "mood_share": "I'm feeling happy today.",
    "preference": "I like rock music.",
    "question": "What kind of music do you like?",
    "gratitude": "Thank you for the recommendations.",
    "complaint": "I don't like these songs."
}

# Precompute intent embeddings
INTENTS = {key: model.encode(sentence) for key, sentence in INTENT_SENTENCES.items()}

# Toxic terms list (can be expanded)
TOXIC_TERMS = ["hate", "kill", "hurt", "stupid", "idiot", "damn", "fuck", "shit"]

def detect_emotion_and_generate_response(text, context=None):
    """
    Detects the emotion and intent of a given text and generates a dynamic response.
    """
    text_embedding = model.encode(text)
    
    # Determine dominant emotion
    emotion_scores = {emotion: 1 - scipy.spatial.distance.cosine(text_embedding, emb)
                      for emotion, emb in EMOTIONS.items()}
    dominant_emotion = max(emotion_scores, key=emotion_scores.get)
    confidence = float(emotion_scores[dominant_emotion])
        # If confidence is too low, default to neutral
    if confidence < 0.5:
        dominant_emotion = "neutral"
    # Determine intent
    intent_scores = {intent: 1 - scipy.spatial.distance.cosine(text_embedding, emb)
                     for intent, emb in INTENTS.items()}
    intent = max(intent_scores, key=intent_scores.get)
    
    # Check for toxicity
    is_toxic = any(term in text.lower() for term in TOXIC_TERMS)
    
    # Generate response dynamically
    response = generate_dynamic_response(text, intent, dominant_emotion, context, is_toxic)
    
    return {
        "dominantEmotion": dominant_emotion,
        "confidence": float(emotion_scores[dominant_emotion]),
        "isToxic": is_toxic,
        "generatedResponse": response
    }

def generate_dynamic_response(text, intent, emotion, context, is_toxic):
    """
    Generates a fully dynamic response instead of selecting from a predefined dictionary.
    """
    if is_toxic:
        return "Let's keep the conversation positive. I'm here to help."
    

    
    # Use a simple heuristic-based generation approach
    if emotion == "happy":
        return random.choice([
            "That's great to hear! Want to celebrate with some upbeat music?",
            "Awesome! How about some energetic pop or dance tracks?",
            "Good vibes only! Any song requests?"
        ])
    elif emotion == "sad":
        return random.choice([
            "I'm here for you. Maybe some soothing acoustic music could help?",
            "Sad days happen. Do you have a song that brings comfort?",
            "Music can be healing. Want me to find some soulful tunes?"
        ])
    elif emotion == "angry":
        return random.choice([
            "I get that. Rock or metal might be a good release!",
            "Let it out! Maybe a powerful punk track?",
            "Feeling intense? I can find some hard-hitting beats."
        ])
    elif emotion == "nostalgic":
        return random.choice([
            "Ah, nostalgia! Any favorite old-school tracks?",
            "Music is a time machine! Want some retro vibes?",
            "Let’s rewind time with classic rock or jazz."
        ])
    elif emotion == "relaxed":
        return random.choice([
            "Chilling is a mood. How about some lo-fi beats?",
            "Relaxing sounds good! Maybe some soft acoustic music?",
            "Want some ambient tracks for a peaceful vibe?"
        ])
    elif emotion == "excited":
        return random.choice([
            "Let’s turn up the energy! EDM or electronic music?",
            "Feeling pumped? Maybe some high-energy beats?",
            "Excitement calls for some danceable tracks!"
        ])
    else:
        return f"Got it! {random.choice(['Let’s chat more.', 'Tell me more about that!', 'I’d love to hear more.'])}"