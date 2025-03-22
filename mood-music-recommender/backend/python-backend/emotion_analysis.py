import numpy as np
import random
import scipy.spatial
from sentence_transformers import SentenceTransformer

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

# List of toxic terms
TOXIC_TERMS = ["hate", "kill", "hurt", "stupid", "idiot", "damn", "fuck", "shit"]

# Genre associations with emotions
GENRE_EMOTION_MAPPING = {
    "happy": ["pop", "dance", "electronic", "funk", "disco", "reggae"],
    "sad": ["blues", "acoustic", "classical", "jazz", "indie", "folk"],
    "angry": ["metal", "rock", "punk", "hardcore", "industrial", "grunge"],
    "neutral": ["alternative", "indie", "pop rock", "ambient", "world"],
    "excited": ["edm", "dance", "house", "techno", "dubstep", "drum and bass"],
    "relaxed": ["lo-fi", "ambient", "chillout", "jazz", "classical", "acoustic"],
    "nostalgic": ["classic rock", "oldies", "80s", "70s", "90s", "soul", "motown"]
}

# Genre descriptions for semantic similarity
GENRE_DESCRIPTIONS = {
    "pop": "Catchy, upbeat commercial music with strong melodies",
    "rock": "Guitar-driven music with attitude and energy",
    "hip hop": "Rhythmic music with rapping and urban beats",
    "jazz": "Improvisational music with complex harmonies and rhythms",
    "classical": "Orchestral or chamber music from the western tradition",
    "electronic": "Computer-generated music with synthesizers and digital sounds",
    "metal": "Heavy, aggressive rock music with distorted guitars",
    "indie": "Alternative music from independent labels with unique sounds",
    "folk": "Traditional acoustic music with storytelling",
    "blues": "Emotional music with specific chord progressions and soulful vocals",
    "reggae": "Jamaican music with offbeat rhythms and positive messages",
    "punk": "Fast, aggressive rock with anti-establishment themes",
    "soul": "Emotional, gospel-influenced R&B music",
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
    "classic rock": "Rock music from the 60s to 80s with guitar solos and anthems",
    "oldies": "Popular music from the 50s and 60s with simple structures",
    "grunge": "Dark, heavy rock from the early 90s with distorted guitars",
    "chillout": "Relaxing, downtempo electronic music",
    "world": "Music drawing from diverse global traditions and instruments"
}

# **Emotion Detection Function**
def detect_emotion(text):
    text_embedding = model.encode(text, convert_to_tensor=True)

    emotion_scores = {emotion: 1 - scipy.spatial.distance.cosine(text_embedding, emb)
                      for emotion, emb in EMOTIONS.items()}

    top_emotions = sorted(emotion_scores.items(), key=lambda x: x[1], reverse=True)[:3]

    dominant_emotion = top_emotions[0][0]
    confidence = sum(score for _, score in top_emotions) / len(top_emotions)

    if confidence < 0.5:
        dominant_emotion = f"{top_emotions[0][0]}-{top_emotions[1][0]}"

    return dominant_emotion, confidence

# **Intent Detection Function**
def detect_intent(text, context=[]):
    combined_text = " ".join(context[-3:] + [text])  # Use last 3 messages
    text_embedding = model.encode(combined_text, convert_to_tensor=True)

    intent_scores = {intent: 1 - scipy.spatial.distance.cosine(text_embedding, emb)
                     for intent, emb in INTENTS.items()}
    
    best_intent = max(intent_scores, key=intent_scores.get)
    confidence = intent_scores[best_intent]
    
    return best_intent if confidence > 0.5 else "general_conversation"

# **Genre Recommendation Function**
def recommend_genres(text, emotion):
    text_embedding = model.encode(text, convert_to_tensor=True)

    base_genres = GENRE_EMOTION_MAPPING.get(emotion.split("-")[0], [])

    genre_scores = {
        genre: 1 - scipy.spatial.distance.cosine(text_embedding, model.encode(desc))
        for genre, desc in GENRE_DESCRIPTIONS.items()
    }

    top_genres = sorted(genre_scores.items(), key=lambda x: x[1], reverse=True)[:5]

    return list(set(base_genres + [g for g, _ in top_genres]))[:5]

# **Dynamic Response Generation**
def generate_response(intent, emotion, recommended_genres, is_toxic):
    if is_toxic:
        return "Let's keep things positive. How about some uplifting music?"

    responses = {
        "happy": "That's awesome! Want to keep the good vibes with some {genres}?",
        "sad": "I'm here for you. Maybe some {genres} can help?",
        "angry": "I get it! Maybe some powerful {genres} music will help vent it out?",
        "nostalgic": "Let's rewind time! Want to hear some {genres} classics?",
        "relaxed": "Chilling sounds great! How about some {genres} music?",
        "excited": "Feeling pumped? Let's go with some energetic {genres}!",
        "neutral": "Sounds good! Want me to suggest some {genres}?"
    }

    return responses.get(emotion.split("-")[0], responses["neutral"]).format(
        genres=", ".join(recommended_genres)
    )

# **Main Function**
def chat_music_recommender(user_input, context=[]):
    dominant_emotion, confidence = detect_emotion(user_input)
    detected_intent = detect_intent(user_input, context)
    is_toxic = any(term in user_input.lower() for term in TOXIC_TERMS)
    recommended_genres = recommend_genres(user_input, dominant_emotion)
    response = generate_response(detected_intent, dominant_emotion, recommended_genres, is_toxic)

    return {"emotion": dominant_emotion, "intent": detected_intent, "genres": recommended_genres, "response": response}