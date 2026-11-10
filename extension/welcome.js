// Onboarding page: tailors the shortcut hint and checks which summary engines are already available.

const $ = (id) => document.getElementById(id);

if (!/Mac/.test(navigator.platform)) $('openKey').textContent = 'Ctrl+O';

// Only Google Chrome has the built-in model download. Hide that option elsewhere.
const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand);
if (!brands.includes('Google Chrome') && typeof Summarizer === 'undefined') $('chromeOption').hidden = true;

async function detect() {
  const el = $('detected');
  const { llmUrl } = await chrome.storage.sync.get({ llmUrl: 'http://127.0.0.1:11434/v1' });
  try {
    const r = await fetch(llmUrl.replace(/\/+$/, '') + '/models', { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(r.status);
    const ids = ((await r.json()).data || []).map((m) => m.id).filter(Boolean);
    el.textContent = `✓ Found a model server at ${llmUrl}` + (ids.length ? ` (${ids.slice(0, 3).join(', ')}).` : '.') + ' Open the toolbar popup to choose your model.';
    el.classList.add('ok');
  } catch {
    el.textContent = "No model server found on this computer yet. Set up one of the options below, then check again by reloading this page.";
  }
}
detect();
