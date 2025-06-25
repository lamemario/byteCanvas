// Configuration
const CONFIG = {
  ENABLE_SAFE_BROWSING: true,
  ENABLE_NUS_LISTS: true,
  ENABLE_GENERIC_CHECKS: true,
  ENABLE_EMOTIONAL_TRIGGERS: true,
  ENABLE_URL_PATTERN_CHECKS: true,
  DEBUG_MODE: true // Enable debug logging
};

// NUS-specific domains
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

// Canvas-specific selectors to ignore
const CANVAS_IGNORE_SELECTORS = [
  '.ic-app-header',
  '.ic-app-nav',
  '.ic-app-main-content',
  '.ic-app-footer',
  '.ic-app-header__main-navigation',
  '.ic-app-header__secondary-navigation',
  '.ic-app-header__utilities',
  '.ic-app-header__menu',
  '.ic-app-header__menu-list',
  '.ic-app-header__menu-item'
];

// Webmail-specific selectors to ignore
const WEBMAIL_IGNORE_SELECTORS = [
  '.ms-Fabric',
  '.ms-Button',
  '.ms-Link',
  '.ms-Nav',
  '.ms-CommandBar',
  '.ms-CommandBarItem',
  '.ms-CommandBarItem-link',
  '.ms-CommandBarItem-icon',
  '.ms-CommandBarItem-text',
  '.ms-CommandBarItem-overflow',
  '.ms-CommandBarItem-overflowButton',
  '.ms-CommandBarItem-overflowButton-icon',
  '.ms-CommandBarItem-overflowButton-text',
  '.ms-CommandBarItem-overflowButton-overflow',
  '.ms-CommandBarItem-overflowButton-overflowButton',
  '.ms-CommandBarItem-overflowButton-overflowButton-icon',
  '.ms-CommandBarItem-overflowButton-overflowButton-text',
  '.ms-CommandBarItem-overflowButton-overflowButton-overflow'
];

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "scanLinks") {
    console.log('Received scan request');
    const elements = quickScanInteractiveElements();
    console.log('Scanned elements:', elements);
    sendResponse({elements: elements});
  }
  return true;
});

function quickScanInteractiveElements() {
  console.log('Starting element scan');
  const elements = [];
  
  // Skip if we're in an iframe
  if (window !== window.top) {
    console.log('Skipping scan in iframe');
    return elements;
  }

  // Get all interactive elements
  const interactiveElements = document.querySelectorAll('a[href], button, [role="button"], [role="link"], [onclick], [data-url], [data-href], form[action]');
  console.log('Found interactive elements:', interactiveElements.length);

  // Process each element
  for (const element of interactiveElements) {
    // Skip elements that are part of the browser UI
    if (isBrowserUIElement(element)) {
      continue;
    }
    
    // Skip elements that are part of the page's UI framework
    if (isFrameworkUIElement(element)) {
      continue;
    }
    
    // Skip elements that are part of the email content
    if (isEmailContentElement(element)) {
      continue;
    }

    // Skip elements with no visible text or purpose
    const description = getElementDescription(element);
    if (description === 'Clickable element' || !description.trim()) {
      continue;
    }

    // Skip elements that are too small or hidden
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10 || rect.width === 0 || rect.height === 0) {
      continue;
    }

    // Skip elements with no visible text
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }
    
    const details = {
      type: getElementType(element),
      text: description,
      status: 'safe', // Default to safe for trusted domains
      elementType: getElementType(element)
    };

    // Quick URL check
    const url = element.href || 
                element.getAttribute('href') || 
                element.getAttribute('data-url') || 
                element.getAttribute('data-href') ||
                element.getAttribute('formaction') ||
                element.getAttribute('action');

    if (url && isValidLinkUrl(url)) {
      details.url = url;
      const statusInfo = getLinkStatus(url);
      details.status = statusInfo.status;
      details.reason = statusInfo.reason;
    }

    elements.push(details);
  }

  console.log('Scan complete. Found elements:', elements.length);
  return elements;
}

