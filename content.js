// Opens a peek when a link is clicked with the chosen modifier key held, or
// when the "Peek link" context-menu item is used. There is deliberately no
// drag handling anywhere in this extension.

const DEFAULTS = { modifier: 'shift', blocked: [], summaryMode: 'search', summaryDelay: 700, summaryEngine: 'auto' };
let settings = { ...DEFAULTS };

chrome.storage.sync.get(DEFAULTS).then((s) => { settings = { ...DEFAULTS, ...s }; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const k in changes) settings[k] = changes[k].newValue;
});

function siteBlocked() {
  const host = location.hostname;
  return (settings.blocked || []).some((b) => b && (host === b || host.endsWith('.' + b)));
}

function modifierMatches(e) {
  const want = settings.modifier;
  return (
    e.shiftKey === (want === 'shift') &&
    e.altKey === (want === 'alt') &&
    e.ctrlKey === (want === 'ctrl') &&
    e.metaKey === (want === 'meta')
  );
}

window.addEventListener(
  'click',
  (e) => {
    if (e.button !== 0 || !e.isTrusted || siteBlocked() || !modifierMatches(e)) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openPeek(url.href);
  },
  true
);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'peek' && msg.url) openPeek(msg.url);
});

// Google News links redirect with JavaScript, so find the publisher's URL first. On news.google.com
// itself, resolve in the page (same-origin, like a normal visit); elsewhere ask the background worker.
const resolvedNews = new Map();
let lastNewsError = '';
async function resolveNewsUrl(url) {
  lastNewsError = '';
  if (new URL(url).hostname !== 'news.google.com') return url;
  if (resolvedNews.has(url)) return resolvedNews.get(url);
  let r;
  try {
    r = location.hostname === 'news.google.com'
      ? await resolveGoogleNewsDetailed(url)
      : await chrome.runtime.sendMessage({ type: 'resolve-url', url });
  } catch (err) {
    r = { url, error: String(err && err.message || err) };
  }
  lastNewsError = r.error || '';
  if (new URL(r.url).hostname !== 'news.google.com') resolvedNews.set(url, r.url);
  return r.url;
}

let host = null;
let cspListener = null;
let savedScroll = null;

// Freeze the page behind the peek so scroll chaining can't move it.
function lockPageScroll() {
  const de = document.documentElement, body = document.body;
  const gutter = window.innerWidth - de.clientWidth;
  savedScroll = {
    deOverflow: de.style.overflow, deRight: de.style.paddingRight,
    bodyOverflow: body && body.style.overflow
  };
  de.style.overflow = 'hidden';
  if (body) body.style.overflow = 'hidden';
  if (gutter > 0) de.style.paddingRight = gutter + 'px'; // avoid layout shift
}

function unlockPageScroll() {
  if (!savedScroll) return;
  const de = document.documentElement, body = document.body;
  de.style.overflow = savedScroll.deOverflow;
  de.style.paddingRight = savedScroll.deRight;
  if (body) body.style.overflow = savedScroll.bodyOverflow;
  savedScroll = null;
}

async function openPeek(url) {
  closePeek();
  // Google News links are redirect pages; peek the publisher's article instead.
  try { url = await resolveNewsUrl(url); } catch {}
  await chrome.runtime.sendMessage({ type: 'peek-open' });

  host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      * { box-sizing:border-box; }
      .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.45);
        backdrop-filter:blur(2px); opacity:0; transition:opacity .18s ease; }
      .panel { position:fixed; top:4vh; left:50%; width:min(1200px,88vw); height:92vh;
        display:flex; flex-direction:column; overflow:hidden; border-radius:14px; background:#fff;
        box-shadow:0 20px 70px rgba(0,0,0,.5); color:#222;
        font:13px -apple-system, system-ui, sans-serif;
        transform:translateX(-50%) scale(.96); opacity:0;
        transition:transform .18s ease, opacity .18s ease; }
      .backdrop.in { opacity:1; }
      .panel.in { transform:translateX(-50%) scale(1); opacity:1; }
      .bar { display:flex; align-items:center; gap:6px; padding:8px 10px; background:#f4f4f5;
        border-bottom:1px solid #ddd; }
      .url { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.7; }
      button { border:0; background:transparent; font:inherit; color:inherit; cursor:pointer;
        padding:5px 9px; border-radius:6px; }
      button:hover { background:rgba(0,0,0,.08); }
      .body { flex:1; position:relative; }
      iframe { position:absolute; inset:0; width:100%; height:100%; border:0; background:#fff; }
    </style>
    <div class="backdrop"></div>
    <div class="panel">
      <div class="bar">
        <button class="close" title="Close (Esc)">✕</button>
        <span class="url"></span>
        <button class="copy">Copy</button>
        <button class="open">Open in tab ↗</button>
      </div>
      <div class="body"></div>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  $('.url').textContent = url;
  $('.backdrop').addEventListener('click', closePeek);
  $('.close').addEventListener('click', closePeek);
  $('.open').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-tab', url });
    closePeek();
  });
  $('.copy').addEventListener('click', async (e) => {
    await navigator.clipboard.writeText(url);
    e.target.textContent = 'Copied';
    setTimeout(() => (e.target.textContent = 'Copy'), 1200);
  });

  // Preferred: iframe directly in this page. It is same-site with the page you
  // are on, so cookies (e.g. a reddit.com login) are sent as in a normal tab.
  // sandbox has no allow-top-navigation, so framed pages cannot bust out.
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
  frame.src = url;
  $('.body').append(frame);

  // Fallback: if this page's CSP (frame-src/child-src) blocks the iframe, swap in
  // the extension page, which is exempt from page CSP (but cross-site for cookies).
  cspListener = (e) => {
    if (!/^(frame-src|child-src)/.test(e.violatedDirective)) return;
    if (e.blockedURI !== url && !url.startsWith(e.blockedURI)) return;
    $('.bar').style.display = 'none';
    frame.remove();
    const fb = document.createElement('iframe');
    fb.allow = 'clipboard-write; fullscreen';
    fb.src = chrome.runtime.getURL('peek.html') + '?url=' + encodeURIComponent(url);
    host._frame = fb;
    $('.body').append(fb);
  };
  document.addEventListener('securitypolicyviolation', cspListener);

  lockPageScroll();
  host.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  host.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  (document.documentElement || document).appendChild(host);
  host._frame = frame;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.backdrop, .panel').forEach((n) => n.classList.add('in'));
  }));

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey, true);
}

function onMessage(e) {
  if (!host || e.source !== host._frame.contentWindow) return;
  if (e.data && e.data.peek === 'close') closePeek();
}

function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closePeek();
  }
}

function closePeek() {
  if (!host) return;
  host.remove();
  host = null;
  unlockPageScroll();
  document.removeEventListener('securitypolicyviolation', cspListener);
  window.removeEventListener('message', onMessage);
  window.removeEventListener('keydown', onKey, true);
  chrome.runtime.sendMessage({ type: 'peek-close' });
}
