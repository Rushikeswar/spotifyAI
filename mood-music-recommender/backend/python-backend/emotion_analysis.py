import random
import scipy.spatial # Import OpenAI for GPT-based response generation
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import random
import requests
import torch
from transformers import pipeline
import os

load_dotenv()  # This loads the variables from .env


# Load a lightweight sentence embedding model
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

# Toxic terms list
TOXIC_TERMS = ["hate", "kill", "hurt", "stupid", "idiot", "damn", "fuck", "shit"]

# # Musical characteristics based on emotion
EMOTION_CHARACTERISTICS = {
    "happy": {
        "tempo": "fast", 
        "mode": "major", 
        "energy": "high",
        "keywords": ["upbeat", "dance", "party", "fun", "energetic", "pop", "disco", "funk"]
    },
    "sad": {
        "tempo": "slow", 
        "mode": "minor", 
        "energy": "low",
        "keywords": ["melancholic", "slow", "emotional", "dark", "piano", "acoustic", "ballad", "folk"]
    },
    "angry": {
        "tempo": "fast", 
        "mode": "minor", 
        "energy": "high",
        "keywords": ["intense", "heavy", "loud", "aggressive", "metal", "rock", "punk", "hardcore"]
    },
    "neutral": {
        "tempo": "moderate", 
        "mode": "variable", 
        "energy": "moderate",
        "keywords": ["balanced", "standard", "classic", "mainstream"]
    },
    "excited": {
        "tempo": "fast", 
        "mode": "major", 
        "energy": "high",
        "keywords": ["energetic", "dance", "upbeat", "party", "edm", "electronic"]
    },
    "relaxed": {
        "tempo": "slow", 
        "mode": "variable", 
        "energy": "low",
        "keywords": ["chill", "calm", "peaceful", "ambient", "lofi", "jazz", "acoustic"]
    },
    "nostalgic": {
        "tempo": "moderate", 
        "mode": "variable", 
        "energy": "moderate",
        "keywords": ["oldies", "retro", "classic", "throwback", "80s", "90s", "70s"]
    }
}
# Define genre association with emotions
GENRE_EMOTION_MAPPING = {
    "happy": ["pop", "dance", "electronic", "funk", "disco", "reggae"],
    "sad": ["blues", "acoustic", "classical", "jazz", "indie", "folk"],
    "angry": ["metal", "rock", "punk", "hardcore", "industrial", "grunge"],
    "neutral": ["alternative", "indie", "pop rock", "ambient", "world"],
    "excited": ["edm", "dance", "house", "techno", "dubstep", "drum and bass"],
    "relaxed": ["lo-fi", "ambient", "chillout", "jazz", "classical", "acoustic"],
    "nostalgic": ["classic rock", "oldies", "80s", "70s", "90s", "soul", "motown"]
}

def detect_emotion_and_generate_response(text, context=None, userGenres=None):
    """
    Detects the emotion and intent of a given text, recommends suitable genres,
    and generates a dynamic response.
    """
    if context is None:
        context = []
    if userGenres is None:
        userGenres = []
        
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
    
    # Get top 3 emotions for better matching
    top_emotions = sorted(emotion_scores.items(), key=lambda x: x[1], reverse=True)[:3]
    
    # Recommend genres
    recommended_genres = recommend_genres(text, dominant_emotion, userGenres, context, top_emotions)
    
    # Generate response dynamically using GPT
    response = generate_dynamic_response(text, intent, dominant_emotion, context, is_toxic)
    
    return {
        "dominantEmotion": dominant_emotion,
        "confidence": confidence,
        "isToxic": is_toxic,
        "recommendedGenres": recommended_genres,
        "generatedResponse": response
    }



