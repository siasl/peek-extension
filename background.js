importScripts('gnews.js');

// While a peek is open in a tab, strip the headers that forbid framing
// (X-Frame-Options, CSP frame-ancestors) from sub-frame responses in that tab only.
// The rule is a session rule scoped to the tab and removed when the peek closes.

const ruleIdFor = (tabId) => tabId + 1;

async function enableFraming(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleIdFor(tabId)],
    addRules: [
      {
        id: ruleIdFor(tabId),
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
            { header: 'content-security-policy-report-only', operation: 'remove' }
          ]
        },
        condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] }
      }
    ]
  });
}

async function disableFraming(tabId) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleIdFor(tabId)] });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  if (msg.type === 'peek-open') {
    enableFraming(tabId).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg.type === 'peek-close') {
    disableFraming(tabId);
  }
  if (msg.type === 'resolve-url') {
    resolveGoogleNewsDetailed(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === 'fetch-page') {
    fetchPage(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === 'open-tab') {
    chrome.tabs.create({ url: msg.url, index: sender.tab.index + 1 });
  }
});

// Page navigated or tab closed without an explicit close message.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') disableFraming(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => disableFraming(tabId));

// Right-click a link -> "Peek link"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'peek-link',
    title: 'Peek link',
    contexts: ['link']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'peek-link' && tab?.id != null && info.linkUrl) {
    chrome.tabs.sendMessage(tab.id, { type: 'peek', url: info.linkUrl });
  }
});

// Fetch a page's HTML for summarizing (no cookies, so hovering never touches your sessions).
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: ctrl.signal });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
    return { html: (await res.text()).slice(0, 800000), url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Apple Intelligence via apfel (brew install apfel) ----------------------
// Streams a summary from apfel's local OpenAI-compatible server to a content script.

const APFEL_URL = 'http://127.0.0.1:11434/v1/chat/completions';
const SUMMARY_PROMPT =
  'Summarize the web page below in about 50 words. Bullet Points are allowed.' +
  'Do not mention "the page" or "the article".';

async function streamApfel(text, port, signal) {
  const res = await fetch(APFEL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: 'apple-foundationmodel',
      stream: true,
      temperature: 0.3,
      max_tokens: 250,
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: text.slice(0, 6000) }
      ]
    })
  });
  if (!res.ok) throw new Error('apfel HTTP ' + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return port.postMessage({ type: 'done' });
      const delta = JSON.parse(data).choices?.[0]?.delta?.content;
      if (delta) port.postMessage({ type: 'chunk', text: delta });
    }
  }
  port.postMessage({ type: 'done' });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'apfel') return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async ({ text }) => {
    try {
      await streamApfel(text, port, AbortSignal.any([ctrl.signal, AbortSignal.timeout(20000)]));
    } catch (err) {
      try { port.postMessage({ type: 'error', error: String(err) }); } catch {}
    }
  });
});
