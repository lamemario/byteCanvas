// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scanLinks") {
    const links = scanAllLinks();
    console.log('Scanned links:', links); // Debug log
    sendResponse({links: links});
  }
  return true; // Keep the message channel open for async response
});

// --- Configurable security checks ---
const CONFIG = {
  ENABLE_SAFE_BROWSING: true,
  ENABLE_NUS_LISTS: false, // Disabled by default, can be enabled for NUS users
  ENABLE_GENERIC_CHECKS: true,
  ENABLE_EMOTIONAL_TRIGGERS: true,
  ENABLE_URL_PATTERN_CHECKS: true
};

// Universal trusted domains
const UNIVERSAL_TRUSTED_DOMAINS = [
  'google.com',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'facebook.com',
  'linkedin.com',
  'github.com',
  'mozilla.org',
  'cloudflare.com',
  'paypal.com'
];

// NUS-specific domains (only used if ENABLE_NUS_LISTS is true)
const NUS_WHITELIST = [
  'nus.edu.sg',
  'nusmods.com',
  'ivle.nus.edu.sg',
  'webmail.nus.edu.sg'
];

const NUS_BLACKLIST = [
  // Add known phishing sites here
];

const SAFE_BROWSING_API_KEY = 'AIzaSyDbgdnawHqo9NLoYb3Om5ArfhAltoQDu98';

function scanAllLinks() {
  const links = [];
  // Scan <a> tags
  const pageLinks = document.getElementsByTagName('a');
  for (let link of pageLinks) {
    let href = link.getAttribute('href');
    let linkText = link.textContent.trim() || '';
    // Check for onclick handlers that might contain URLs
    let onclickUrl = link.getAttribute('onclick');
    if (onclickUrl) {
      const urlMatch = onclickUrl.match(/['"](https?:\/\/[^'"]+)['"]/);
      if (urlMatch) {
        href = urlMatch[1];
      }
    }
    if (isValidLinkUrl(href)) {
      links.push({
        url: link.href,
        text: linkText,
        status: getLinkStatus(link.href),
        elementType: 'link'
      });
    } else {
      links.push({
        url: href || '',
        text: linkText,
        status: 'invalid',
        reason: 'No valid destination URL',
        elementType: 'link'
      });
    }
  }
  
  // Scan interactive elements
  const interactiveElements = document.querySelectorAll('button, [role="button"], [role="link"], [onclick]');
  for (let el of interactiveElements) {
    let elText = el.textContent.trim() || '';
    let elUrl = el.getAttribute('data-url') || 
                el.getAttribute('formaction') || 
                el.getAttribute('href') ||
                el.getAttribute('data-href');
    
    // Check onclick attribute for URLs
    const onclickAttr = el.getAttribute('onclick');
    if (onclickAttr) {
      const urlMatch = onclickAttr.match(/['"](https?:\/\/[^'"]+)['"]/);
      if (urlMatch) {
        elUrl = urlMatch[1];
      }
    }

    // If type=submit and parent form has action, use that
    if (!elUrl && el.type === 'submit' && el.form && el.form.action) {
      elUrl = el.form.action;
    }

    const triggers = CONFIG.ENABLE_EMOTIONAL_TRIGGERS ? findEmotionalTriggers(elText) : [];
    if ((elUrl && isValidLinkUrl(elUrl)) || triggers.length > 0) {
      links.push({
        url: elUrl,
        text: elText,
        status: elUrl && isValidLinkUrl(elUrl) ? getLinkStatus(elUrl) : 'invalid',
        reason: elUrl ? '' : 'No valid destination URL',
        elementType: el.tagName.toLowerCase(),
        triggers: triggers
      });
    }
  }
  return links;
}

function getLinkStatus(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check universal trusted domains
    if (UNIVERSAL_TRUSTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
      return 'safe';
    }

    // NUS-specific checks (only if enabled)
    if (CONFIG.ENABLE_NUS_LISTS) {
      if (NUS_WHITELIST.some(domain => hostname.endsWith(domain))) {
        return 'safe';
      }
      if (NUS_BLACKLIST.some(domain => hostname.endsWith(domain))) {
        return 'danger';
      }
    }

    // Generic security checks
    if (CONFIG.ENABLE_GENERIC_CHECKS) {
      // Check for suspicious TLDs
      const suspiciousTLDs = ['.xyz', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.top', '.info', '.biz', '.click', '.download'];
      if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
        return 'warning';
      }

      // Check for IP addresses in hostname
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return 'warning';
      }

      // Check for excessive subdomains
      if (hostname.split('.').length > 4) {
        return 'warning';
      }
    }

    // URL pattern checks
    if (CONFIG.ENABLE_URL_PATTERN_CHECKS) {
      const suspiciousPatterns = [
        /login[^a-z]/i,
        /sign[^a-z]/i,
        /verify[^a-z]/i,
        /secure[^a-z]/i,
        /account[^a-z]/i,
        /password[^a-z]/i,
        /bank[^a-z]/i,
        /pay[^a-z]/i,
        /update[^a-z]/i,
        /confirm[^a-z]/i
      ];
      
      if (suspiciousPatterns.some(pattern => pattern.test(hostname))) {
        return 'warning';
      }

      // Check for mixed content
      if (window.location.protocol === 'https:' && urlObj.protocol === 'http:') {
        return 'warning';
      }
    }

    return 'safe';
  } catch (e) {
    return 'invalid';
  }
}

