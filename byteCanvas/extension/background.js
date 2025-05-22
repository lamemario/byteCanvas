// Listen for installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('NUS Secure Access Tracker installed');
});

// --- Configurable security checks ---
const ENABLE_SAFE_BROWSING = true; // Set to false to disable
const ENABLE_NUS_LISTS = true; // Set to false to disable
// TODO: Fill these with your actual data
const NUS_WHITELIST = [
  // 'nus.edu.sg', ...
];
const NUS_BLACKLIST = [
  // 'phishingsite.com', ...
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

// NUS-specific domain validation stub
function validateNusDomain(url) {
  // TODO: Implement actual logic using NUS_WHITELIST and NUS_BLACKLIST
  return { isNusDomain: false, isSuspicious: false };
}

// Crowdsourced reporting stub
async function reportSuspiciousLink(url) {
  // TODO: Implement actual reporting to your backend (e.g., Firebase)
  console.log('Reporting suspicious link:', url);
}

// Background script for automated link scanning

// Store last scan time per tab to throttle scans
const lastScanTime = {};
const SCAN_THROTTLE_MS = 5000; // Minimum 5 seconds between scans per tab

// Listen for tab updates (page load, navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && /^https?:/.test(tab.url)) {
    triggerScan(tabId, tab.url);
  }
});

// Listen for tab activation (user switches tabs)
chrome.tabs.onActivated.addListener(activeInfo => {
  chrome.tabs.get(activeInfo.tabId, tab => {
    if (tab && /^https?:/.test(tab.url)) {
      triggerScan(tab.id, tab.url);
    }
  });
});

function triggerScan(tabId, url) {
  const now = Date.now();
  if (lastScanTime[tabId] && now - lastScanTime[tabId] < SCAN_THROTTLE_MS) {
    return; // Throttle
  }
  lastScanTime[tabId] = now;
  // Try to send message to content script
  chrome.tabs.sendMessage(tabId, {action: "scanLinks"}, response => {
    if (chrome.runtime.lastError || !response) {
      // If failed, try to inject the content script and retry
      chrome.scripting.executeScript({
        target: {tabId: tabId, allFrames: true},
        files: ["content.js"]
      }, () => {
        // Retry sending the scan message
        chrome.tabs.sendMessage(tabId, {action: "scanLinks"}, response2 => {
          if (chrome.runtime.lastError || !response2) return;
          chrome.storage.local.set({['scanResults_' + tabId]: response2.links});
          const hasDanger = response2.links.some(l => l.status === 'danger');
          chrome.action.setBadgeText({tabId, text: hasDanger ? '!' : ''});
          chrome.action.setBadgeBackgroundColor({tabId, color: hasDanger ? '#F44336' : '#4CAF50'});
        });
      });
      return;
    }
    // Store results in chrome.storage (per tab)
    chrome.storage.local.set({['scanResults_' + tabId]: response.links});
    // Optionally, show a badge or notification if suspicious links found
    const hasDanger = response.links.some(l => l.status === 'danger');
    chrome.action.setBadgeText({tabId, text: hasDanger ? '!' : ''});
    chrome.action.setBadgeBackgroundColor({tabId, color: hasDanger ? '#F44336' : '#4CAF50'});
  });
}

// Listen for autoScanResults from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autoScanResults' && sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;
    chrome.storage.local.set({['scanResults_' + tabId]: message.links});
    const hasDanger = message.links.some(l => l.status === 'danger');
    chrome.action.setBadgeText({tabId, text: hasDanger ? '!' : ''});
    chrome.action.setBadgeBackgroundColor({tabId, color: hasDanger ? '#F44336' : '#4CAF50'});
  }
});

// Listen for analyzeLinks from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeLinks' && sender.tab && sender.tab.id) {
    analyzeLinks(message.links, sender.tab.id, sender.frameId, message.redFlags);
  }
});

async function analyzeLinks(links, tabId, frameId, redFlags) {
  const analyzedLinks = [];
  for (const link of links) {
    let status = 'safe';
    let reason = '';
    try {
      const urlObj = new URL(link.url);
      const hostname = urlObj.hostname;
      // 1. NUS whitelist/blacklist
      if (ENABLE_NUS_LISTS) {
        if (NUS_WHITELIST.some(domain => hostname.endsWith(domain))) {
          status = 'safe';
          reason = 'NUS Whitelist';
        }
        if (NUS_BLACKLIST.some(domain => hostname.endsWith(domain))) {
          status = 'danger';
          reason = 'NUS Blacklist';
        }
      }
      // 2. Google Safe Browsing API
      if (status === 'safe' && ENABLE_SAFE_BROWSING) {
        const safeBrowsingResult = await checkUrlWithSafeBrowsing(link.url);
        console.log('Safe Browsing API result for', link.url, safeBrowsingResult);
        if (!safeBrowsingResult.safe) {
          status = 'danger';
          reason = `Google Safe Browsing: ${safeBrowsingResult.threatType}`;
        }
      }
      // 3. Heuristics
      if (status === 'safe') {
        if (hostname.includes('nus') && !hostname.endsWith('nus.edu.sg')) {
          status = 'warning';
          reason = 'Contains "nus" but not nus.edu.sg';
        }
        const suspiciousTLDs = ['.xyz', '.tk', '.ml', '.ga', '.cf'];
        if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
          status = 'danger';
          reason = 'Suspicious TLD';
        }
        const phishingKeywords = ['login', 'signin', 'account', 'verify', 'secure', 'bank', 'paypal'];
        if (phishingKeywords.some(keyword => hostname.includes(keyword))) {
          status = 'warning';
          reason = `Contains keyword: ${keyword}`;
        }
      }
    } catch (e) {
      status = 'invalid';
      reason = 'Invalid URL';
    }
    analyzedLinks.push({...link, status, reason});
  }
  // Store results and red flags, notify content script
  chrome.storage.local.set({['scanResults_' + tabId]: analyzedLinks, ['redFlags_' + tabId]: redFlags || []});
}

// --- How to verify that google's API is working(Still doesn't work as intended though), API not invoked, can't see in action ---
// 1. Open the extension and scan a page with a known malicious or phishing URL (e.g., https://testsafebrowsing.appspot.com/).
// 2. If the link is flagged as dangerous, the API is working.
// 3. You can also check the console for 'Safe Browsing API result for ...' logs.
//
// --- How the user is warned ---
// If a link is found dangerous by the API, it will be marked as 'danger' in the scan results.
// The extension will show a red badge (!) on the extension icon and highlight the link as dangerous in the UI. 