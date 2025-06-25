// Listen for installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('NUS Secure Access Tracker installed');
});

// Configuration
const CONFIG = {
  ENABLE_SAFE_BROWSING: true,
  ENABLE_NUS_LISTS: true,
  ENABLE_GENERIC_CHECKS: true,
  ENABLE_EMOTIONAL_TRIGGERS: true,
  ENABLE_URL_PATTERN_CHECKS: true,
  DEBUG_MODE: true
};

// NUS-specific domains that are always safe
const NUS_WHITELIST = [
  'nus.edu.sg',
  'nusmods.com',
  'ivle.nus.edu.sg',
  'webmail.nus.edu.sg',
  'outlook.office.com',
  'office365.com',
  'instructure.com',
  'canvas.nus.edu.sg',
  'luminus.nus.edu.sg'
];

// Trusted domains that should not trigger warnings
const TRUSTED_DOMAINS = [
  'microsoft.com',
  'office.com',
  'outlook.com',
  'live.com',
  'sharepoint.com',
  'onedrive.com',
  'teams.microsoft.com',
  'portal.office.com',
  'login.microsoftonline.com',
  'outlook.office365.com',
  'outlook.office.com',
  'mail.office365.com',
  'mail.office.com',
  'owa.nus.edu.sg',
  'webmail.nus.edu.sg',
  'canvas.nus.edu.sg',
  'instructure.com',
  'nus.edu.sg',
  'nusmods.com',
  'ivle.nus.edu.sg',
  'luminus.nus.edu.sg'
];

// Google Safe Browsing API key
const SAFE_BROWSING_API_KEY = 'AIzaSyDbgdnawHqo9NLoYb3Om5ArfhAltoQDu98';

// Google Safe Browsing API real implementation
async function checkUrlWithSafeBrowsing(url) {
  const apiUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
  const body = {
    client: {
      clientId: "nus-secure-access-tracker",
      clientVersion: "1.0.0"
    },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [
        { url }
      ]
    }
  };
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      console.warn('Safe Browsing API error:', response.status);
      return { safe: true, threatType: null };
    }
    const data = await response.json();
    if (data && data.matches && data.matches.length > 0) {
      // Threat found
      return { safe: false, threatType: data.matches[0].threatType };
    }
    // No threat found
    return { safe: true, threatType: null };
  } catch (e) {
    console.error('Safe Browsing API call failed:', e);
    return { safe: true, threatType: null };
  }
}

// Store last scan time per tab to throttle scans
const lastScanTime = {};
const SCAN_THROTTLE_MS = 2000; // 2 seconds between scans

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && /^https?:/.test(tab.url)) {
    console.log('Tab updated:', tab.url);
    triggerScan(tabId, tab.url);
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && /^https?:/.test(tab.url)) {
      console.log('Tab activated:', tab.url);
      triggerScan(tab.id, tab.url);
    }
  });
});

function triggerScan(tabId, url) {
  const now = Date.now();
  if (lastScanTime[tabId] && now - lastScanTime[tabId] < SCAN_THROTTLE_MS) {
    console.log('Skipping scan due to throttle:', tabId);
    return;
  }
  lastScanTime[tabId] = now;

  console.log('Triggering scan for tab:', tabId, 'URL:', url);

  // Try to send message to content script
  chrome.tabs.sendMessage(tabId, {action: "scanLinks"}, response => {
    if (chrome.runtime.lastError || !response) {
      console.log('Content script not found, injecting...');
      // If failed, try to inject the content script and retry
      chrome.scripting.executeScript({
        target: {tabId: tabId, allFrames: true},
        files: ["content.js"]
      }, () => {
        // Retry sending the scan message after a short delay
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {action: "scanLinks"}, response2 => {
            if (chrome.runtime.lastError || !response2) {
              console.log('Failed to get response after injection');
              return;
            }
            console.log('Scan results after injection:', response2.elements);
            processScanResults(response2.elements, tabId);
          });
        }, 100);
      });
      return;
    }
    console.log('Scan results:', response.elements);
    processScanResults(response.elements, tabId);
  });
}

