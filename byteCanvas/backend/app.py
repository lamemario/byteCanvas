import firebase_admin
from firebase_admin import credentials, firestore
from flask import Flask, request, jsonify
from flask_cors import CORS
from urllib.parse import urlparse
import datetime

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize Firebase Admin SDK
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

@app.route("/")
def index():
    return "ByteCanvas Flask backend is running!"

@app.route("/report", methods=["POST"])
def report():
    data = request.get_json()
    url = data.get("url", "")

    # 1. Check for required field and length
    if not url or len(url) > 2048:
        return jsonify({"success": False, "error": "Missing or too long URL"}), 400

    # 2. Parse and validate URL
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError
    except Exception:
        return jsonify({"success": False, "error": "Invalid URL format"}), 400

    # 3. Normalize URL
    normalized_url = parsed.geturl().strip()

    # 4. Store in Firestore
    report_data = {
        "url": normalized_url,
        "reported_at": datetime.datetime.utcnow(),
        "meta": data.get("meta", {})
    }
    db.collection("reports").add(report_data)
    return jsonify({"success": True, "message": "Report received"})

if __name__ == "__main__":
    app.run(debug=True)