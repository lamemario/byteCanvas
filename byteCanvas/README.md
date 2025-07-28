# NUS Secure Access Tracker

This is our attempt at a Chrome extension that protects NUS students from phishing attacks by providing real-time link scanning, threat detection, and user reporting capabilities!

## 🛡️ Overview

NUS Secure Access Tracker is a security extension designed specifically for NUS students. It scans webpages in real-time, detects potential phishing threats, and provides an intuitive interface for reporting suspicious links. The extension integrates with a Flask backend and Firebase database for threat management.

## ✨ Features

### 🔍 Real-Time Scanning
- **Automatic scanning** of all links on webpages
- **Multi-category detection**: Safe, Warning, and Danger classifications
- **Google Safe Browsing integration** for malware and phishing detection
- **Heuristic analysis** for deceptive URLs and emotional triggers that we attempted to think about based on NUS' phishing scam notices in https://nusit.nus.edu.sg/its/what-is-phishing/ and safety modules

### 🎨 Modern User Interface
- **Gradient design** with blue theme
- **Transition animations** to have a smooth experience
- **Responsive popup** with elegant scrollbars
- **Tabbed results** (Safe, Warnings, Danger) for organised viewing
- **Search functionality** to find specific links by text or URL, as there may be multiple links on the page

### 📊 Detailed Analysis
- **Link categorisation** with color-coded status indicators on the side of each link's tab
- **Expandable results** showing full URLs, text content, and detection reasons
- **Copy URL functionality** for easy sharing, and reporting
- **Path tracking** to identify where links are located on the page

### 🚨 Threat Detection
- **Deceptive URL detection** (e.g., fake domains)
- **Emotional trigger identification** (urgent, help, sign in)
- **Sender mismatch detection** for email analysis on outlook
- **External email banner recognition**
- **Suspicious Last Part of the Domain(TLD) identification**

### 📝 Reporting System
- **User-friendly reporting** of suspicious links
- **Backend integration** with Flask API
- **Firebase storage** for threat database

### 💡 Educational Features
- **NUS-specific phishing tips**
- **Security best practices**
- **Real-time threat explanations**
- **Educational content** for awareness

## 🏗️ Architecture

### Frontend (Chrome Extension)
- **Manifest V3 file configuration** for modern Chrome compatibility where you're creating a system using just background.js, content.js and a popup.js, something required since 2023
- **Service Worker** (background.js) for persistent scanning
- **Content Script** (content.js) for page analysis
- **Popup Interface** (popup.html/css/js) for user interaction
- **Real-time communication** between components

### Backend (Flask API)
- **RESTful endpoints** for report handling, where we're following this structure: Frontend (Extension) → HTTP Request → Backend (Flask) → Response
- **Firebase Admin SDK** integration
- **CORS support** for cross-origin requests as the extension and backend run on different domains, and browsers block cross-origin requests by default for security. We needed CORS to facilitate the use of the reporting feature
- **Error handling** and validation, to ensure the database only takes in valid URLs
- **Runs on port 5001** to avoid conflicts with other services

### Database (Firebase)
- **Firestore** for structured data storage
- **Real-time updates** for threat database
- **Scalable architecture** for future growth

## 🚀 Installation & Setup

### For Users
1. **Download the extension** from the Chrome Web Store
2. **Click the extension icon** in your Chrome toolbar
3. **Start scanning** by clicking "Scan This Page"
4. **Review results** in the organised tabs
5. **Report suspicious links** using the reporting feature

### For Developers

#### Prerequisites
- Google Chrome browser
- Python 3.7+ (for backend)
- Firebase project (for database)

