const mod = document.getElementById('modifier');
const blocked = document.getElementById('blocked');

const sumMode = document.getElementById('summaryMode');
const sumDelay = document.getElementById('summaryDelay');
const engineSel = document.getElementById('summaryEngine');
const preset = document.getElementById('preset');
const llmUrl = document.getElementById('llmUrl');
const llmModel = document.getElementById('llmModel');
const modelList = document.getElementById('models');
const serverStatus = document.getElementById('serverStatus');
const serverBlock = document.getElementById('serverBlock');
const enableBtn = document.getElementById('enable');
const status = document.getElementById('status');

const newTabSites = document.getElementById('newTabSites');
const parseSites = (text) => text
  .split('\n')
  .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  .filter(Boolean);
newTabSites.addEventListener('input', () => chrome.storage.sync.set({ newTabSites: parseSites(newTabSites.value) }));

const PRESETS = {
  apple: { url: 'http://127.0.0.1:11434/v1', model: 'apple-foundationmodel' },
  ollama: { url: 'http://127.0.0.1:11434/v1', model: '' },
  lmstudio: { url: 'http://127.0.0.1:1234/v1', model: '' }
};

chrome.storage.sync.get({
  modifier: 'shift', blocked: [], summaryMode: 'search', summaryDelay: 700, summaryEngine: 'auto',
  newTabSites: ['instagram.com', 'x.com'], llmUrl: PRESETS.apple.url, llmModel: PRESETS.apple.model
}).then((s) => {
  newTabSites.value = s.newTabSites.join('\n');
  engineSel.value = s.summaryEngine === 'apple' ? 'server' : s.summaryEngine; // 'apple' = old name
  showEngineSettings();
  llmUrl.value = s.llmUrl;
  llmModel.value = s.llmModel;
  preset.value = guessPreset();
  refreshServer();
  sumMode.value = s.summaryMode;
  sumDelay.value = String(s.summaryDelay);
  mod.value = s.modifier;
  blocked.value = s.blocked.join('\n');
});

mod.addEventListener('change', () => chrome.storage.sync.set({ modifier: mod.value }));
blocked.addEventListener('input', () => {
  const list = blocked.value
    .split('\n')
    .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  chrome.storage.sync.set({ blocked: list });
});

sumMode.addEventListener('change', () => chrome.storage.sync.set({ summaryMode: sumMode.value }));
sumDelay.addEventListener('change', () => chrome.storage.sync.set({ summaryDelay: Number(sumDelay.value) }));

// Which browser is this? Only Google Chrome ships the built-in model download. Other Chromium
// browsers (Helium, Brave, Edge, Arc...) usually lack the Summarizer API, so point them at a local server.
const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand);
const isChrome = brands.includes('Google Chrome');
const browserName = brands.find((b) => !/^Chromium$|Not.?A.?Brand/i.test(b)) || 'this browser';

async function refreshStatus() {
  if (typeof Summarizer === 'undefined') {
    const chromeOption = engineSel.querySelector('option[value="chrome"]');
    if (!isChrome) {
      // Nothing to enable here, so hide Chrome's setup and say what to use instead.
      enableBtn.hidden = true;
      status.textContent = '';
      document.getElementById('chromeNote').textContent =
        `Chrome's built-in model isn't available in ${browserName}. Use a local server above (Apple Intelligence, Ollama or LM Studio).`;
      chromeOption.disabled = true;
      chromeOption.textContent += ' (not available in this browser)';
    } else {
      status.textContent = "This Chrome doesn't support the Summarizer API (needs Chrome 138+).";
      enableBtn.disabled = true;
    }
    return;
  }
  const a = await Summarizer.availability();
  status.textContent = { available: 'Ready.', downloadable: 'Model not downloaded yet.', downloading: 'Downloading…', unavailable: "Not supported on this device." }[a] || a;
  enableBtn.disabled = a === 'available' || a === 'unavailable';
}

