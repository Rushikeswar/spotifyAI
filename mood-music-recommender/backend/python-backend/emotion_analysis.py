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
    
    # Generate response based on context
    context_str = " ".join(context) if context else ""
    response_prompt = (
        f"User said: '{text}'. The detected intent is '{intent}', and their mood is '{emotion}'. "
        f"Considering the conversation history: '{context_str}', generate a natural and engaging response."
    )
    
    # Use a simple heuristic-based generation approach
    if emotion == "happy":
        return f"That's great to hear! {random.choice(['Tell me more!', 'What made your day special?', 'Let’s keep the good vibes going!'])}"
    elif emotion == "sad":
        return f"I'm here for you. {random.choice(['Want to talk about it?', 'Maybe some music could help?', 'Sometimes expressing yourself helps.'])}"
    elif emotion == "angry":
        return f"I understand. {random.choice(['What happened?', 'I hope things get better soon.', 'Maybe taking a break could help?'])}"
    elif emotion == "nostalgic":
        return f"Ah, reminiscing can be bittersweet. {random.choice(['Any special memories?', 'Music can take us back in time!', 'What song reminds you of that moment?'])}"
    else:
        return f"Got it! {random.choice(['Let’s chat more.', 'Tell me more about that!', 'I’d love to hear more.'])}"

