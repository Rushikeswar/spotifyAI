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
        "Respond naturally in a short,simple, empathetic, and engaging manner, less than  20 words without discussing specific music preferences.But ask him to listen to songs generated \n"
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
        print(result)
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
    Recommends top 5 genres based on LLM-based mapping
    
    Args:
        text (str): User's input text
        emotion (str): Detected primary emotion
        userGenres (list): List of user's Spotify genres
        context (list): Conversation history
        top_emotions (list): List of top emotions
    
    Returns:
        list: Top recommended genres
    """
    HUGGINGFACE_TOKEN = os.environ.get('HUGGINGFACE_TOKEN')
    
    # If no user genres provided, use emotion-based genres
    if not userGenres:
        return GENRE_EMOTION_MAPPING.get(emotion, ["pop", "rock", "alternative", "electronic", "indie"])
    
    # Construct a detailed prompt for genre mapping
    prompt = (
        f"Genre Mapping Request:\n"
        f"User Input: {text}\n"
        f"Detected Emotion: {emotion}\n"
        f"User's Current Genres: {', '.join(userGenres)}\n\n"
        "Task: Recommend the top 5 most relevant music genres among the user's genres based on the user's input ,detected emotion, and their existing genre preferences. "
        "Provide ONLY a comma-separated list of genres among User's Current Genres no new genres without any additional explanation. "
        "Use specific, recognizable genre names.\n"
        "Recommended Genres:"
    )
    
    try:
        # Use the same Hugging Face API endpoint
        api_url = "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1"
        headers = {"Authorization": f"Bearer {HUGGINGFACE_TOKEN}"}
        payload = {
            "inputs": prompt, 
            "parameters": {
                "temperature": 0.7, 
                "max_length": 100,
                "num_return_sequences": 1
            }
        }
        
        response = requests.post(api_url, headers=headers, json=payload)
        result = response.json()
        
        if "error" in result:
            raise Exception(result["error"])
        
        # Extract generated text and clean up
        generated_text = result[0]["generated_text"]
        
        # Extract genres from the generated text
        start_index = generated_text.find("Recommended Genres:") + len("Recommended Genres:")
        genres_text = generated_text[start_index:].strip()
        
        # Split and clean genres
        recommended_genres = [
            genre.strip().lower() 
            for genre in genres_text.split(',')
            if genre.strip()
        ]
        
        # Fallback if no genres generated
        if not recommended_genres:
            recommended_genres = list(GENRE_EMOTION_MAPPING.get(emotion, ["pop", "rock", "alternative", "electronic", "indie"]))
        
        # Limit to 5 genres and remove duplicates
        recommended_genres = list(dict.fromkeys(recommended_genres))[:5]
        print(recommend_genres)
        return recommended_genres
    
    except Exception as e:
        print(f"Genre mapping error: {e}")
        # Fallback to emotion-based genres
        return list(GENRE_EMOTION_MAPPING.get(emotion, ["pop", "rock", "alternative", "electronic", "indie"]))