// Enhanced emotional trigger words for phishing detection
const EMOTIONAL_TRIGGERS = [
  // Urgency triggers
  'urgent', 'immediately', 'act now', 'limited time', 'expires', 'deadline', 'today only',
  // Fear triggers
  'warning', 'alert', 'suspended', 'locked', 'blocked', 'compromised', 'unauthorized',
  // Greed triggers
  'free', 'discount', 'offer', 'prize', 'winner', 'congratulations', 'exclusive',
  // Trust triggers
  'verify', 'confirm', 'validate', 'secure', 'official', 'authentic', 'legitimate',
  // Action triggers
  'click here', 'download', 'update', 'upgrade', 'install', 'subscribe', 'register',
  // Security triggers
  'password', 'login', 'sign in', 'account', 'security', 'protect', 'secure',
  // Social proof triggers
  'popular', 'trending', 'viral', 'recommended', 'best-selling', 'top-rated'
];

function findEmotionalTriggers(text) {
  if (!text) return [];
  const found = [];
  for (const word of EMOTIONAL_TRIGGERS) {
    if (text.toLowerCase().includes(word)) found.push(word);
  }
  return found;
}

function isValidLinkUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Helper to scan for emotional triggers in text
function findEmotionalTriggers(text) {
  if (!text) return [];
  const found = [];
  for (const word of EMOTIONAL_TRIGGERS) {
    if (text.toLowerCase().includes(word)) found.push(word);
  }
  return found;
}

// Helper to detect sender name/email mismatch (if present in DOM)
function detectSenderMismatch() {
  // Try to find sender name and email in the DOM (common patterns)
  const senderNameEl = document.querySelector('[data-sender-name], .sender-name, .from .name, .fromName');
  const senderEmailEl = document.querySelector('[data-sender-email], .sender-email, .from .email, .fromEmail');
  let senderName = senderNameEl ? senderNameEl.textContent.trim() : '';
  let senderEmail = senderEmailEl ? senderEmailEl.textContent.trim() : '';
  // Try to extract from "Name <email>" pattern
  if (!senderEmail && senderName) {
    const match = senderName.match(/<([^>]+)>/);
    if (match) {
      senderEmail = match[1];
      senderName = senderName.replace(/<[^>]+>/, '').trim();
    }
  }
  if (senderName && senderEmail) {
    const emailDomain = senderEmail.split('@')[1] || '';
    if ((/nus|university|school|admin|it/i.test(senderName)) && !/nus\.edu\.sg$/i.test(emailDomain)) {
      return { senderName, senderEmail, emailDomain, mismatch: true };
    }
  }
  return null;
}

// Helper to detect external email banner
function detectExternalEmailBanner() {
  const banner = document.querySelector('.external-email, .external-banner, .external-warning, [data-external-email], .externalEmailBanner');
  if (banner) {
    return banner.textContent.trim();
  }
  // Look for generic external email warning
  const text = document.body.textContent;
  if (/external email/i.test(text)) {
    return 'External Email banner detected';
  }
  return null;
}

// Add trusted domains for whitelisting
const TRUSTED_DOMAINS = [
  'nus.edu.sg',
  'outlook.office.com',
  'office.com',
  'google.com',
  'microsoft.com',
  'luminus.nus.edu.sg',
  'ivle.nus.edu.sg',
  'nusmods.com',
  'nus.edu.sg',
  'nus.edu',
  'nusmods.com',
  'nusmods.sg'
];

// Helper to check if a URL is external
function isExternalUrl(url) {
  try {
    const u = new URL(url);
    return !TRUSTED_DOMAINS.some(domain => u.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

// Helper to check if a URL is valid and actionable
function isValidLinkUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    // Allow http, https, mailto, and tel protocols
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(urlObj.protocol);
  } catch (e) {
    return false;
  }
}

// Gather red flags for the current page (improved)
function gatherPhishingRedFlags() {
  const redFlags = [];
  // Emotional triggers in links/buttons (context-aware)
  const linkEls = Array.from(document.querySelectorAll('a, button'));
  for (const el of linkEls) {
    let href = el.getAttribute('href') || '';
    let triggers = findEmotionalTriggers(el.textContent);
    if (triggers.length > 0) {
      // Only flag if external or suspicious (not whitelisted)
      if (isValidLinkUrl(href) && isExternalUrl(href)) {
        redFlags.push({ type: 'emotional', text: el.textContent.trim(), triggers, url: href });
      }
    }
  }
  // Sender mismatch
  const senderMismatch = detectSenderMismatch();
  if (senderMismatch) {
    redFlags.push({ type: 'sender-mismatch', ...senderMismatch });
  }
  // External email banner
  const externalBanner = detectExternalEmailBanner();
  if (externalBanner) {
    redFlags.push({ type: 'external-banner', banner: externalBanner });
  }
  return redFlags;
}

let scanTimeout;
const observer = new MutationObserver(() => {
  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    if (document.readyState === 'complete') {
      scanAllLinksAndSend();
    }
  }, 300);
});
observer.observe(document.body, {childList: true, subtree: true});
// Initial scan
if (document.readyState === 'complete') {
  scanAllLinksAndSend();
}

// Update scanAllLinksAndSend to catch context errors
function scanAllLinksAndSend() {
  const links = scanAllLinks();
  const redFlags = gatherPhishingRedFlags();
  try {
    chrome.runtime.sendMessage({action: 'analyzeLinks', links: links, redFlags: redFlags});
  } catch (e) {
    // Context invalidated, ignore
  }
}

// Function to check if a URL is suspicious
function isSuspiciousUrl(url) {
  // TODO: Implement URL checking logic
  // This will be expanded to include:
  // 1. Google Safe Browsing API check
  // 2. NUS-specific domain validation
  // 3. Pattern-based heuristic analysis
  return false;
}

// Function to highlight suspicious links on the page
function highlightSuspiciousLink(link) {
  link.style.border = '2px solid red';
  link.style.padding = '2px';
} 