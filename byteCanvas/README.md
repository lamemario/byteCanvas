# ByteCanvas - NUS Secure Access Tracker

A browser extension that protects NUS students from phishing, scam, and fake login pages in real-time.

## Project Overview

ByteCanvas is a Chrome/Firefox extension that provides real-time protection against phishing attacks targeting NUS students. It scans all links on webpages, detects potential threats, and helps users stay safe while browsing.

### Core Features

- Real-time phishing link scanner
- Browser extension UI
- Database for scam reports
- NUS-specific phishing detection
- User reporting system

### Tech Stack

- Frontend: JavaScript (Chrome API)
- Backend: Python (Flask)
- Database: Firebase
- Performance: C++ WebAssembly

### Prerequisites

- Node.js
- Python 3.x
- Chrome/Firefox browser
- Git

Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder


### Project Structure

```
byteCanvas/
├── extension/         # Browser extension code
├── docs/             # Documentation
└── resources/        # Additional resources
```

## Team Members

- Matthias (Computer Engineering)
- Sayyid (Information Security)

## Setup & Testing Instructions for Developers

### 1. Load the Extension in Chrome
1. Open Google Chrome.
2. Go to `chrome://extensions` in the address bar.
3. Enable "Developer mode" (top right corner).
4. Click "Load unpacked" and select the `extension` folder from this project.

### 2. Using the Extension
- Click the NUS Secure Access Tracker icon in your Chrome toolbar.
- Click "Scan This Page" to analyze the current webpage for suspicious or phishing links.
- The popup will show scan results, highlight any red flags, and display a summary.

### 3. Permissions & API Keys
- The extension requires permissions to read the content of the pages you visit (for scanning links).
- It uses the Google Safe Browsing API. The API key is already included for demo/testing purposes.

### 4. Testing on Sample Sites
- Try scanning:
  - `https://nus.edu.sg` (should show as safe)
  - A suspicious site or a phishing demo page (should show warnings)
- The extension works on most modern webmail and web pages.

### 5. Troubleshooting
- If the extension does not appear, make sure you selected the correct folder and that Developer Mode is enabled.
- If you see "0 links" on a page with many links, try refreshing the page and scanning again.

---
For any issues, contact the project team.