def generate_dynamic_response(text, intent, emotion, context, is_toxic):

    """
    Generate a dynamic conversational response using a free cloud-based LLM.
    
    Args:
        text (str): Original user input
        intent (str): Detected intent
        emotion (str): Detected emotional state
        context (list): Conversation context
        is_toxic (bool): Whether the input contains toxic language
    
    Returns:
        str: Dynamically generated response
    """
    HUGGINGFACE_TOKEN=os.environ.get('HUGGINGFACE_TOKEN')
    # Handle toxic content
    if is_toxic:
        return "Let's keep the conversation positive. I'm here to help."
    
    # Prepare inputs
    emotion = emotion or 'neutral'
    
    # Construct prompt
    prompt = (
        f"User's emotion: {emotion}\n"
        f"User input: {text}\n"
        "You are an AI chatbot in a music recommendation system, but you do NOT recommend songs or genres. "
        "Your role is to engage in friendly, human-like conversation by understanding the user's emotions and intent. "
        "Respond naturally in a short,simple, empathetic, and engaging manner, within 20 words without discussing specific music preferences.But ask him to listen to songs generated \n"
        "Assistant's response:" )
    
    try:
        # Use a cloud-based LLM API (e.g., Hugging Face Inference API)
        api_url = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1"
        headers = {"Authorization": f"Bearer {HUGGINGFACE_TOKEN}"}
        payload = {"inputs": prompt, "parameters": {"temperature": 0.7, "max_length": 150}}
        
        response = requests.post(api_url, headers=headers, json=payload)
        result = response.json()
        
        if "error" in result:
            raise Exception(result["error"])
        
        generated_text = result[0]["generated_text"]
        response_start = generated_text.find("Assistant's response:") + len("Assistant's response:")
        clean_response = generated_text[response_start:].strip()

        # Fallback responses if needed
        if not clean_response or len(clean_response) < 20:
            fallback_responses = [
                "That's interesting! Tell me more.",
                "I'd love to hear more about that.",
                "Could you elaborate on that?"
            ]
            return random.choice(fallback_responses)
        
        return clean_response
    
    except Exception as e:
        print(f"Response generation error: {e}")
        return "I'm here to chat, but I might need a moment to get back on track."



GENRE_DESCRIPTIONS = {
    "pop": "Catchy, upbeat commercial music with strong melodies",
    "rock": "Guitar-driven music with attitude and energy",
    "hip hop": "Rhythmic music with rapping and urban beats",
    "jazz": "Improvisational music with complex harmonies and rhythms",
    "classical": "Orchestral or chamber music from the western tradition",
    "electronic": "Computer-generated music with synthesizers and digital sounds",
    "country": "Folk-derived music with storytelling and rural themes",
    "r&b": "Rhythm and blues with soulful vocals and grooves",
    "metal": "Heavy, aggressive rock music with distorted guitars",
    "indie": "Alternative music from independent labels with unique sounds",
    "folk": "Traditional acoustic music with storytelling",
    "blues": "Emotional music with specific chord progressions and soulful vocals",
    "reggae": "Jamaican music with offbeat rhythms and positive messages",
    "punk": "Fast, aggressive rock with anti-establishment themes",
    "soul": "Emotional, gospel-influenced r&b music",
    "funk": "Rhythmic dance music with prominent bass lines",
    "disco": "Upbeat dance music from the 70s with four-on-the-floor beats",
    "ambient": "Atmospheric music focusing on sound textures rather than rhythm",
    "edm": "Electronic dance music designed for clubs and festivals",
    "lo-fi": "Low fidelity relaxing beats, often with nostalgic elements",
    "house": "Electronic dance music with four-on-the-floor beats and samples",
    "techno": "Repetitive, electronic dance music with artificial sounds",
    "acoustic": "Unplugged, natural instrument-based music",
    "alternative": "Non-mainstream rock music with diverse influences",
    "dubstep": "Electronic music with emphasized sub-bass and rhythmic patterns",
    "trap": "Hip hop subgenre with heavy bass, rapid hi-hats, and dark themes",
    "classic rock": "Rock music from the 60s to 80s with guitar solos and anthems",
    "80s": "Synthesizer-heavy pop and rock music from the 1980s",
    "90s": "Diverse music from the 1990s including grunge, pop, and early hip hop",
    "oldies": "Popular music from the 50s and 60s with simple structures",
    "grunge": "Dark, heavy rock from the early 90s with distorted guitars",
    "drum and bass": "Fast breakbeat electronic music with heavy bass lines",
    "chillout": "Relaxing, downtempo electronic music",
    "world": "Music drawing from diverse global traditions and instruments"
}


