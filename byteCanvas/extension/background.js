console.log('NUS Secure Access Tracker service worker loaded');

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

// In-memory cache for Safe Browsing results
const safeBrowsingCache = {};
let rateLimitHit = false; // Global flag for rate limiting

// Sleep utility for throttling
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Persistent cache using chrome.storage.local
async function getPersistentCache(url) {
  return new Promise(resolve => {
    chrome.storage.local.get(['safeBrowsingCache'], (result) => {
      const cache = result.safeBrowsingCache || {};
      resolve(cache[url]);
    });
  });
}
async function setPersistentCache(url, value) {
  return new Promise(resolve => {
    chrome.storage.local.get(['safeBrowsingCache'], (result) => {
      const cache = result.safeBrowsingCache || {};
      cache[url] = value;
      chrome.storage.local.set({safeBrowsingCache: cache}, resolve);
    });
  });
}

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
            analyzeElements(response2.elements, tabId, 0, []);
          });
        }, 100);
      });
      return;
    }
    console.log('Scan results:', response.elements);
    analyzeElements(response.elements, tabId, 0, []);
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

async function checkUrlWithSafeBrowsingCached(url) {
  // 1. Persistent cache
  const persistent = await getPersistentCache(url);
  if (persistent) {
    safeBrowsingCache[url] = persistent;
    return persistent;
  }
  // 2. In-memory cache
  if (safeBrowsingCache[url]) {
    return safeBrowsingCache[url];
  }
  // 3. Throttle and API call
  await sleep(300); // 300ms delay between requests
  if (rateLimitHit) {
    return { safe: true, threatType: null, error: 'rate_limited' };
  }
  try {
    const result = await checkUrlWithSafeBrowsing(url);
    safeBrowsingCache[url] = result;
    await setPersistentCache(url, result);
    return result;
  } catch (e) {
    if (e && e.message && e.message.includes('429')) {
      rateLimitHit = true;
      return { safe: true, threatType: null, error: 'rate_limited' };
    }
    throw e;
  }
}

async function analyzeElements(elements, tabId, frameId, redFlags) {
  rateLimitHit = false; // Reset for each scan
  console.log('analyzeElements called', {tabId, frameId, elementCount: elements.length, elements});
  const analyzedElements = [];
  const phishingKeywords = ['login', 'signin', 'account', 'verify', 'secure', 'update', 'password', 'bank', 'paypal'];
  const suspiciousTLDs = ['.xyz', '.tk', '.pw', '.top', '.ml', '.ga', '.cf', '.zip', '.mov'];
  for (const element of elements) {
    let status = 'safe';
    let reasons = [];
    let mostSevere = 'safe';
    try {
      if (!element.url) {
        status = 'invalid';
        reasons.push('No URL found');
        mostSevere = 'invalid';
      } else {
        let urlObj;
        let hostname = '';
        try {
          urlObj = new URL(element.url);
          hostname = urlObj.hostname.toLowerCase();
        } catch (e) {
          status = 'invalid';
          reasons.push('Invalid URL format');
          mostSevere = 'invalid';
        }
        if (hostname) {
          // Trusted/whitelist
          const isTrusted = TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain));
          console.log('[CHECK] Trusted domain:', element.url, isTrusted);
          if (isTrusted) {
            reasons.push('Trusted domain');
          }
          // NUS whitelist
          const isNusWhite = CONFIG.ENABLE_NUS_LISTS && NUS_WHITELIST.some(domain => hostname.endsWith(domain));
          console.log('[CHECK] NUS Whitelist:', element.url, isNusWhite);
          if (isNusWhite) {
            reasons.push('NUS Whitelist');
          }
          // Blacklist
          const isBlacklisted = typeof NUS_BLACKLIST !== 'undefined' && NUS_BLACKLIST.some(domain => hostname.endsWith(domain));
          console.log('[CHECK] Blacklist:', element.url, isBlacklisted);
          if (isBlacklisted) {
            status = 'danger';
            reasons.push('Blacklisted domain');
            mostSevere = 'danger';
          }
          // @ symbol deception
          const hasAtSymbol = hostname.includes('@');
          console.log('[CHECK] @ symbol:', element.url, hasAtSymbol);
          if (hasAtSymbol) {
            status = 'danger';
            reasons.push('Deceptive URL: @ symbol in hostname (phishing trick)');
            mostSevere = 'danger';
          }
          // Typosquatting
          const isTyposquat = hostname.includes('nus') && !TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain));
          console.log('[CHECK] Typosquatting:', element.url, isTyposquat);
          if (isTyposquat) {
            if (mostSevere !== 'danger') mostSevere = 'warning';
            reasons.push('Contains "nus" but not on a trusted NUS domain');
          }
          // Suspicious TLDs
          const isSuspiciousTLD = suspiciousTLDs.some(tld => hostname.endsWith(tld));
          console.log('[CHECK] Suspicious TLD:', element.url, isSuspiciousTLD);
          if (isSuspiciousTLD) {
            status = 'danger';
            reasons.push('Suspicious TLD');
            mostSevere = 'danger';
          }
          // Phishing keyword check
          const keywordFound = phishingKeywords.find(keyword => hostname.includes(keyword) || element.url.toLowerCase().includes(keyword));
          console.log('[CHECK] Phishing keyword:', element.url, keywordFound);
          if (keywordFound && !TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
            if (mostSevere !== 'danger') mostSevere = 'warning';
            reasons.push(`Contains phishing keyword: "${keywordFound}" on a non-trusted domain`);
          }
          // Safe Browsing (after local checks)
          if (CONFIG.ENABLE_SAFE_BROWSING && !isTrusted && !isBlacklisted && !rateLimitHit) {
            const safeBrowsingResult = await checkUrlWithSafeBrowsingCached(element.url);
            console.log('[CHECK] Safe Browsing:', element.url, safeBrowsingResult);
            if (safeBrowsingResult.error === 'rate_limited') {
              reasons.push('Google Safe Browsing: rate limited, not checked');
            } else if (!safeBrowsingResult.safe) {
              status = 'danger';
              reasons.push(`Google Safe Browsing: ${safeBrowsingResult.threatType}`);
              mostSevere = 'danger';
            }
          }
        }
      }
    } catch (e) {
      status = 'invalid';
      reasons.push('Error during analysis');
      mostSevere = 'invalid';
    }
    // Set final status to most severe
    if (mostSevere === 'danger') status = 'danger';
    else if (mostSevere === 'warning') status = 'warning';
    else if (mostSevere === 'invalid') status = 'invalid';
    else status = 'safe';
    const reason = reasons.join('; ');
    analyzedElements.push({...element, status, reason});
  }

  chrome.storage.local.set({['scanResults_' + tabId]: analyzedElements, ['rateLimitHit_' + tabId]: rateLimitHit});
  const hasDanger = analyzedElements.some(e => e.status === 'danger');
  const hasWarning = analyzedElements.some(e => e.status === 'warning');
  if (hasDanger) {
    chrome.action.setBadgeText({tabId, text: '!' });
    chrome.action.setBadgeBackgroundColor({tabId, color: '#F44336'});
  } else if (hasWarning) {
    chrome.action.setBadgeText({tabId, text: '!' });
    chrome.action.setBadgeBackgroundColor({tabId, color: '#FFA000'});
  } else {
    chrome.action.setBadgeText({tabId, text: ''});
  }
}