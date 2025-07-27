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
   - Create a Firebase project
   - Download service account key as `firebase-service-account.json`
   - Place it in the `backend/` directory

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
│   └── firebase-service-account.json # Not going to share this one, it's sensitive!
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

## �� Configuration

### 🔐 Security Setup (IMPORTANT!)

**Before deploying, you MUST secure your credentials:**

#### 1. **Google Safe Browsing API Key**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new API key or use existing one
3. Replace `YOUR_GOOGLE_SAFE_BROWSING_API_KEY_HERE` in `extension/background.js` with your actual key

#### 2. **Firebase Service Account**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to Project Settings > Service Accounts
3. Click "Generate New Private Key"
4. **Option A (Recommended)**: Set environment variable:
   ```bash
   export FIREBASE_CREDENTIALS='{"type":"service_account",...}'
   ```
   **Option B (Development)**: Place the JSON file in `backend/` as `firebase-service-account.json`

#### 3. **Environment Variables**
Create a `.env` file in the `backend/` directory:
```bash
# Copy from env.example
cp backend/env.example backend/.env
# Edit with your actual credentials
nano backend/.env
```

### Extension Permissions
The extension requires the following permissions:
- `activeTab` - Access to current tab content
- `storage` - Local data storage
- `scripting` - Content script injection
- `webNavigation` - Navigation event monitoring
- `webRequest` - Network request monitoring

### Host Permissions
- `*://*.nus.edu.sg/*` - NUS domains
- `*://*.nusmods.com/*` - NUSMods
- `*://*.ivle.nus.edu.sg/*` - IVLE
- `*://*.webmail.nus.edu.sg/*` - NUS Webmail
- `*://*.outlook.office.com/*` - Office 365
- `*://*.instructure.com/*` - Canvas
- `*://*.luminus.nus.edu.sg/*` - Luminus
- `*://testsafebrowsing.appspot.com/s/phishing.html` - Added into Host Permissions to show you Google Safe Browsing API's danger detection that's part of our background detection which isn't very obvious to users!

## 🎯 Use Cases

### For Students
- **Safe browsing** on NUS-related websites
- **Phishing awareness** through educational content
- **Quick reporting** of suspicious links
- **Real-time protection** while studying

### For Administrators
- **Threat intelligence** through user reports
- **Database of known threats** for analysis
- **Scalable architecture** for campus-wide deployment
- **Integration capabilities** with existing security systems

## 🔮 Future Enhancements

- **Machine learning** integration for improved detection
- **Real-time threat database** updates
- **Advanced analytics** dashboard for security insights

## 👥 Team

- **Matthias** (Computer Engineering) - Backend & Database
- **Sayyid** (Information Security) - Frontend & Security Logic

---

**Note**: This extension is designed specifically for NUS students and staff. That said, always follow NUS IT security policies and report security incidents through official channels!