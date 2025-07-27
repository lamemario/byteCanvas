from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import json
import os

app = Flask(__name__)
CORS(app)

# Initialise Firebase
try:
    # Check if Firebase credentials are provided via environment variable
    firebase_creds = os.getenv('FIREBASE_CREDENTIALS')
    if firebase_creds:
        # Use environment variable
        cred_dict = json.loads(firebase_creds)
        cred = credentials.Certificate(cred_dict)
    else:
        # Fallback to file (for development)
        cred = credentials.Certificate('firebase-service-account.json')
    
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase initialized successfully")
except Exception as e:
    print(f"Firebase initialization error: {e}")
    db = None

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "message": "Hey, Backend is running! Yipee!",
        "status": "running",
        "firebase": "connected" if db else "disconnected",
        "endpoints": {
            "health": "GET /",
            "report": "POST /report",
            "reports": "GET /reports"
        }
    })

@app.route('/report', methods=['POST'])
def report_link():
    try:
        data = request.get_json()
        
        if not data or 'url' not in data:
            return jsonify({"success": False, "error": "URL is required"}), 400
        
        url = data['url']
        
        # Validate URL
        if not url.startswith(('http://', 'https://')):
            return jsonify({"success": False, "error": "Invalid URL format"}), 400
        
        # Store in Firebase
        if db:
            from datetime import datetime
            report_data = {
                'url': url,
                'timestamp': firestore.SERVER_TIMESTAMP,
                'created_at': datetime.utcnow().isoformat(),  # Add explicit timestamp
                'reported_by': 'extension',
                'status': 'pending'
            }
            
            db.collection('reports').add(report_data)
            print(f"Report stored: {url}")
        
        return jsonify({
            "success": True,
            "message": "Report submitted successfully",
            "url": url
        })
        
    except Exception as e:
        print(f"Error processing report: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

@app.route('/reports', methods=['GET'])
def get_reports():
    try:
        if not db:
            return jsonify({"success": False, "error": "Database not connected"}), 500
        
        reports = []
        # Order by created_at first, then by timestamp for better chronological order
        docs = db.collection('reports').order_by('created_at', direction=firestore.Query.DESCENDING).order_by('timestamp', direction=firestore.Query.DESCENDING).limit(50).stream()
        
        for doc in docs:
            report_data = doc.to_dict()
            report_data['id'] = doc.id
            reports.append(report_data)
        
        return jsonify({
            "success": True,
            "reports": reports,
            "count": len(reports)
        })
        
    except Exception as e:
        print(f"Error fetching reports: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500

@app.route('/test-firebase', methods=['POST'])
def test_firebase():
    try:
        if not db:
            return jsonify({"success": False, "error": "Firebase not connected"}), 500
        
        from datetime import datetime
        # Test data
        test_data = {
            'url': 'https://test-example.com',
            'timestamp': firestore.SERVER_TIMESTAMP,
            'created_at': datetime.utcnow().isoformat(),  # Add explicit timestamp
            'reported_by': 'test',
            'status': 'test',
            'test_message': 'This is a test entry to verify Firebase connection!'
        }
        
        # Add to Firebase
        doc_ref = db.collection('reports').add(test_data)
        
        return jsonify({
            "success": True,
            "message": "Test data pushed to Firebase successfully!",
            "document_id": doc_ref[1].id,
            "test_data": {
                "url": test_data['url'],
                "reported_by": test_data['reported_by'],
                "status": test_data['status'],
                "test_message": test_data['test_message'],
                "created_at": test_data['created_at']
            }
        })
        
    except Exception as e:
        print(f"Firebase test error: {e}")
        return jsonify({
            "success": False,
            "error": f"Firebase test failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    print("Starting NUS Secure Access Backend...")
    print("Backend will be available at: http://localhost:5001")
    app.run(debug=True, host='0.0.0.0', port=5001) 