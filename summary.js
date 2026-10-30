// Hover a link (on search pages by default) to get a short summary of the target page.
// Shares `settings`, `siteBlocked` and `host` (the open peek) with content.js.

const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|kagi\.com|ecosia\.org|search\.yahoo\.com|startpage\.com|yandex\.[a-z]+)$/;

function onSearchPage() {
  const h = location.hostname;
  if (h === 'news.google.com') return true;
  if (!SEARCH_HOSTS.test(h)) return false;
  const p = new URLSearchParams(location.search);
  return location.pathname.includes('search') || ['q', 'p', 'query', 'text'].some((k) => p.has(k));
}

// Holding Shift while hovering summarizes a link on any site, even in "search pages only" mode.
function summariesActive(shiftHeld) {
  if (settings.summaryMode === 'off' || siteBlocked()) return false;
  return shiftHeld || settings.summaryMode === 'all' || onSearchPage();
}

// ---- card UI ---------------------------------------------------------------
// Layout follows the Figma component "Frame 1": 390px wide, min 89px tall, 7px radius,
// 89px square thumbnail on the left, bold 12px title over a 12px summary.

let card = null;
let cardParts = null;

function buildCard() {
  const el = document.createElement('div');
  el.style.cssText = 'all:initial;position:fixed;z-index:2147483646;pointer-events:none;';
  const root = el.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      /* --fill: Figma uses white at 10%; raised so black text stays readable on dark pages. */
      .card { --fill: .8; display:flex; width:390px; max-width:calc(100vw - 16px); min-height:89px;
        border-radius:7px; overflow:hidden; box-sizing:border-box;
        background:rgba(255,255,255,var(--fill)); backdrop-filter:blur(20px) saturate(1.6);
        box-shadow:0 4px 4px rgba(0,0,0,.25); color:#000;
        font:12px/normal Inter, -apple-system, system-ui, sans-serif;
        opacity:0; transition:opacity .12s ease; }
      .card.in { opacity:1; }
      .thumb { flex:none; width:89px; height:89px; border-radius:7px; object-fit:cover; align-self:flex-start; }
      .thumb[hidden] { display:none; }
      .body { flex:1; min-width:0; padding:4px 6px 6px 6px; }
      .title { font-weight:700; word-break:break-word; }
      .sum { margin-top:7px; word-break:break-word; white-space:pre-wrap;
        display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:12; overflow:hidden; }
      .sum.dim { opacity:.55; }
    </style>
    <div class="card">
      <img class="thumb" alt="" hidden referrerpolicy="no-referrer">
      <div class="body"><div class="title"></div><div class="sum"></div></div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const parts = { card: q('.card'), thumb: q('.thumb'), title: q('.title'), sum: q('.sum') };
  // A blocked or broken image just collapses the thumbnail slot.
  parts.thumb.addEventListener('error', () => { parts.thumb.hidden = true; });
  parts.thumb.addEventListener('load', () => { parts.thumb.hidden = false; positionCard(); });
  document.documentElement.appendChild(el);
  requestAnimationFrame(() => parts.card.classList.add('in'));
  return { el, parts };
}

// opts.title / opts.image update those parts; omitted ones keep their current value.
function showCard(anchor, text, opts = {}) {
  if (!card) ({ el: card, parts: cardParts } = buildCard());
  card._anchor = anchor;
  if (opts.title !== undefined) cardParts.title.textContent = opts.title;
  if (opts.image && cardParts.thumb.dataset.src !== opts.image) {
    cardParts.thumb.dataset.src = opts.image;
    cardParts.thumb.src = opts.image;
  }
  cardParts.sum.textContent = text;
  cardParts.sum.classList.toggle('dim', text.endsWith('…') && text.length < 40);
  positionCard();
}

function positionCard() {
  if (!card || !card._anchor) return;
  const r = card._anchor.getBoundingClientRect();
  const h = cardParts.card.offsetHeight;
  const below = r.bottom + 8 + h < window.innerHeight;
  card.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)) + 'px';
  card.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 398)) + 'px';
}

function hideCard() {
  if (card) card.remove();
  card = cardParts = null;
}

// ---- search-result snippet fallback ----------------------------------------
// For pages that refuse automated access, show the description the search engine already
// put on the results page. Free: no extra request, no model call.

function snippetFor(anchor) {
  const outbound = (el) => new Set(
    [...el.querySelectorAll('a[href]')]
      .map((a) => { try { const u = new URL(a.href, location.href); return u.hostname === location.hostname ? null : u.origin + u.pathname; } catch { return null; } })
      .filter(Boolean)
  ).size;

  // Climb to the largest ancestor that still holds only this one result.
  let best = null;
  for (let el = anchor.parentElement, i = 0; el && el !== document.body && i < 8; el = el.parentElement, i++) {
    if (outbound(el) > 1) break;
    best = el;
  }
  if (!best) return '';
  const title = anchor.textContent.trim();
  const lines = best.innerText
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 60 && l !== title && !l.includes('›') && !/^https?:\/\//.test(l));
  return [...new Set(lines)].join(' ').slice(0, 450).trim();
}

// ---- summarizer engines ----------------------------------------------------
// Each returns the final summary, or null if that engine is unavailable.

// Apple Intelligence, through apfel's local server (see background.js).
function summarizeWithApple(text, onText, alive) {
  return new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: 'apfel' });
    let out = '';
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; port.disconnect(); resolve(v); } };
    port.onMessage.addListener((m) => {
      if (!alive()) return finish(null);
      if (m.type === 'chunk') { out += m.text; onText(out); }
      else if (m.type === 'done') finish(out.trim() || null);
      else finish(out.trim() || null); // error: use what we have, else try the next engine
    });
    port.onDisconnect.addListener(() => finish(out.trim() || null));
    port.postMessage({ text });
  });
}