enableBtn.addEventListener('click', async () => {
  enableBtn.disabled = true;
  try {
    await Summarizer.create({
      type: 'tldr', length: 'medium', format: 'plain-text', outputLanguage: 'en',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          status.textContent = `Downloading… ${Math.round(e.loaded * 100)}%`;
        });
      }
    });
  } catch (err) {
    status.textContent = 'Failed: ' + err.message;
    return;
  }
  refreshStatus();
});

refreshStatus();

// The local server settings only matter when the server can be used.
function showEngineSettings() {
  serverBlock.hidden = engineSel.value === 'chrome';
}

engineSel.addEventListener('change', () => {
  chrome.storage.sync.set({ summaryEngine: engineSel.value });
  showEngineSettings();
});

// ---- local server settings ----------------------------------------------------

// Accept "192.168.1.5:11434", "localhost:1234/v1" and so on; always end up at an http(s) URL ending in /v1.
function normalizeUrl(raw) {
  let u = raw.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  try {
    const url = new URL(u);
    const path = url.pathname.replace(/\/+$/, '');
    return url.origin + (path && path !== '/' ? path : '/v1');
  } catch {
    return '';
  }
}

function guessPreset() {
  if (llmUrl.value === PRESETS.apple.url && llmModel.value === PRESETS.apple.model) return 'apple';
  if (llmUrl.value === PRESETS.lmstudio.url) return 'lmstudio';
  if (llmUrl.value === PRESETS.ollama.url) return 'ollama';
  return 'custom';
}

const isLocal = (url) => /^(localhost|127\.|\[::1\])/i.test(new URL(url).hostname);

let statusTimer;
function refreshServer() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(checkServer, 400);
}

async function checkServer() {
  const base = normalizeUrl(llmUrl.value);
  if (!base) { serverStatus.textContent = 'Enter the server address.'; return; }
  serverStatus.textContent = 'Checking…';
  try {
    const r = await fetch(base + '/models', { signal: AbortSignal.timeout(2500) });
    if (!r.ok) {
      serverStatus.textContent = r.status === 403
        ? `Server refused the request (403). Ollama: set OLLAMA_ORIGINS=chrome-extension://* and restart it. apfel: allow chrome-extension://${chrome.runtime.id}. LM Studio: turn on "Enable CORS".`
        : `Server answered ${r.status}. Check the address ends in /v1.`;
      return;
    }
    const ids = ((await r.json()).data || []).map((m) => m.id).filter(Boolean);
    modelList.replaceChildren(...ids.map((id) => Object.assign(document.createElement('option'), { value: id })));
    const model = llmModel.value.trim();
    let msg = !model ? `Connected. Choose a model (${ids.length} available).`
      : ids.length && !ids.includes(model) ? `Connected, but the server has no model named "${model}".`
      : 'Connected.';
    if (!isLocal(base)) msg += ' This server is not on this computer: page text from summarized links is sent to it.';
    serverStatus.textContent = msg;
  } catch {
    serverStatus.textContent = `Can't reach ${base}. Is the server running?` + (preset.value === 'apple' ? ' Install with "brew install apfel" and run the setup script.' : '');
  }
}

preset.addEventListener('change', () => {
  const p = PRESETS[preset.value];
  if (!p) return;
  llmUrl.value = p.url;
  llmModel.value = p.model;
  saveServer();
});

function saveServer() {
  const url = normalizeUrl(llmUrl.value);
  if (url) chrome.storage.sync.set({ llmUrl: url, llmModel: llmModel.value.trim() });
  refreshServer();
}
llmUrl.addEventListener('input', () => { preset.value = guessPreset(); saveServer(); });
llmUrl.addEventListener('change', () => { const u = normalizeUrl(llmUrl.value); if (u) llmUrl.value = u; });
llmModel.addEventListener('input', () => { preset.value = guessPreset(); saveServer(); });


