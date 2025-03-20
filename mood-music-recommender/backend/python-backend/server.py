from flask import Flask, request, jsonify
from emotion_analysis import detect_emotion_and_generate_response
from flask_cors import CORS
app = Flask(__name__)
CORS(app)

@app.route("/analyze", methods=["POST"])
def analyze_text():
    data = request.json
    print(data)
    text = data.get('text', '')
    context = data.get('context', [])
    
    result = detect_emotion_and_generate_response(text, context)
    return jsonify(result)

if __name__ == "__main__":
    app.run(port=5001)
