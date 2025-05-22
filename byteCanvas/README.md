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

## Getting Started

### Prerequisites

- Node.js
- Python 3.x
- Chrome/Firefox browser
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lamemario/byteCanvas.git
cd byteCanvas
```

2. Install dependencies:
```bash
# Frontend dependencies
cd extension
npm install

# Backend dependencies
cd ../backend
pip install -r requirements.txt
```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder

## Development

### Project Structure

```
byteCanvas/
├── extension/         # Browser extension code
├── docs/             # Documentation
└── resources/        # Additional resources
```

### Contributing

1. Create a new branch for your feature:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit them:
```bash
git add .
git commit -m "Description of changes"
```

3. Push to your branch:
```bash
git push origin feature/your-feature-name
```

4. Create a Pull Request on GitHub

## Team Members

- Matthias (Computer Engineering)
- Sayyid (Information Security)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
