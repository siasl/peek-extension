const mod = document.getElementById('modifier');
const blocked = document.getElementById('blocked');

const sumMode = document.getElementById('summaryMode');
const sumDelay = document.getElementById('summaryDelay');
const engineSel = document.getElementById('summaryEngine');
const appleStatus = document.getElementById('appleStatus');
const enableBtn = document.getElementById('enable');
const status = document.getElementById('status');

chrome.storage.sync.get({ modifier: 'shift', blocked: [], summaryMode: 'search', summaryDelay: 700, summaryEngine: 'auto' }).then((s) => {
  engineSel.value = s.summaryEngine;
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

async function refreshStatus() {
  if (typeof Summarizer === 'undefined') {
    status.textContent = "This Chrome doesn't support the Summarizer API (needs Chrome 138+).";
    enableBtn.disabled = true;
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

engineSel.addEventListener('change', () => chrome.storage.sync.set({ summaryEngine: engineSel.value }));

async function refreshApple() {
  try {
    const r = await fetch('http://127.0.0.1:11434/health', { signal: AbortSignal.timeout(1500) });
    appleStatus.textContent = r.ok
      ? 'Apple Intelligence (apfel): running.'
      : `Apple Intelligence (apfel): server answered ${r.status}. Run it with --allowed-origins chrome-extension://${chrome.runtime.id}`;
  } catch {
    appleStatus.textContent = 'Apple Intelligence (apfel): not running. Install with "brew install apfel" and run the setup script.';
  }
}
refreshApple();


