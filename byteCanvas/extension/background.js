// This is the main background script for the extension.

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('NUS Secure Access Tracker installed');
});

// --- Deceptive URL Detection using webNavigation API ---
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  // We only care about top-level frame navigations
  if (details.frameId !== 0) {
    return;
  }

  const tabId = details.tabId;
  const urlStr = details.url;

  // Clear any previous flag for this tab to avoid stale warnings
  chrome.storage.local.remove('deceptiveUrl_' + tabId);

  try {
    const urlObj = new URL(urlStr);
    // The @ trick puts the fake, trusted domain in the 'username' part of the URL.
    // A legitimate username is highly unlikely to contain multiple '.' characters like a domain.
    if (urlObj.username && urlObj.username.includes('.')) {
      console.log(`Deceptive URL detected for tab ${tabId}:`, urlStr);
      const deceptiveInfo = {
        isDeceptive: true,
        realHost: urlObj.hostname,
        fakeHost: urlObj.username
      };
      // Set a specific flag for this tab that the popup will check
      chrome.storage.local.set({['deceptiveUrl_' + tabId]: deceptiveInfo});
    }
  } catch (e) {
    // URL parsing can fail on unusual strings, just ignore it.
  }
});

// --- Configurable security checks ---
const ENABLE_SAFE_BROWSING = true; // Set to false to disable
const ENABLE_NUS_LISTS = false; // Set to false to disable since actual true lists are not available
// TODO: Fill these with lists from NUS IT Security

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

// Based on research of official and affiliated NUS domains.
const TRUSTED_DOMAINS = [
  'nus.edu.sg',
  'u.nus.edu', // Student mail domain
  'duke-nus.edu.sg',
  'u.duke-nus.edu',
  'yale-nus.edu.sg',
  'for.edu.sg', // Official short-link domain
  // Key third-party services used by NUS
  'microsoft.com',
  'office.com',
  'microsoftonline.com',
  'zoom.us',
  'google.com' // For forms, etc.
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
  // Only scan http/https URLs, ignore mailto:, tel:, etc.
  if (!url || !url.startsWith('http')) {
    return { safe: true, threatType: null };
  }

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
  // TODO: Implement actual reporting to backend (Firebase)
  console.log('Reporting suspicious link:', url);
}

// All automatic, page-load-based triggers have been removed to prevent race conditions.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'analyzeLinks' && sender.tab && sender.tab.id) {
    // Pass the entire sender.tab object for more context
    analyzeLinks(message.links, sender.tab, message.redFlags);
    // It's good practice to send a response to acknowledge the message.
    sendResponse({status: 'Analysis started'});
  }
  return true; // Keep channel open for async response in case we need it later.
});

async function analyzeLinks(links, tab, redFlags) {
  // If the links array is missing or invalid, discard this entire analysis run.
  // This prevents a malformed message from a broken frame from overwriting good results.
  if (!Array.isArray(links)) {
    console.warn(`[Tab ${tab.id}] analyzeLinks call aborted due to invalid 'links' parameter. Received:`, links);
    return;
  }

  const tabId = tab.id;

  // Set status to 'scanning' so the popup knows work is in progress.
  await chrome.storage.local.set({ ['scanState_' + tabId]: 'scanning' });

  // try...catch block to handle any unexpected errors during analysis.
  try {
    const analyzedLinks = [];

    if (tab.url) {
      const selfScanResult = await analyzeSingleLink({ url: tab.url, text: 'Current Page URL', elementType: 'page' });
      analyzedLinks.push(selfScanResult);
    }

    // Defensively check if links is a valid array before iterating
    if (links && Array.isArray(links)) {
      for (const link of links) {
        const analyzedLink = await analyzeSingleLink(link);
        analyzedLinks.push(analyzedLink);
      }
    } else if (links) {
      // Log if 'links' exists but is not an array, to catch malformed messages
      console.warn(`[Tab ${tabId}] Received 'links' but it was not an array. Type: ${typeof links}`);
    }

    console.log(`[Tab ${tabId}] Analysis complete. Storing ${analyzedLinks.length} results.`);

    await chrome.storage.local.set({
      ['scanResults_' + tabId]: analyzedLinks,
      ['redFlags_' + tabId]: redFlags || [],
      ['scanState_' + tabId]: 'complete'
    });

    const hasDanger = analyzedLinks.some(l => l.status === 'danger');
    chrome.action.setBadgeText({tabId, text: hasDanger ? '!' : ''});
    chrome.action.setBadgeBackgroundColor({tabId, color: hasDanger ? '#F44336' : '#4CAF50'});

  } catch (error) {
    console.error(`[Tab ${tabId}] An unexpected error occurred during analysis:`, error);
  }
}

async function analyzeSingleLink(link) {
  let status = 'safe';
  let reason = '';
  let analyzedLink = { ...link, status, reason };

  try {
    // Skip analysis for invalid or non-web URLs early
    if (!link.url || !link.url.startsWith('http')) {
      analyzedLink.status = 'invalid';
      analyzedLink.reason = 'Non-web link (e.g., mailto)';
      return analyzedLink;
    }

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

    // 3. Heuristics (using trusted domains)
    if (status === 'safe') {
      // High-confidence danger signal: '@' in hostname is a classic phishing trick
      if (hostname.includes('@')) {
          status = 'danger';
          reason = 'Deceptive URL with @ symbol';
      }

      // Typosquatting check: contains 'nus' but not a valid NUS domain
      if (status === 'safe' && hostname.includes('nus') && !TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
        status = 'warning';
        reason = 'Contains "nus" but not on a trusted NUS domain';
      }

      // Suspicious TLDs, often used for phishing
      const suspiciousTLDs = ['.xyz', '.tk', '.ml', 'ga', '.cf', '.zip', '.mov'];
      if (status === 'safe' && suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
        status = 'danger';
        reason = 'Suspicious TLD';
      }

      // Context-aware keyword check
      const phishingKeywords = ['login', 'signin', 'account', 'verify', 'secure', 'update'];
      const keywordFound = phishingKeywords.find(keyword => hostname.includes(keyword) || link.url.includes(keyword));
      if (status === 'safe' && keywordFound) {
        // Only flag if NOT on a trusted domain
        if (!TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
          status = 'warning';
          reason = `Contains keyword: "${keywordFound}" on a non-trusted domain`;
        }
      }
    }
  } catch (e) {
    status = 'invalid';
    reason = 'Invalid URL format';
  }

  analyzedLink.status = status;
  analyzedLink.reason = reason;
  return analyzedLink;
}