// Helper function to process scan results
function processScanResults(elements, tabId) {
  // Store results in chrome.storage (per tab)
  chrome.storage.local.set({['scanResults_' + tabId]: elements});
  
  // Check for dangerous elements
  const hasDanger = elements.some(e => e.status === 'danger');
  const hasWarning = elements.some(e => e.status === 'warning');
  
  console.log('Processing scan results:', {
    tabId,
    elementCount: elements.length,
    hasDanger,
    hasWarning
  });
  
  // Update badge
  if (hasDanger) {
    chrome.action.setBadgeText({tabId, text: '!'});
    chrome.action.setBadgeBackgroundColor({tabId, color: '#F44336'});
  } else if (hasWarning) {
    chrome.action.setBadgeText({tabId, text: '!'});
    chrome.action.setBadgeBackgroundColor({tabId, color: '#FFA000'});
  } else {
    chrome.action.setBadgeText({tabId, text: ''});
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autoScanResults' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    console.log('Received auto scan results:', message.elements);
    processScanResults(message.elements, tabId);
  }
});

// Listen for analyzeLinks from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeLinks' && sender.tab && sender.tab.id) {
    console.log('Analyzing elements:', message.elements);
    analyzeElements(message.elements, sender.tab.id, sender.frameId, message.redFlags);
  }
});

async function analyzeElements(elements, tabId, frameId, redFlags) {
  const analyzedElements = [];
  for (const element of elements) {
    let status = 'safe';
    let reason = '';
    try {
      if (element.url) {
        const urlObj = new URL(element.url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Check if it's a trusted domain first
        if (TRUSTED_DOMAINS.some(domain => hostname.includes(domain))) {
          status = 'safe';
          reason = 'Trusted domain';
          analyzedElements.push({...element, status, reason});
          continue;
        }

        // 1. NUS whitelist/blacklist
        if (CONFIG.ENABLE_NUS_LISTS) {
          if (NUS_WHITELIST.some(domain => hostname.includes(domain))) {
            status = 'safe';
            reason = 'NUS Whitelist';
            analyzedElements.push({...element, status, reason});
            continue;
          }
        }

        // 2. Google Safe Browsing API
        if (status === 'safe' && CONFIG.ENABLE_SAFE_BROWSING) {
          const safeBrowsingResult = await checkUrlWithSafeBrowsing(element.url);
          console.log('Safe Browsing API result for', element.url, safeBrowsingResult);
          if (!safeBrowsingResult.safe) {
            status = 'danger';
            reason = `Google Safe Browsing: ${safeBrowsingResult.threatType}`;
          }
        }

        // 3. Heuristics
        if (status === 'safe') {
          if (hostname.includes('nus') && !hostname.endsWith('nus.edu.sg')) {
            status = 'warning';
            reason = 'Suspicious NUS domain';
          }
          if (['.xyz', '.tk', '.pw', '.top'].some(tld => hostname.endsWith(tld))) {
            status = 'danger';
            reason = 'Suspicious TLD';
          }
        }
      } else if (element.triggers && element.triggers.length > 0) {
        status = 'warning';
        reason = `Contains emotional triggers: ${element.triggers.join(', ')}`;
      }
    } catch (e) {
      status = 'invalid';
      reason = 'Invalid URL';
    }
    analyzedElements.push({...element, status, reason});
  }
  
  console.log('Analysis complete:', analyzedElements);
  // Store results and red flags, notify content script
  chrome.storage.local.set({['scanResults_' + tabId]: analyzedElements, ['redFlags_' + tabId]: redFlags || []});
}

// --- How to verify that google's API is working(Still doesn't work as intended though), API not invoked, can't see in action ---
// 1. Open the extension and scan a page with a known malicious or phishing URL (e.g., https://testsafebrowsing.appspot.com/).
// 2. If the link is flagged as dangerous, the API is working.
// 3. You can also check the console for 'Safe Browsing API result for ...' logs.
//
// --- How the user is warned ---
// If a link is found dangerous by the API, it will be marked as 'danger' in the scan results.
// The extension will show a red badge (!) on the extension icon and highlight the link as dangerous in the UI. 