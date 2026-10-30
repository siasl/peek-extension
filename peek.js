const target = new URL(location.href).searchParams.get('url');
const frame = document.getElementById('f');

document.getElementById('url').textContent = target;
frame.addEventListener('load', () => document.getElementById('spinner').classList.add('done'));
// sandbox has no allow-top-navigation, so framed pages can't bust out of the peek.
frame.src = target;

const close = () => parent.postMessage({ peek: 'close' }, '*');

document.getElementById('close').onclick = close;
document.getElementById('open').onclick = () => {
  chrome.tabs.create({ url: target });
  close();
};
document.getElementById('copy').onclick = async (e) => {
  await navigator.clipboard.writeText(target);
  e.target.textContent = 'Copied';
  setTimeout(() => (e.target.textContent = 'Copy'), 1200);
};
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