function isBrowserUIElement(element) {
  const browserUIIdentifiers = [
    'chrome-extension',
    'moz-extension',
    'edge-extension',
    'browser-extension',
    'browser-ui',
    'chrome-ui',
    'moz-ui',
    'edge-ui'
  ];
  
  const elementClasses = element.className.toLowerCase();
  const elementId = element.id.toLowerCase();
  
  return browserUIIdentifiers.some(id => 
    elementClasses.includes(id) || 
    elementId.includes(id) ||
    element.tagName.toLowerCase() === 'iframe' && element.src.includes(id)
  );
}

function isFrameworkUIElement(element) {
  // Check if element is part of Canvas UI
  if (window.location.hostname.includes('canvas.nus.edu.sg')) {
    const canvasSelectors = [
      '.ic-app-header__menu',
      '.ic-app-header__menu-list',
      '.ic-app-header__menu-item',
      '.ic-app-header__utilities',
      '.ic-app-header__secondary-navigation',
      '.ic-app-header__main-navigation',
      '.ic-app-header__logo',
      '.ic-app-header__logomark',
      '.ic-app-header__logomark-container',
      '.ic-app-header__logomark-container-image',
      '.ic-app-header__logomark-container-image-container',
      '.ic-app-header__logomark-container-image-container-image',
      '.ic-app-header__logomark-container-image-container-image-image',
      '.ic-app-header__logomark-container-image-container-image-image-image',
      '.ic-app-header__logomark-container-image-container-image-image-image-image'
    ];
    
    return canvasSelectors.some(selector => 
      element.matches(selector) || 
      element.closest(selector)
    );
  }
  
  // Check if element is part of Webmail UI
  if (window.location.hostname.includes('outlook.office.com')) {
    const webmailSelectors = [
      '.ms-CommandBar',
      '.ms-CommandBarItem',
      '.ms-CommandBarItem-link',
      '.ms-CommandBarItem-icon',
      '.ms-CommandBarItem-text',
      '.ms-CommandBarItem-overflow',
      '.ms-CommandBarItem-overflowButton',
      '.ms-CommandBarItem-overflowButton-icon',
      '.ms-CommandBarItem-overflowButton-text',
      '.ms-CommandBarItem-overflowButton-overflow',
      '.ms-CommandBarItem-overflowButton-overflowButton',
      '.ms-CommandBarItem-overflowButton-overflowButton-icon',
      '.ms-CommandBarItem-overflowButton-overflowButton-text',
      '.ms-CommandBarItem-overflowButton-overflowButton-overflow',
      '.ms-CommandBarItem-overflowButton-overflowButton-overflowButton',
      '.ms-CommandBarItem-overflowButton-overflowButton-overflowButton-icon',
      '.ms-CommandBarItem-overflowButton-overflowButton-overflowButton-text',
      '.ms-CommandBarItem-overflowButton-overflowButton-overflowButton-overflow'
    ];
    
    return webmailSelectors.some(selector => 
      element.matches(selector) || 
      element.closest(selector)
    );
  }
  
  return false;
}

function isEmailContentElement(element) {
  if (!window.location.hostname.includes('outlook.office.com')) {
    return false;
  }
  
  // Skip elements that are part of the email content
  const emailContentSelectors = [
    '.ms-ReadingPane',
    '.ms-ReadingPane-containerBody',
    '.ms-ReadingPane-containerBodyContent',
    '.ms-ReadingPane-containerBodyContentBody',
    '.ms-ReadingPane-containerBodyContentBodyContent',
    '.ms-ReadingPane-containerBodyContentBodyContentBody',
    '.ms-ReadingPane-containerBodyContentBodyContentBodyContent',
    '.ms-ReadingPane-containerBodyContentBodyContentBodyContentBody',
    '.ms-ReadingPane-containerBodyContentBodyContentBodyContentBodyContent',
    '.ms-ReadingPane-containerBodyContentBodyContentBodyContentBodyContentBody'
  ];
  
  return emailContentSelectors.some(selector => 
    element.matches(selector) || 
    element.closest(selector)
  );
}