// Chrome's built-in Gemini Nano. Only used when the model is already downloaded.
let chromeSummarizer = null;
async function summarizeWithChrome(text, onText, alive) {
  try {
    if (typeof Summarizer === 'undefined' || (await Summarizer.availability()) !== 'available') return null;
    chromeSummarizer ||= Summarizer.create({
      type: 'tldr', length: 'medium', format: 'plain-text', outputLanguage: 'en',
      sharedContext: 'A web page the user is considering opening from a link.'
    });
    const s = await chromeSummarizer;
    let out = '';
    for await (const chunk of s.summarizeStreaming(text)) {
      if (!alive()) return null;
      out += chunk;
      onText(out);
    }
    return out.trim() || null;
  } catch {
    chromeSummarizer = null;
    return null;
  }
}

let warnedUnavailable = false;
const summaryCache = new Map(); // url -> { text, title, image }

// ---- hover handling --------------------------------------------------------

let hoverTimer = null;
let hoverToken = 0;
let hoverAnchor = null;

function candidateUrl(a) {
  let u;
  try { u = new URL(a.href, location.href); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.origin === location.origin && u.pathname === location.pathname && u.hash) return null;
  const isNewsArticle = u.hostname === 'news.google.com' && /\/(articles|read)\//.test(u.pathname);
  // On a search page, skip the engine's own navigation links (images, maps, pagination...).
  if (settings.summaryMode !== 'all' && onSearchPage() && u.hostname === location.hostname && !isNewsArticle) return null;
  return u.href;
}

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverToken++;
  hoverAnchor = null;
  hideCard();
}

async function summarizeLink(anchor, url, token) {
  try {
    await summarizeLinkInner(anchor, url, token);
  } catch (err) {
    console.warn('[Peek] summary failed:', err);
    if (token === hoverToken && hoverAnchor === anchor) showCard(anchor, "Couldn't summarize this page.");
  }
}

async function summarizeLinkInner(anchor, url, token) {
  const alive = () => token === hoverToken && hoverAnchor === anchor;

  const linkTitle = (anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const cached = summaryCache.get(url);
  if (cached) return showCard(anchor, cached.text, { title: cached.title || linkTitle, image: cached.image });
  showCard(anchor, 'Summarizing…', { title: linkTitle });

  // Resolve Google News redirects first, then fetch the page via the background worker.
  const target = await resolveNewsUrl(url);
  if (!alive()) return;
  if (new URL(target).hostname === 'news.google.com') {
    // Never summarize Google's own redirect page; it just describes Google News.
    const note = lastNewsError ? '\n(' + lastNewsError + ')' : '';
    return showCard(anchor, "Couldn't find the original article for this link." + note);
  }
  const page = await chrome.runtime.sendMessage({ type: 'fetch-page', url: target });
  if (!alive()) return;

  const text = page?.html ? extractText(page.html) : '';
  if (text.length < 80) {
    // Blocked or script-rendered page: fall back to the search result's own description.
    const snippet = onSearchPage() ? snippetFor(anchor) : '';
    if (snippet) return showCard(anchor, 'This site blocks automated reading. From the search result:\n' + snippet);
    return showCard(anchor, page?.html ? 'Not enough readable text to summarize.' : "Couldn't load this page to summarize.");
  }
  const meta = extractMeta(page.html, page.url || target);
  showCard(anchor, 'Summarizing…', { title: meta.title || linkTitle, image: meta.image });

  const onText = (t) => alive() && showCard(anchor, t);
  const engine = settings.summaryEngine;
  let out = null;
  if (engine !== 'chrome') out = await summarizeWithApple(text, onText, alive);
  if (!alive()) return;
  if (out == null && engine !== 'apple') out = await summarizeWithChrome(text, onText, alive);
  if (!alive()) return;

  if (out) {
    summaryCache.set(url, { text: out, title: meta.title, image: meta.image });
    return showCard(anchor, out);
  }
  if (warnedUnavailable) return hideCard();
  warnedUnavailable = true;
  showCard(anchor, 'No summary engine is available. Check the Peek toolbar popup for setup.');
}

let pointerAnchor = null; // link under the pointer, whether or not summaries are active

function startHover(a, shiftHeld) {
  if (host || hoverAnchor === a || !summariesActive(shiftHeld)) return; // `host` is set while a peek is open
  cancelHover();
  const url = candidateUrl(a);
  if (!url) return;
  hoverAnchor = a;
  const token = hoverToken;
  hoverTimer = setTimeout(() => summarizeLink(a, url, token), settings.summaryDelay);
}

document.addEventListener(
  'mouseover',
  (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    pointerAnchor = a;
    if (a) startHover(a, e.shiftKey);
  },
  true
);

document.addEventListener(
  'mouseout',
  (e) => {
    const to = e.relatedTarget;
    if (pointerAnchor && !(to instanceof Node && pointerAnchor.contains(to))) pointerAnchor = null;
    if (!hoverAnchor) return;
    if (to instanceof Node && hoverAnchor.contains(to)) return;
    cancelHover();
  },
  true
);

// Pressing Shift while already resting on a link starts a summary too.
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Shift') {
      if (!e.repeat && pointerAnchor) startHover(pointerAnchor, true);
    } else if (hoverAnchor) {
      cancelHover();
    }
  },
  { capture: true, passive: true }
);

for (const ev of ['scroll', 'mousedown']) {
  window.addEventListener(ev, () => hoverAnchor && cancelHover(), { capture: true, passive: true });
}