def recommend_genres(text, emotion, userGenres, context, top_emotions):
    """
    Recommends top 5 genres based on detected emotion and semantic matching with user's preferences.
    
    Args:
        text (str): User's input text
        emotion (str): Detected primary emotion
        userGenres (list): List of user's preferred genres
        context (list): Conversation history
        top_emotions (list): List of (emotion, score) tuples for secondary emotion matching
    
    Returns:
        list: Top 5 recommended genres sorted by relevance
    """
    # If no user genres provided, recommend based on emotion only
    if not userGenres:
        # Return a subset of emotion-based genres (up to 5)
        emotion_genres = GENRE_EMOTION_MAPPING.get(emotion, ["pop", "rock", "alternative", "electronic", "indie"])
        return random.sample(emotion_genres, min(5, len(emotion_genres)))
    
    # Create embeddings for user text and context
    combined_text = text
    if context:
        # Combine recent context (last 3 messages) if available
        recent_context = context[-3:] if len(context) > 3 else context
        combined_text = " ".join([combined_text] + [msg for msg in recent_context])
    
    text_embedding = model.encode(combined_text)
    
    # Create genre embeddings based on their descriptions
    genre_embeddings = {}
    for genre in userGenres:
        if genre.lower() in GENRE_DESCRIPTIONS:
            genre_embeddings[genre] = model.encode(GENRE_DESCRIPTIONS[genre.lower()])
        else:
            # For genres not in our descriptions, use the genre name itself
            genre_embeddings[genre] = model.encode(f"Music in the {genre} genre")
    
    # Get emotion characteristics for scoring
    primary_characteristics = EMOTION_CHARACTERISTICS.get(emotion, EMOTION_CHARACTERISTICS["neutral"])
    
    # Calculate scores for each genre
    genre_scores = {}
    for genre, embedding in genre_embeddings.items():
        genre_lower = genre.lower()
        
        # Base score from semantic similarity
        similarity = 1 - scipy.spatial.distance.cosine(text_embedding, embedding)
        
        # Start with the base similarity score
        score = similarity
        
        # 1. Boost score if genre matches the detected emotion keywords
        keyword_boost = 0
        for keyword in primary_characteristics["keywords"]:
            if keyword in genre_lower or genre_lower in keyword:
                keyword_boost += 0.1
        
        # 2. Boost score based on tempo matching
        if primary_characteristics["tempo"] == "fast" and any(term in genre_lower for term in 
                                                           ["dance", "techno", "house", "edm", "rock", "metal", "punk"]):
            score += 0.15
        elif primary_characteristics["tempo"] == "slow" and any(term in genre_lower for term in 
                                                             ["ballad", "ambient", "chill", "acoustic", "slow"]):
            score += 0.15
        
        # 3. Boost score based on energy matching
        if primary_characteristics["energy"] == "high" and any(term in genre_lower for term in 
                                                            ["rock", "dance", "metal", "punk", "edm"]):
            score += 0.15
        elif primary_characteristics["energy"] == "low" and any(term in genre_lower for term in 
                                                             ["ambient", "acoustic", "chill", "sleep"]):
            score += 0.15
        
        # 4. Boost score based on mode matching
        if primary_characteristics["mode"] == "minor" and any(term in genre_lower for term in 
                                                           ["blues", "dark", "metal", "emo"]):
            score += 0.1
        elif primary_characteristics["mode"] == "major" and any(term in genre_lower for term in 
                                                             ["pop", "happy"]):
            score += 0.1
            
        # 5. Match with secondary emotions
        for i, (secondary_emotion, emotion_score) in enumerate(top_emotions[1:], 1):
            sec_characteristics = EMOTION_CHARACTERISTICS.get(secondary_emotion, {})
            sec_keywords = sec_characteristics.get("keywords", [])
            
            # Weight based on secondary emotion score relative to primary
            weight = emotion_score / top_emotions[0][1]
            
            # Check for keyword matches with secondary emotion
            for keyword in sec_keywords:
                if keyword in genre_lower or genre_lower in keyword:
                    score += 0.05 * weight
        
        # Add the final calculated score
        score += keyword_boost
        genre_scores[genre] = min(score, 1.0)  # Cap at 1.0
    
    # Sort genres by score and return top 5
    sorted_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)
    
    # Get the top 5 genres (or all if fewer than 5)
    top_genres = [genre for genre, _ in sorted_genres[:min(5, len(sorted_genres))]]
    
    # If fewer than 5 genres matched, add additional genres from user preferences
    if len(top_genres) < 5 and len(userGenres) > len(top_genres):
        remaining_genres = [g for g in userGenres if g not in top_genres]
        top_genres.extend(remaining_genres[:5-len(top_genres)])
    
    return top_genres
