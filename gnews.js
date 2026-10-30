// Resolve a Google News article link to the publisher's URL.
// Old-style IDs embed the URL (base64). Newer IDs ("AU_yqL...") need a lookup
// against Google's batchexecute endpoint using a signature scraped from the article page.

function gnewsArticleId(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.hostname !== 'news.google.com') return null;
  const m = u.pathname.match(/\/(?:rss\/)?(?:articles|read)\/([^/?]+)/);
  return m ? m[1] : null;
}

function gnewsDecodeLegacy(id) {
  try {
    const b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    let b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (b[0] === 0x08 && b[1] === 0x13 && b[2] === 0x22) b = b.slice(3);
    let len = b[0], start = 1;
    if (len >= 0x80) { len = (b[0] & 0x7f) | (b[1] << 7); start = 2; }
    const s = new TextDecoder().decode(b.slice(start, start + len));
    if (/^https?:\/\//.test(s)) return s;
  } catch {}
  return null; // "AU_yqL..." style, needs the network path
}

async function gnewsDecodeRemote(id) {
  let sg, ts;
  for (const path of [`articles/${id}`, `rss/articles/${id}`]) {
    const html = await (await fetch(`https://news.google.com/${path}`, { credentials: 'include' })).text();
    sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (sg && ts) break;
  }
  if (!sg || !ts) throw new Error('no page signature');

  const inner = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id, Number(ts), sg
  ]);
  const freq = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const post = async (extra = '') => {
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: freq + extra
    });
    return { res, text: await res.text() };
  };

  let { res, text } = await post();
  // Signed-in requests are XSRF-checked: Google rejects with 400 and hands back a fresh token.
  const xsrf = res.status === 400 && text.match(/"xsrf","([^"]+)"/)?.[1];
  if (xsrf) ({ res, text } = await post('&at=' + encodeURIComponent(xsrf)));

  let url;
  try { url = JSON.parse(JSON.parse(text.split('\n\n')[1])[0][2])[1]; }
  catch { throw new Error('unexpected response (HTTP ' + res.status + '): ' + text.slice(0, 80).replace(/\s+/g, ' ')); }
  if (!/^https?:\/\//.test(url)) throw new Error('response had no URL');
  return url;
}

// Returns { url, error }: the publisher URL, or the original URL plus why it couldn't be resolved.
async function resolveGoogleNewsDetailed(url) {
  const id = gnewsArticleId(url);
  if (!id) return { url };
  try {
    return { url: gnewsDecodeLegacy(id) || (await gnewsDecodeRemote(id)) };
  } catch (err) {
    console.warn('[Peek] Google News resolve failed:', err);
    return { url, error: String(err && err.message || err) };
  }
}

// Returns the publisher URL, or the original URL if anything fails.
async function resolveGoogleNews(url) {
  return (await resolveGoogleNewsDetailed(url)).url;
}

if (typeof module !== 'undefined') module.exports = { resolveGoogleNews, resolveGoogleNewsDetailed, gnewsArticleId };
