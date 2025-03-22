from flask import Flask, request, jsonify
from emotion_analysis import detect_emotion_and_generate_response
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route("/analyze", methods=["POST"])
def analyze_text():
    data = request.json
    print(data)
    text = data.get('text', '')
    context = data.get('context', [])
    userGenres=data.get('userGenres', [])
    result = detect_emotion_and_generate_response(text, context,userGenres)
    return jsonify(result)

if __name__ == "__main__":
    # Get port from environment variable or default to 5001
    port = int(os.environ.get("PORT", 5001))
    app.run(host='0.0.0.0', port=port)