function getElementPath(element) {
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className) {
      selector += `.${current.className.split(' ').join('.')}`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

function getElementDescription(element) {
  // Try to get text content
  let text = element.textContent.trim();
  if (text) {
    // Limit text length and clean it up
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 50) {
      text = text.substring(0, 47) + '...';
    }
    return text;
  }

  // Try to get aria-label
  text = element.getAttribute('aria-label');
  if (text) {
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 50) {
      text = text.substring(0, 47) + '...';
    }
    return text;
  }

  // Try to get title
  text = element.getAttribute('title');
  if (text) {
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 50) {
      text = text.substring(0, 47) + '...';
    }
    return text;
  }

  // Try to get alt text for images
  if (element.tagName.toLowerCase() === 'img') {
    text = element.getAttribute('alt');
    if (text) {
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > 50) {
        text = text.substring(0, 47) + '...';
      }
      return text;
    }
  }

  // Try to get placeholder
  text = element.getAttribute('placeholder');
  if (text) {
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 50) {
      text = text.substring(0, 47) + '...';
    }
    return text;
  }

  // Try to get value
  text = element.value;
  if (text) {
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 50) {
      text = text.substring(0, 47) + '...';
    }
    return text;
  }

  return '';
}

function getElementType(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const type = element.getAttribute('type');

  if (tag === 'a') return 'Link';
  if (tag === 'button') return 'Button';
  if (tag === 'input') {
    if (type === 'submit') return 'Submit button';
    if (type === 'button') return 'Button';
    return 'Input field';
  }
  if (tag === 'form') return 'Form';
  if (role === 'button') return 'Button';
  if (role === 'link') return 'Link';
  return 'Clickable element';
}

function isValidLinkUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function getLinkStatus(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check if it's a trusted domain
    if (TRUSTED_DOMAINS.some(domain => hostname.includes(domain))) {
      return {
        status: 'safe',
        reason: 'Official NUS/Microsoft site'
      };
    }
    
    // Check if it's a NUS domain
    if (NUS_WHITELIST.some(domain => hostname.includes(domain))) {
      return {
        status: 'safe',
        reason: 'Official NUS site'
      };
    }
    
    // Check for suspicious TLDs
    const suspiciousTLDs = ['.xyz', '.tk', '.pw', '.top'];
    if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
      return {
        status: 'danger',
        reason: 'Suspicious website - Known for phishing'
      };
    }
    
    // Check for HTTPS
    if (urlObj.protocol !== 'https:') {
      return {
        status: 'warning',
        reason: 'Not secure - Uses HTTP instead of HTTPS'
      };
    }

    // Check for suspicious patterns in URL
    const suspiciousPatterns = [
      { pattern: /login|signin|sign-in|log-in/i, reason: 'Suspicious - Appears to be a login page' },
      { pattern: /verify|validation|confirm/i, reason: 'Suspicious - Appears to be a verification page' },
      { pattern: /account|profile|settings/i, reason: 'Suspicious - Appears to be an account page' },
      { pattern: /secure|security|protect/i, reason: 'Suspicious - Uses security-related terms' },
      { pattern: /bank|paypal|payment|money/i, reason: 'Suspicious - Financial-related terms' }
    ];

    for (const {pattern, reason} of suspiciousPatterns) {
      if (pattern.test(urlObj.pathname) || pattern.test(urlObj.search)) {
        return {
          status: 'warning',
          reason: reason
        };
      }
    }
    
    return {
      status: 'safe',
      reason: 'Secure website'
    };
  } catch (e) {
    return {
      status: 'invalid',
      reason: 'Invalid link - Cannot be opened'
    };
  }
}

function findEmotionalTriggers(text) {
  if (!text) return [];
  
  const triggers = [];
  const emotionalWords = [
    'urgent action required',
    'verify your account',
    'unauthorized access',
    'security breach',
    'account suspended',
    'password expired',
    'click here to verify',
    'limited time offer',
    'your account will be deleted',
    'immediate action required'
  ];

  const lowerText = text.toLowerCase();
  emotionalWords.forEach(word => {
    if (lowerText.includes(word)) {
      triggers.push(word);
    }
  });

  return triggers;
}

// Auto-scan when the page loads
console.log('Content script loaded');
quickScanInteractiveElements(); 