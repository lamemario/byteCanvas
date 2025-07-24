document.addEventListener('DOMContentLoaded', function() {
  const scanButton = document.getElementById('scanButton');
  const reportButton = document.getElementById('reportButton');
  const reportLink = document.getElementById('reportLink');
  const scanStatus = document.getElementById('scanStatus');
  const results = document.getElementById('results');
  const tips = document.getElementById('tips');
  const linkCount = document.getElementById('linkCount');
  const statusElement = document.getElementById('status');
  const tabButtons = document.querySelectorAll('.tab-button');
  
  let currentTab = 'all';
  let scanResults = [];

  // --- Main function to refresh all UI elements from storage ---
  function refreshUi() {
    if (!currentTabId) return;

    const storageKeys = [
      'scanState_' + currentTabId,
      'scanResults_' + currentTabId,
      'redFlags_' + currentTabId,
      'deceptiveUrl_' + currentTabId
    ];

    chrome.storage.local.get(storageKeys, function(data) {
      if (chrome.runtime.lastError) {
        console.error("Error fetching data from storage:", chrome.runtime.lastError);
        return;
      }
      
      const scanState = data['scanState_' + currentTabId];
      const links = data['scanResults_' + currentTabId] || [];
      let redFlags = data['redFlags_' + currentTabId] || [];
      const deceptiveUrlInfo = data['deceptiveUrl_' + currentTabId];

      // If a deceptive URL was detected, add it as a high-priority red flag
      if (deceptiveUrlInfo && deceptiveUrlInfo.isDeceptive) {
        // Avoid adding duplicates
        if (!redFlags.some(flag => flag.type === 'deceptive-url')) {
          redFlags.unshift({
            type: 'deceptive-url',
            realHost: deceptiveUrlInfo.realHost,
            fakeHost: deceptiveUrlInfo.fakeHost
          });
        }
      }

      displayRedFlags(redFlags);
      displayResults(links);
      linkCount.textContent = `${links.length} links`;

      // Update UI based on the specific scan state
      if (scanState === 'scanning') {
        scanButton.disabled = true;
        scanButton.innerHTML = '<span class="material-icons rotating">sync</span> Scanning...';
        scanStatus.textContent = 'Scan in progress...';
        scanStatus.style.backgroundColor = 'var(--surface-color)';
        scanStatus.style.color = 'var(--text-color)';
        results.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Analyzing links...</p></div>`;
      } else if (scanState === 'complete') {
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="material-icons">security</span> Scan This Page';
        scanStatus.textContent = 'Scan complete!';
        scanStatus.style.backgroundColor = 'var(--success-color)';
        scanStatus.style.color = 'white';
        if (links.length === 0) {
            results.innerHTML = `<div class="empty-state"><span class="material-icons">search</span><p>No scannable links found on this page.</p></div>`;
        }
      } else {
        // Default state if no scan has happened
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="material-icons">security</span> Scan This Page';
        scanStatus.textContent = 'Ready to scan.';
        scanStatus.style.backgroundColor = 'var(--surface-color)';
        scanStatus.style.color = 'var(--text-color)';
        results.innerHTML = `<div class="empty-state"><span class="material-icons">shield</span><p>Click "Scan This Page" to check for threats.</p></div>`;
      }
    });
  }

  // Initial setup: Get current tab and set up listeners
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || tabs.length === 0) {
      scanStatus.textContent = 'Error: No active tab found.';
      return;
    }
    currentTabId = tabs[0].id;

    // Initial paint of the UI with data from storage
    refreshUi();

    // --- Listen for storage changes to auto-refresh UI ---
    chrome.storage.onChanged.addListener(function(changes, namespace) {
      if (namespace === 'local') {
        const stateKey = 'scanState_' + currentTabId;
        // If the state for our current tab has changed, refresh the UI
        if (changes[stateKey]) {
          console.log('Scan state changed, refreshing UI for tab', currentTabId);
          refreshUi();
        }
      }
    });
  });

  // Load tips
  loadTips();

  // Scan button click handler (manual scan)
  scanButton.addEventListener('click', function() {
    statusElement.textContent = 'Scanning...';
    scanButton.disabled = true;
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "scanLinks"}, function(response) {
        if (chrome.runtime.lastError) {
          statusElement.textContent = 'Error: Could not scan page';
          scanButton.disabled = false;
          return;
        }
        
        if (response && response.elements) {
          scanResults = response.elements;
          chrome.storage.local.set({['scanResults_' + tabs[0].id]: scanResults});
          displayResults();
          statusElement.textContent = `Found ${scanResults.length} elements`;
        } else {
          statusElement.textContent = 'No elements found';
        }
        scanButton.disabled = false;
      });
    });
  });

  // Report button click handler
  reportButton.addEventListener('click', function() {
    const url = reportLink.value.trim();
    if (url) {
      reportButton.innerHTML = '<span class="material-icons rotating">sync</span>';
      reportButton.disabled = true;
      setTimeout(() => {
        reportLink.value = '';
        reportButton.innerHTML = '<span class="material-icons">send</span>';
        reportButton.disabled = false;
        const status = document.createElement('div');
        status.className = 'status success';
        status.textContent = 'Thank you for your report!';
        document.querySelector('.report-form').appendChild(status);
        setTimeout(() => status.remove(), 3000);
      }, 1000);
    }
  });

  reportLink.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      reportButton.click();
    }
  });

  function loadResults() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.storage.local.get(['scanResults_' + tabs[0].id], function(result) {
        if (result['scanResults_' + tabs[0].id]) {
          scanResults = result['scanResults_' + tabs[0].id];
          displayResults();
          statusElement.textContent = `Found ${scanResults.length} elements`;
        }
      });
    });
  }

  function displayResults() {
    if (!scanResults || scanResults.length === 0) {
      results.innerHTML = '<div class="scan-message">Click "Scan Now" to check the page</div>';
      return;
    }

    const filteredResults = scanResults.filter(element => {
      if (currentTab === 'all') return true;
      if (currentTab === 'safe') return element.status === 'safe';
      if (currentTab === 'warning') return element.status === 'warning';
      if (currentTab === 'danger') return element.status === 'danger';
      return true;
    });

    results.innerHTML = filteredResults.map(element => {
      let statusLabel = '';
      if (element.status === 'danger') {
        statusLabel = '⚠ Danger';
      } else if (element.status === 'warning') {
        statusLabel = '⚠ Warning';
      } else {
        statusLabel = '✓ Safe';
      }
      return `
      <div class="element-card ${element.status}">
        <div class="element-type">${element.elementType}</div>
        <div class="element-text">${element.text || 'No text'}</div>
        ${element.url ? `<div class="element-url">${element.url}</div>` : ''}
        <div class="element-status ${element.status}">
          ${statusLabel}
          ${element.reason ? ` - ${element.reason}` : ''}
        </div>
        ${element.path ? `<div class="element-path">${element.path}</div>` : ''}
      </div>
      `;
    }).join('');
    // Show the number of items scanned
    if (linkCount) linkCount.textContent = `${filteredResults.length} items scanned`;
  }

  // Set up tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentTab = button.dataset.tab;
      displayResults();
    });
  });

  // Listen for storage changes and auto-refresh scan results
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tabId = tabs[0].id;
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area === 'local') {
        if (changes['scanResults_' + tabId]) {
          const elements = changes['scanResults_' + tabId].newValue || [];
          scanResults = elements;
          chrome.storage.local.set({['scanResults_' + tabId]: scanResults});
          displayResults();
          linkCount.textContent = `${elements.length} elements`;
          scanStatus.textContent = 'Scan complete!';
          scanStatus.style.backgroundColor = 'var(--success-color)';
          scanStatus.style.color = 'white';
        }
        if (changes['redFlags_' + tabId]) {
          const redFlags = changes['redFlags_' + tabId].newValue || [];
          displayRedFlags(redFlags);
        }
      }
    });
  });
});

function displayRedFlags(redFlags) {
  let container = document.getElementById('redFlags');
  if (!container) {
    container = document.createElement('div');
    container.id = 'redFlags';
    const scanSection = document.querySelector('.scan-section');
    scanSection.parentNode.insertBefore(container, scanSection.nextSibling);
  }
  // Always show the banner, even if no red flags
  let html = `<div class="red-flags-section">
    <h3><span class="material-icons">report_gmailerrorred</span> Phishing Red Flags</h3>`;
  if (!redFlags || redFlags.length === 0) {
    html += `<div class="red-flag-summary no-flags">
      <span class="material-icons">check_circle</span> No phishing red flags detected on this page.
    </div>
    <div class="red-flag-what">
      <b>What we checked for:</b>
      <ul>
        <li>Emotional trigger words in links and buttons (e.g., urgent, help, sign in)</li>
        <li>Sender name/email mismatch (if visible)</li>
        <li>External email banners</li>
        <li>Suspicious or external links</li>
        <li>Google Safe Browsing blacklist (malware, phishing, etc.)</li>
      </ul>
    </div>`;
  } else {
    html += `<ul class="red-flags-list">`;
    redFlags.forEach(flag => {
      if (flag.type === 'deceptive-url') {
        html += `<div class="red-flag red-flag-deceptive">
          <span class="material-icons">report</span>
          <div class="red-flag-content">
            <div class="red-flag-title">Deceptive URL Detected!</div>
            <div class="red-flag-explanation">This page's address is designed to trick you. You are on <strong>${flag.realHost}</strong>, not ${flag.fakeHost}.</div>
          </div>
        </div>`;
      } else if (flag.type === 'emotional') {
        html += `<div class="red-flag red-flag-emotional">
          <span class="material-icons">priority_high</span>
          <div class="red-flag-content">
            <div class="red-flag-title">Emotional trigger in link/button: <b>${flag.text}</b> <span class="red-flag-badge">${flag.triggers.join(', ')}</span></div>
            <div class="red-flag-explanation">Links or buttons with emotional language (e.g., urgent, help, sign in) are often used in phishing attacks to trick users into acting quickly.</div>
          </div>
        </div>`;
      } else if (flag.type === 'sender-mismatch') {
        html += `<div class="red-flag red-flag-sender">
          <span class="material-icons">person_search</span>
          <div class="red-flag-content">
            <div class="red-flag-title">Sender name/email mismatch: <b>${flag.senderName}</b> &lt;${flag.senderEmail}&gt; (domain: ${flag.emailDomain})</div>
            <div class="red-flag-explanation">The sender's name suggests a trusted source, but the email address is not from an official domain. Always verify the sender's email.</div>
          </div>
        </div>`;
      } else if (flag.type === 'external-banner') {
        html += `<div class="red-flag red-flag-external">
          <span class="material-icons">outbound</span>
          <div class="red-flag-content">
            <div class="red-flag-title">${flag.banner}</div>
            <div class="red-flag-explanation">External email banners warn you that the message is from outside your organization. Be extra cautious with links and attachments.</div>
          </div>
        </div>`;
      }
    });
    html += '</ul>';
    html += `<div class="red-flag-what">
      <b>What we checked for:</b>
      <ul>
        <li>Emotional trigger words in links and buttons (e.g., urgent, help, sign in)</li>
        <li>Sender name/email mismatch (if visible)</li>
        <li>External email banners</li>
        <li>Suspicious or external links</li>
        <li>Google Safe Browsing blacklist (malware, phishing, etc.)</li>
      </ul>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

function loadTips() {
  const tips = [
    {
      icon: 'email',
      text: "Be cautious of emails asking for your NUS credentials"
    },
    {
      icon: 'link',
      text: "Check the URL carefully before logging in"
    },
    {
      icon: 'lock',
      text: "Never share your NUS password with anyone"
    },
    {
      icon: 'security',
      text: "Look for the padlock icon in your browser's address bar"
    }
  ];

  const tipsElement = document.getElementById('tips');
  let html = '<ul class="tips-list">';
  tips.forEach(tip => {
    html += `
      <li class="tip-item">
        <span class="material-icons">${tip.icon}</span>
        <span>${tip.text}</span>
      </li>
    `;
  });
  html += '</ul>';
  tipsElement.innerHTML = html;
}

function getElementBadges(element) {
  const badges = [];
  
  // Element type badge
  if (element.elementType) {
    const typeIcon = {
      'link': 'link',
      'button': 'smart_button',
      'input': 'input',
      'menuitem': 'menu',
      'tab': 'tab',
      'option': 'list',
      'interactive': 'touch_app'
    }[element.elementType] || 'touch_app';
    
    badges.push(`<span class='badge badge-${element.elementType}' title='This is a ${element.elementType} element'>
      <span class='material-icons'>${typeIcon}</span> ${element.elementType.charAt(0).toUpperCase() + element.elementType.slice(1)}
    </span>`);
  }
  
  // Emotional triggers badge
  if (element.triggers && element.triggers.length > 0) {
    badges.push(`<span class='badge badge-trigger' title='Contains emotional triggers: ${element.triggers.join(", ")}'>
      <span class='material-icons'>warning</span> Emotional Triggers
    </span>`);
  }
  
  return badges;
}

function getLinkTitle(link) {
  let prefix = '';
  if (link.elementType === 'button') prefix = 'Button: ';
  else if (link.elementType === 'link') prefix = '';
  if (link.text && link.text.trim() && link.text.trim() !== link.url) return prefix + link.text.trim();
  try {
    const u = new URL(link.url);
    if (u.protocol === 'mailto:') return prefix + u.pathname;
    if (/unsubscribe/i.test(link.url)) return prefix + 'Unsubscribe';
    if (/login|signin/i.test(link.url)) return prefix + 'Sign In';
    if (/register|signup/i.test(link.url)) return prefix + 'Register';
    if (/reset|forgot/i.test(link.url)) return prefix + 'Reset Password';
    if (/download/i.test(link.url)) return prefix + 'Download';
    if (/track|utm_|click|redirect/i.test(link.url)) return prefix + 'Tracking Link';
    if (/add.*calendar/i.test(link.url)) return prefix + 'Add to Calendar';
    if (/profile/i.test(link.url)) return prefix + 'Profile';
    if (/account/i.test(link.url)) return prefix + 'Account';
    if (/search/i.test(link.url)) return prefix + 'Search';
    if (/maps/i.test(link.url)) return prefix + 'Maps';
    if (/mail/i.test(link.url)) return prefix + 'Mail';
    if (/form/i.test(link.url)) return prefix + 'Form';
    if (/read/i.test(link.url)) return prefix + 'Read Now';
    if (/address/i.test(link.url)) return prefix + 'Address Book';
    if (/preferences/i.test(link.url)) return prefix + 'Preferences';
    if (/submit/i.test(link.url)) return prefix + 'Submit';
    if (/verify/i.test(link.url)) return prefix + 'Verify';
    if (/secure/i.test(link.url)) return prefix + 'Secure Link';
    if (/external/i.test(link.url)) return prefix + 'External Link';
    if (/internal/i.test(link.url)) return prefix + 'Internal Link';
    return prefix + u.hostname;
  } catch {
    return prefix + '(no text)';
  }
}

function truncateUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname.substring(0, 20) + (urlObj.pathname.length > 20 ? '...' : '');
  } catch {
    return url.substring(0, 40) + (url.length > 40 ? '...' : '');
  }
} 