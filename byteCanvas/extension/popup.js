function getCurrentTabId(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || tabs.length === 0) {
      // handle error
      if (typeof scanStatus !== 'undefined' && scanStatus) scanStatus.textContent = 'Error: No active tab found.';
      callback(null);
      return;
    }
    const tabId = tabs[0].id;
    callback(tabId);
  });
}

let currentTab = 'safe'; // Default to 'Safe' tab

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
  
  let scanResults = [];
  let scanAvailable = false;
  let currentTabId; // Declare at the top so it is always in scope

  // --- Main function to refresh all UI elements from storage ---
  function refreshUi() {
    if (!currentTabId) return;

    const storageKeys = [
      'scanState_' + currentTabId,
      'scanResults_' + currentTabId,
      'redFlags_' + currentTabId,
      'deceptiveUrl_' + currentTabId
    ];
    console.log('Refreshing UI with storage keys:', storageKeys);

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
      displayResults();
      if (linkCount) {
        linkCount.textContent = `${links.length} links`;
      }

      // Update UI based on the specific scan state
      if (scanState === 'scanning') {
        scanButton.disabled = true;
        scanButton.innerHTML = '<span class="material-icons rotating">sync</span> Scanning...';
        if (scanStatus) {
          scanStatus.textContent = 'Scan in progress...';
          scanStatus.style.backgroundColor = 'var(--surface-color)';
          scanStatus.style.color = 'var(--text-color)';
        }
        results.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Analyzing links...</p></div>`;
      } else if (scanState === 'complete') {
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="material-icons">security</span> Scan This Page';
        if (scanStatus) {
          scanStatus.textContent = 'Scan complete!';
          scanStatus.style.backgroundColor = 'var(--success-color)';
          scanStatus.style.color = 'white';
        }
        if (links.length === 0) {
            results.innerHTML = `<div class="empty-state"><span class="material-icons">search</span><p>No scannable links found on this page.</p></div>`;
        }
      } else {
        // Default state if no scan has happened
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="material-icons">security</span> Scan This Page';
        if (scanStatus) {
          scanStatus.textContent = 'Ready to scan.';
          scanStatus.style.backgroundColor = 'var(--surface-color)';
          scanStatus.style.color = 'var(--text-color)';
        }
        results.innerHTML = `<div class="empty-state"><span class="material-icons">shield</span><p>Click "Scan This Page" to check for threats.</p></div>`;
      }
    });
  }

  function setScanButtonAvailability(available) {
    if (available) {
      scanButton.disabled = false;
      scanButton.title = '';
      scanButton.classList.remove('disabled');
    } else {
      scanButton.disabled = true;
      scanButton.title = 'Scanning is not available on this page.';
      scanButton.classList.add('disabled');
    }
  }

  function setScanUnavailableUI() {
    setScanButtonAvailability(false);
    if (scanStatus) scanStatus.textContent = 'Scanning not available on this page.';
    if (results) results.innerHTML = '<div class="empty-state"><span class="material-icons">block</span><p>Scanning not available on this page.</p></div>';
    if (statusElement) statusElement.textContent = '';
  }

  // Initial setup: Get current tab and set up listeners
  getCurrentTabId(function(tabId) {
    if (!tabId) return;
    currentTabId = tabId;

    // Handshake: ping content script
    chrome.tabs.sendMessage(currentTabId, {action: "ping"}, function(response) {
      if (response && response.status === 'pong') {
        scanAvailable = true;
        setScanButtonAvailability(true);
        if (scanStatus) scanStatus.textContent = 'Ready to scan.';
        refreshUi();
      } else {
        scanAvailable = false;
        setScanUnavailableUI();
      }
    });

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
    if (!scanAvailable) {
      setScanUnavailableUI();
      return;
    }
    console.log('Scan button clicked');
    if (statusElement) {
      statusElement.textContent = 'Scanning...';
    }
    scanButton.disabled = true;
    
    getCurrentTabId(function(tabId) {
      if (!tabId) return;
      currentTabId = tabId;
      // Clear old scan results before starting a new scan
      const scanResultsKey = 'scanResults_' + currentTabId;
      const scanStateKey = 'scanState_' + currentTabId;
      const redFlagsKey = 'redFlags_' + currentTabId;
      console.log('Clearing old scan results for keys:', scanResultsKey, scanStateKey, redFlagsKey);
      chrome.storage.local.remove([scanResultsKey, scanStateKey, redFlagsKey], function() {
        console.log('Old scan results cleared. Sending scanLinks message to content script for tab', currentTabId);
        chrome.tabs.sendMessage(currentTabId, {action: "scanLinks"}, function(response) {
          if (chrome.runtime.lastError) {
            if (statusElement) {
              statusElement.textContent = 'Error: Could not scan page';
            }
            scanButton.disabled = false;
            return;
          }
          
          if (response && response.elements) {
            scanResults = response.elements;
            chrome.storage.local.set({['scanResults_' + currentTabId]: scanResults});
            displayResults();
            if (statusElement) {
              statusElement.textContent = `Found ${scanResults.length} elements`;
            }
          } else {
            if (statusElement) {
              statusElement.textContent = 'No elements found';
            }
          }
          scanButton.disabled = false;
        });
      });
    });
  });

  // Report button click handler
  reportButton.addEventListener('click', function() {
    const url = reportLink.value.trim();
    if (url) {
      reportButton.innerHTML = '<span class="material-icons rotating">sync</span>';
      reportButton.disabled = true;

      fetch('http://127.0.0.1:5000/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, meta: { reported_by: 'extension' } })
      })
      .then(response => response.json())
      .then(data => {
        reportLink.value = '';
        reportButton.innerHTML = '<span class="material-icons">send</span>';
        reportButton.disabled = false;
        const status = document.createElement('div');
        status.className = 'status success';
        status.textContent = data.success ? 'Thank you for your report!' : 'Error: ' + data.error;
        document.querySelector('.report-form').appendChild(status);
        setTimeout(() => status.remove(), 3000);
      })
      .catch(error => {
        reportButton.innerHTML = '<span class="material-icons">send</span>';
        reportButton.disabled = false;
        alert('Failed to send report: ' + error);
      });
    }
  });

  reportLink.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      reportButton.click();
    }
  });

  function loadResults() {
    getCurrentTabId(function(tabId) {
      if (!tabId) return;
      currentTabId = tabId;
      chrome.storage.local.get(['scanResults_' + currentTabId], function(result) {
        if (result['scanResults_' + currentTabId]) {
          scanResults = result['scanResults_' + currentTabId];
          displayResults();
          if (statusElement) {
            statusElement.textContent = `Found ${scanResults.length} elements`;
          }
        }
      });
    });
  }

  // Tab switching logic
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentTab = button.dataset.tab;
      displayResults();
    });
  });

  // Listen for storage changes and auto-refresh scan results
  getCurrentTabId(function(tabId) {
    if (!tabId) return;
    currentTabId = tabId;
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area === 'local') {
        if (changes['scanResults_' + tabId]) {
          const elements = changes['scanResults_' + tabId].newValue || [];
          scanResults = elements;
          chrome.storage.local.set({['scanResults_' + tabId]: scanResults});
          displayResults();
          if (linkCount) {
            linkCount.textContent = `${elements.length} elements`;
          }
          if (scanStatus) {
            scanStatus.textContent = 'Scan complete!';
            scanStatus.style.backgroundColor = 'var(--success-color)';
            scanStatus.style.color = 'white';
          }
        }
        if (changes['redFlags_' + tabId]) {
          const redFlags = changes['redFlags_' + tabId].newValue || [];
          displayRedFlags(redFlags);
        }
      }
    });
  });

  const reportForm = document.querySelector('.report-form');
  if (reportForm && reportButton) {
    reportForm.addEventListener('submit', function(event) {
      event.preventDefault();
      reportButton.click();
    });
  }
});

// Move displayResults to the top level so it is always defined
function displayResults() {
  getCurrentTabId(function(tabId) {
    if (!tabId) {
      results.innerHTML = '<div class="scan-message">No active tab found.</div>';
      return;
    }
    currentTabId = tabId;
    chrome.storage.local.get(null, function(data) {
      if (chrome.runtime.lastError) {
        results.innerHTML = '<div class="scan-message">Error reading scan results.</div>';
        return;
      }
      scanResults = data['scanResults_' + currentTabId] || [];
      if (!scanResults || scanResults.length === 0) {
        results.innerHTML = `<div class="scan-message">No ${currentTab} links found on this page.</div>`;
        return;
      }
      let filteredResults = scanResults.filter(element => element.status === currentTab);
      results.innerHTML = filteredResults.length === 0
        ? `<div class="scan-message">No ${currentTab} links found on this page.</div>`
        : filteredResults.map((element, idx) => `
          <div class="element-card ${element.status} expandable" tabindex="0" aria-expanded="false" id="resultCard${idx}">
            <div class="element-card-header" style="gap:10px;">
              <span class="status-icon material-icons" style="font-size:1.1em; color:${element.status === 'safe' ? '#34a853' : element.status === 'warning' ? '#fbbc04' : '#ea4335'};">
                ${element.status === 'safe' ? 'check_circle' : element.status === 'warning' ? 'warning' : 'error'}
              </span>
              <span class="element-type" style="font-weight:500; color:#888;">Link</span>
              <a href="${element.url}" target="_blank" rel="noopener" class="element-url-link" style="color:#1a73e8; text-decoration:underline; font-size:1em; margin-left:8px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; vertical-align:middle;">${truncateUrl(element.url)}</a>
              <button class="expand-toggle" aria-label="Show details" tabindex="0" style="margin-left:auto;"><span class="material-icons">expand_more</span></button>
            </div>
            <div class="element-card-details" style="display:none;">
              ${element.url ? `<div class="element-url-full"><b>Full URL:</b> <span class="url-text">${element.url}</span> <button class="copy-url" title="Copy URL" data-url="${element.url}"><span class="material-icons">content_copy</span></button></div>` : ''}
              ${element.text ? `<div class="element-text"><b>Text:</b> ${element.text}</div>` : ''}
              ${element.path ? `<div class="element-path"><b>Path:</b> ${element.path}</div>` : ''}
              ${element.triggers && element.triggers.length > 0 ? `<div class="element-triggers"><b>Triggers:</b> ${element.triggers.join(', ')}</div>` : ''}
              ${element.reason ? `<div class="element-reason"><b>Reason:</b> ${element.reason}</div>` : ''}
            </div>
          </div>
        `).join('');
      // Add toggle event for expand/collapse
      Array.from(document.querySelectorAll('.expand-toggle')).forEach((btn, idx) => {
        btn.onclick = function() {
          const card = document.getElementById('resultCard' + idx);
          const details = card.querySelector('.element-card-details');
          const expanded = card.getAttribute('aria-expanded') === 'true';
          details.style.display = expanded ? 'none' : 'block';
          card.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          btn.querySelector('.material-icons').textContent = expanded ? 'expand_more' : 'expand_less';
        };
      });
      // Copy URL button
      Array.from(document.querySelectorAll('.copy-url')).forEach(btn => {
        btn.onclick = function(e) {
          e.stopPropagation();
          const url = btn.getAttribute('data-url');
          navigator.clipboard.writeText(url);
          btn.title = 'Copied!';
          setTimeout(() => { btn.title = 'Copy URL'; }, 1200);
        };
      });
    });
  });
}

function displayRedFlags(redFlags) {
  let container = document.getElementById('redFlags');
  if (!container) {
    container = document.createElement('div');
    container.id = 'redFlags';
    const scanSection = document.querySelector('.scan-section');
    if (scanSection && scanSection.parentNode) {
      scanSection.parentNode.insertBefore(container, scanSection.nextSibling);
    } else {
      document.body.appendChild(container);
    }
  }
  let html = `<div class="red-flags-section">
    <h3><span class="material-icons">report_gmailerrorred</span> Phishing Red Flags</h3>`;
  if (!redFlags || redFlags.length === 0) {
    html += `<div class="red-flag-summary no-flags" style="font-size:1.18em; font-weight:700; color:#1de9b6; margin-bottom:10px;">
      <span class="material-icons" style="font-size:1.3em; vertical-align:middle;">check_circle</span> No phishing red flags detected on this page.
    </div>
    <div class="red-flag-what" style="margin-top:12px;">
      <b>What we checked for:</b>
      <ul style="margin-top:6px;">
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
    html += `<div class="red-flag-what" style="margin-top:12px;">
      <b>What we checked for:</b>
      <ul style="margin-top:6px;">
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

function truncateUrl(url, maxLength = 36) {
  if (!url) return '';
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
} 