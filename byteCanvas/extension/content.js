console.log('NUS Secure Access Tracker: content.js script injected and running.')
const TRUSTED_DOMAINS = [
  'nus.edu.sg',
  'outlook.office.com',
  'office.com',
  'google.com',
  'microsoft.com'
]
const EMOTIONAL_TRIGGERS = {
  urgency: ['urgent', 'important', 'action required', 'immediate', 'expiring'],
  authority: ['president', 'dean', 'provost', 'hr', 'it support', 'administrator'],
  scarcity: ['last chance', 'limited time', 'offer ends'],
  curiosity: ['secret', 'confidential', 'leaked', 'what you missed'],
  fear: ['suspicious activity', 'account suspended', 'unauthorized access', 'security alert'],
  gain: ['prize', 'winner', 'free', 'reward', 'refund']
}
if (window.self === window.top) {
  console.log('NUS Secure Access Tracker: Running in top-level frame. Initializing scanner.')
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "scanLinks") {
      scanAllLinksAndSend()
      sendResponse({status: 'Scan initiated'})
    }
    return true
  })
  function debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }
  const debouncedScan = debounce(scanAllLinksAndSend, 1500)
  if (document.readyState === 'complete') {
    debouncedScan()
  } else {
    window.addEventListener('load', debouncedScan)
  }
  const observer = new MutationObserver((mutationsList) => {
    observer.disconnect()
    debouncedScan()
    setTimeout(() => {
        observer.observe(document.body, { childList: true, subtree: true })
    }, 2000)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
} else {
  console.log('NUS Secure Access Tracker: Running in an iframe. Scanner will not initialize.')
}
function scanAllLinks() {
  const links = [];
  const selectors = [
    'a[href]',
    'button',
    'input[type="button"]',
    'input[type="submit"]',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[onclick]',
    '[tabindex="0"]'
  ];

  const clickableElements = document.querySelectorAll(selectors.join(', '));

  for (const el of clickableElements) {
    let url = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('formaction') || '';
    if (el.tagName === 'INPUT' && el.form && el.form.action && !url) {
        url = el.form.action;
    }
    // For elements with onclick but no obvious URL, we can't determine a destination
    // but we can still flag them based on text content.
    
    let text = el.textContent.trim() || el.value || el.alt || el.ariaLabel || '';
    const triggers = findEmotionalTriggers(text);

    links.push({
      url: url ? new URL(url, document.baseURI).href : '', // Resolve relative URLs
      text: text,
      status: url ? getLinkStatus(url) : 'neutral',
      reason: url ? '' : 'No direct URL, check for risky text.',
      elementType: el.tagName.toLowerCase(),
      triggers: triggers
    });
  }

  // Deduplicate based on URL and text to avoid clutter
  const uniqueLinks = Array.from(new Map(links.map(link => [`${link.url}:${link.text}`, link])).values());
  return uniqueLinks;
}
function scanLinksInNode(node, links) {
  const anchorTags = node.querySelectorAll ? node.querySelectorAll('a') : []
  for (let link of anchorTags) {
    let linkText = link.textContent.trim() || ''
    let href = link.getAttribute('href')
    let status = 'safe'
    let url = ''
    if (!href || href === '#' || href.trim() === '') {
      status = 'broken'
      url = href || ''
    } else {
      try {
        url = link.href
        status = getLinkStatus(url)
      } catch (e) {
        status = 'invalid'
        url = href
      }
    }
    links.push({
      url: url,
      text: linkText,
      status: status
    })
  }
  if (node.querySelectorAll) {
    const allElements = node.querySelectorAll('*')
    for (let el of allElements) {
      if (el.shadowRoot) {
        scanLinksInNode(el.shadowRoot, links)
      }
    }
  }
}
const ENABLE_SAFE_BROWSING = true
const ENABLE_NUS_LISTS = true
const NUS_WHITELIST = []
const NUS_BLACKLIST = []
const SAFE_BROWSING_API_KEY = 'AIzaSyDbgdnawHqo9NLoYb3Om5ArfhAltoQDu98'
function getLinkStatus(url) {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    if (hostname.includes('nus') && !hostname.endsWith('nus.edu.sg')) {
      return 'warning'
    }
    const suspiciousTLDs = ['.xyz', '.tk', '.ml', '.ga', '.cf']
    if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
      return 'danger'
    }
    const phishingKeywords = ['login', 'signin', 'account', 'verify', 'secure', 'bank', 'paypal']
    if (phishingKeywords.some(keyword => hostname.includes(keyword))) {
      return 'warning'
    }
    return 'safe'
  } catch (e) {
    return 'invalid'
  }
}
function findEmotionalTriggers(text) {
  const foundTriggers = []
  if (!text) return foundTriggers
  const lowerText = text.toLowerCase()
  for (const category in EMOTIONAL_TRIGGERS) {
    for (const trigger of EMOTIONAL_TRIGGERS[category]) {
      if (lowerText.includes(trigger)) {
        foundTriggers.push(trigger)
      }
    }
  }
  return foundTriggers
}
function detectSenderMismatch() {
  const senderNameEl = document.querySelector('[data-sender-name], .sender-name, .from .name, .fromName')
  const senderEmailEl = document.querySelector('[data-sender-email], .sender-email, .from .email, .fromEmail')
  let senderName = senderNameEl ? senderNameEl.textContent.trim() : ''
  let senderEmail = senderEmailEl ? senderEmailEl.textContent.trim() : ''
  if (!senderEmail && senderName) {
    const match = senderName.match(/<([^>]+)>/)
    if (match) {
      senderEmail = match[1]
      senderName = senderName.replace(/<[^>]+>/, '').trim()
    }
  }
  if (senderName && senderEmail) {
    const emailDomain = senderEmail.split('@')[1] || ''
    if ((/nus|university|school|admin|it/i.test(senderName)) && !/nus\.edu\.sg$/i.test(emailDomain)) {
      return { senderName, senderEmail, emailDomain, mismatch: true }
    }
  }
  return null
}
function detectExternalEmailBanner() {
  const banner = document.querySelector('.external-email, .external-banner, .external-warning, [data-external-email], .externalEmailBanner')
  if (banner) {
    return banner.textContent.trim()
  }
  const text = document.body.textContent
  if (/external email/i.test(text)) {
    return 'External Email banner detected'
  }
  return null
}
function isExternalUrl(url) {
  try {
    const u = new URL(url)
    return !TRUSTED_DOMAINS.some(domain => u.hostname.endsWith(domain))
  } catch {
    return false
  }
}
function isValidLinkUrl(url) {
  return url && /^(https?:|mailto:)/i.test(url)
}
function gatherPhishingRedFlags() {
  const redFlags = []
  const linkEls = Array.from(document.querySelectorAll('a, button'))
  for (const el of linkEls) {
    let href = el.getAttribute('href') || ''
    let triggers = findEmotionalTriggers(el.textContent)
    if (triggers.length > 0) {
      if (isValidLinkUrl(href) && isExternalUrl(href)) {
        redFlags.push({ type: 'emotional', text: el.textContent.trim(), triggers, url: href })
      }
    }
  }
  const senderMismatch = detectSenderMismatch()
  if (senderMismatch) {
    redFlags.push({ type: 'sender-mismatch', ...senderMismatch })
  }
  const externalBanner = detectExternalEmailBanner()
  if (externalBanner) {
    redFlags.push({ type: 'external-banner', banner: externalBanner })
  }
  return redFlags
}
function scanAllLinksAndSend() {
  console.log('NUS Secure Access Tracker: scanAllLinksAndSend() triggered.')
  const links = scanAllLinks()
  const redFlags = gatherPhishingRedFlags()
  console.log(`NUS Secure Access Tracker: Found ${links.length} links and ${redFlags.length} red flags.`)
  try {
    chrome.runtime.sendMessage({
      action: 'analyzeLinks',
      links: links,
      redFlags: redFlags,
      tabUrl: window.location.href
    })
    console.log('NUS Secure Access Tracker: Sent data to background script.')
  } catch (e) {
    console.error('NUS Secure Access Tracker: Failed to send message to background script.', e)
  }
}
function isSuspiciousUrl(url) {
  return false
}
function highlightSuspiciousLink(link) {
  link.style.border = '2px solid red'
  link.style.padding = '2px'
}
