document.addEventListener('DOMContentLoaded', function() {
  const scanButton = document.getElementById('scanButton');
  const reportButton = document.getElementById('reportButton');
  const reportLink = document.getElementById('reportLink');
  const scanStatus = document.getElementById('scanStatus');
  const results = document.getElementById('results');
  const tips = document.getElementById('tips');
  const linkCount = document.getElementById('linkCount');

  // Load tips
  loadTips();

  // Load scan results and red flags from storage for this tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tabId = tabs[0].id;
    chrome.storage.local.get(['scanResults_' + tabId, 'redFlags_' + tabId], function(data) {
      const links = data['scanResults_' + tabId] || [];
      const redFlags = data['redFlags_' + tabId] || [];
      displayRedFlags(redFlags);
      displayResults(links);
      linkCount.textContent = `${links.length} links`;
    });
  });

  // Listen for storage changes and auto-refresh scan results
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const tabId = tabs[0].id;
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area === 'local' && changes['scanResults_' + tabId]) {
        const links = changes['scanResults_' + tabId].newValue || [];
        displayResults(links);
        linkCount.textContent = `${links.length} links`;
        scanStatus.textContent = 'Scan complete!';
        scanStatus.style.backgroundColor = 'var(--success-color)';
        scanStatus.style.color = 'white';
      }
    });
  });

  // Scan button click handler (manual scan)
  scanButton.addEventListener('click', function() {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="material-icons rotating">sync</span> Scanning...';
    scanStatus.textContent = 'Scanning page for suspicious links...';
    scanStatus.style.backgroundColor = 'var(--surface-color)';
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "scanLinks"}, function(response) {
        if (chrome.runtime.lastError) {
          scanStatus.textContent = 'Error: Could not scan page. Please refresh and try again.';
          scanStatus.style.backgroundColor = 'var(--error-color)';
          scanStatus.style.color = 'white';
        } else if (response && response.links) {
          displayResults(response.links);
          linkCount.textContent = `${response.links.length} links`;
          scanStatus.textContent = 'Scan complete!';
          scanStatus.style.backgroundColor = 'var(--success-color)';
          scanStatus.style.color = 'white';
          // Save results for background sync
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            chrome.storage.local.set({['scanResults_' + tabId]: response.links});
          });
        }
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="material-icons">security</span> Scan This Page';
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
});

function displayResults(links) {
  const results = document.getElementById('results');
  if (links.length === 0) {
    results.innerHTML = `
      <div class="empty-state">
        <span class="material-icons">search</span>
        <p>No links found on this page</p>
      </div>
    `;
    return;
  }
  let html = '<ul class="link-list">';
  links.forEach(link => {
    const status = getStatusInfo(link.status);
    const urlDisplay = link.url ? `<div class="link-url-full"><a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.url}</a> <button class="copy-url" data-url="${link.url}" title="Copy URL"><span class="material-icons">content_copy</span></button></div>` : '';
    const domain = link.url ? (new URL(link.url)).hostname : '';
    const badges = getLinkBadges(link.url, link.elementType);
    const reason = link.reason ? `<div class="link-reason">${link.reason}</div>` : '';
    const invalidClass = link.status === 'invalid' ? 'link-invalid-deemph' : '';
    const invalidTooltip = link.status === 'invalid' && link.reason ? `title="${link.reason}"` : '';
    html += `
      <li class="link-item ${status.class} ${invalidClass}" ${invalidTooltip}>
        <span class="material-icons">${status.icon}</span>
        <div class="link-info">
          <div class="link-text">${getLinkTitle(link)}</div>
          ${urlDisplay}
          <div class="link-meta">${badges.join(' ')}${domain ? `<span class='meta-domain'>${domain}</span>` : ''}</div>
          ${reason}
          <div class="link-status">${status.text}</div>
        </div>
      </li>
    `;
  });
  html += '</ul>';
  results.innerHTML = html;
  // Add copy event listeners
  document.querySelectorAll('.copy-url').forEach(btn => {
    btn.addEventListener('click', function() {
      const url = this.getAttribute('data-url');
      navigator.clipboard.writeText(url);
      this.title = 'Copied!';
      setTimeout(() => { this.title = 'Copy URL'; }, 1000);
    });
  });
}

function getStatusInfo(status) {
  const statuses = {
    safe: { class: 'link-safe', icon: 'check_circle', text: 'Safe' },
    warning: { class: 'link-warning', icon: 'warning', text: 'Suspicious' },
    danger: { class: 'link-danger', icon: 'dangerous', text: 'Dangerous' },
    broken: { class: 'link-broken', icon: 'link_off', text: 'Broken Link' },
    invalid: { class: 'link-invalid', icon: 'error', text: 'Invalid Link' }
  };
  return statuses[status] || statuses.warning;
}

function truncateUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname.substring(0, 20) + (urlObj.pathname.length > 20 ? '...' : '');
  } catch {
    return url.substring(0, 40) + (url.length > 40 ? '...' : '');
  }
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

function getLinkBadges(url, elementType) {
  const badges = [];
  try {
    if (elementType === 'button') {
      badges.push(`<span class='badge badge-button' title='This is a clickable button. Buttons may submit forms, open dialogs, or trigger actions.'><span class='material-icons'>smart_button</span> Button</span>`);
    } else if (elementType === 'link') {
      badges.push(`<span class='badge badge-link' title='This is a hyperlink. Links usually open a new page or site.'><span class='material-icons'>link</span> Link</span>`);
    }
    if (!url) return badges;
    const u = new URL(url);
    if (u.protocol === 'mailto:') badges.push(`<span class='badge badge-mail' title='This will open your email client.'><span class='material-icons'>email</span> Mail</span>`);
    if (u.protocol === 'tel:') badges.push(`<span class='badge badge-tel' title='This will initiate a phone call.'><span class='material-icons'>call</span> Phone</span>`);
    if (u.hostname !== window.location.hostname) badges.push(`<span class='badge badge-external' title='This link goes to an external website.'><span class='material-icons'>open_in_new</span> External</span>`);
    if (u.hostname === window.location.hostname) badges.push(`<span class='badge badge-internal' title='This link stays within this website.'><span class='material-icons'>home</span> Internal</span>`);
    if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(u.pathname)) badges.push(`<span class='badge badge-download' title='This link downloads a file.'><span class='material-icons'>download</span> Download</span>`);
    if (/track|utm_|click|redirect/i.test(url)) badges.push(`<span class='badge badge-tracking' title='This link may be tracked for analytics or marketing.'><span class='material-icons'>track_changes</span> Tracking</span>`);
  } catch {}
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
      if (flag.type === 'emotional') {
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