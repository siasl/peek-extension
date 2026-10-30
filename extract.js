// Shared by summary.js (top frame) and frame-reader.js (hidden summary frame).


function extractText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: scripts don't run
  const meta = doc.querySelector('meta[property="og:description"], meta[name="description"]')?.content || '';
  doc.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,svg,iframe').forEach((n) => n.remove());
  const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
  if (!root) return meta;
  const paras = [...root.querySelectorAll('p')].map((p) => p.textContent.trim()).filter((t) => t.length > 60);
  let text = paras.join('\n');
  if (text.length < 200) text = (meta + '\n' + root.textContent.replace(/\s+/g, ' ')).trim();
  return (doc.title ? doc.title + '\n\n' : '') + text.slice(0, 5000);
}


// Title and preview image for the summary card (Open Graph first).
function extractMeta(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = (sel) => doc.querySelector(sel)?.content?.trim() || '';
  const title = meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || doc.title.trim();
  const img = meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]');
  let image = '';
  try { image = img ? new URL(img, baseUrl).href : ''; } catch {}
  return { title, image: /^https?:/.test(image) ? image : '' };
}