#### Extension Setup
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd byteCanvas
   ```

2. **Load the extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select the `byteCanvas/extension/` folder
   - The extension icon should appear in your toolbar

#### Backend Setup
1. **Navigate to backend directory**:
   ```bash
   cd byteCanvas/backend
   ```

2. **Create virtual environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # We worked on macs! So, On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Firebase**:
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Navigate to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file as `firebase-service-account.json` in the `backend/` directory
   - **Alternative**: Set environment variable `FIREBASE_CREDENTIALS` with the JSON content

5. **Run the backend**:
   ```bash
   python app.py
   ```
   The backend will start on **http://localhost:5001** and display "Hey, Backend is running! Yipee!"

## 📁 Project Structure

```
byteCanvas/
├── extension/               # Chrome extension
│   ├── manifest.json        # Extension configuration
│   ├── background.js        # Service worker
│   ├── content.js           # Content script
│   ├── popup.html           # Popup interface
│   ├── popup.css            # Styles
│   ├── popup.js             # Popup logic
│   └── icons/               # Extension icons
│       ├── icon.svg         # Source SVG file
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── backend/                 # Flask backend
│   ├── app.py               # Main Flask application
│   ├── requirements.txt     # Python dependencies
│   └── env.example         # Environment variables template
└── README.md                # This file
```

## 🧪 Testing

### Extension Testing
1. **Load the extension** in Chrome
2. **Visit test pages**:
   - `https://nus.edu.sg` (should show safe links)
   - `https://nusit.nus.edu.sg/its/` (should show warnings)
   - `https://testsafebrowsing.appspot.com/s/phishing.html` (Bypass Google's warning and get to the page, extension should show danger)
3. **Test search functionality** by typing in the search box
4. **Test reporting** by submitting suspicious URLs

### Backend Testing
1. **Start the Flask server** (runs on port 5001)
2. **Test the API endpoints**:
   - `GET /` - Health check (returns "Hey, Backend is running! Yipee!")
   - `POST /report` - Submit suspicious link
   - `POST /test-firebase` - Test Firebase connection
3. **Verify Firebase integration** by checking the database

## 🔮 Future Enhancements

- **Machine learning** integration for improved detection
- **Real-time threat database** updates
- **Advanced analytics** dashboard for security insights

## 🔐 Security Setup

**Before deploying, you MUST secure your credentials:**

#### 1. **Google Safe Browsing API Key Setup**

**Step-by-step guide:**

1. **Go to Google Cloud Console**:
   - Visit [https://console.cloud.google.com/]
   - Sign in with your Google account

2. **Create a new project** (or select existing):
   - Click on the project dropdown at the top
   - Click "New Project"
   - Name it something like "NUS-Safe-Browsing"
   - Click "Create"

3. **Enable Safe Browsing API**:
   - Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
   - Search for "Safe Browsing API"
   - Click on "Safe Browsing API"
   - Click "Enable"

4. **Create API Key**:
   - Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key

5. **Restrict the API Key** (Recommended):
   - Click on the API key you just created
   - Under "Application restrictions", select "HTTP referrers"
   - Add your domain or leave unrestricted for testing
   - Under "API restrictions", select "Restrict key"
   - Select "Safe Browsing API" from the dropdown
   - Click "Save"

6. **Update the extension**:
   - Open `extension/background.js`
   - Replace `YOUR_GOOGLE_SAFE_BROWSING_API_KEY_HERE` with your actual API key

#### 2. **Firebase Project Setup**

**Step-by-step guide:**

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Create a project"
   - Name it something like "nus-safe-access"
   - Enable Google Analytics (optional)
   - Click "Create project"

2. **Set up Firestore Database**:
   - In your Firebase project, click "Firestore Database" in the left sidebar
   - Click "Create database"
   - Choose "Start in test mode" (for development)
   - Select a location (choose closest to you)
   - Click "Done"

3. **Create Service Account**:
   - Go to Project Settings (gear icon)
   - Click "Service accounts" tab
   - Click "Generate new private key"
   - Choose "Firebase Admin SDK"
   - Click "Generate key"
   - Download the JSON file

4. **Set up credentials**:
   - **Option A (Recommended)**: Set environment variable:
     ```bash
     export FIREBASE_CREDENTIALS='{"type":"service_account",...}'
     ```
   - **Option B (Development)**: Save the JSON file as `firebase-service-account.json` in the `backend/` directory

#### 3. **Environment Variables**
Create a `.env` file in the `backend/` directory:
```bash
# Copy from env.example
cp backend/env.example backend/.env
# Edit with your actual credentials
nano backend/.env
```

**Example .env file:**
```bash
# Firebase Service Account Credentials (JSON string)
FIREBASE_CREDENTIALS='{"type": "service_account", "project_id": "your-project-id", ...}'
```

## 👥 Team

- **Matthias** (Computer Engineering) - Backend & Database
- **Sayyid** (Information Security) - Frontend & Security Logic

