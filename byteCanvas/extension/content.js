// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scanLinks") {
    const links = scanAllLinks();
    console.log('Scanned links:', links); // Debug log
    sendResponse({links: links});
  }
  return true; // Keep the message channel open for async response
});

function scanAllLinks() {
  const links = [];
  // Scan <a> tags
  const pageLinks = document.getElementsByTagName('a');
  for (let link of pageLinks) {
    let href = link.getAttribute('href');
    let linkText = link.textContent.trim() || '';
    if (isValidLinkUrl(href)) {
      links.push({
        url: link.href,
        text: linkText,
        status: getLinkStatus(link.href),
        elementType: 'link'
      });
    } else {
      // Show user-friendly message for invalid/missing URLs
      links.push({
        url: href || '',
        text: linkText,
        status: 'invalid',
        reason: 'No valid destination URL',
        elementType: 'link'
      });
    }
  }
  // Scan <button> tags (only actionable or suspicious)
  const buttons = document.getElementsByTagName('button');
  for (let btn of buttons) {
    let btnText = btn.textContent.trim() || '';
    let btnUrl = btn.getAttribute('data-url') || btn.getAttribute('formaction') || '';
    // If type=submit and parent form has action, use that
    if (!btnUrl && btn.type === 'submit' && btn.form && btn.form.action) {
      btnUrl = btn.form.action;
    }
    const triggers = findEmotionalTriggers(btnText);
    // Only include if actionable (valid URL) or suspicious (trigger word)
    if ((btnUrl && isValidLinkUrl(btnUrl)) || triggers.length > 0) {
      links.push({
        url: btnUrl,
        text: btnText,
        status: btnUrl && isValidLinkUrl(btnUrl) ? getLinkStatus(btnUrl) : 'invalid',
        reason: btnUrl ? '' : 'No valid destination URL',
        elementType: 'button',
        triggers: triggers
      });
    }
  }
  return links;
}

function scanLinksInNode(node, links) {
  // Find all <a> tags in this node
  const anchorTags = node.querySelectorAll ? node.querySelectorAll('a') : [];
  for (let link of anchorTags) {
    let linkText = link.textContent.trim() || '';
    let href = link.getAttribute('href');
    let status = 'safe';
    let url = '';
    if (!href || href === '#' || href.trim() === '') {
      status = 'broken';
      url = href || '';
    } else {
      try {
        url = link.href;
        status = getLinkStatus(url);
      } catch (e) {
        status = 'invalid';
        url = href;
      }
    }
    links.push({
      url: url,
      text: linkText,
      status: status
    });
  }
  // Recursively scan shadow roots
  if (node.querySelectorAll) {
    const allElements = node.querySelectorAll('*');
    for (let el of allElements) {
      if (el.shadowRoot) {
        scanLinksInNode(el.shadowRoot, links);
      }
    }
  }
}

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

const SAFE_BROWSING_API_KEY = 'AIzaSyDbgdnawHqo9NLoYb3Om5ArfhAltoQDu98';

// Instead of async getLinkStatus, use a sync stub and send links to background for analysis
function getLinkStatus(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    // Only do basic heuristics here; background will do Safe Browsing and NUS list checks
    if (hostname.includes('nus') && !hostname.endsWith('nus.edu.sg')) {
      return 'warning';
    }
    const suspiciousTLDs = ['.xyz', '.tk', '.ml', '.ga', '.cf'];
    if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
      return 'danger';
    }
    const phishingKeywords = ['login', 'signin', 'account', 'verify', 'secure', 'bank', 'paypal'];
    if (phishingKeywords.some(keyword => hostname.includes(keyword))) {
      return 'warning';
    }
    return 'safe';
  } catch (e) {
    return 'invalid';
  }
}

// Emotional trigger words for phishing detection
const EMOTIONAL_TRIGGERS = [
  'urgent', 'immediately', 'act now', 'help', 'verify', 'alert', 'warning', 'limited time', 'important', 'attention', 'security', 'update', 'required', 'action needed', 'suspended', 'confirm', 'reset', 'danger', 'threat', 'problem', 'failure', 'account', 'password', 'login', 'sign in', 'click here', 'exclusive', 'offer', 'free', 'congratulations', 'winner', 'claim', 'refund', 'prize', 'risk', 'locked', 'unusual', 'suspicious', 'review', 'reactivate', 'access', 'protect', 'notice', 'reminder', 'final', 'deadline', 'limited', 'now', 'today', 'asap'
];

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
  'microsoft.com'
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
  return url && /^(https?:|mailto:)/i.test(url);
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