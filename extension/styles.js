// Summary styles, shared by the service worker, the content script and the settings popup.
// `prompt` is what a local model server is told; `chrome` is the matching setting for Chrome's
// built-in Summarizer, which takes options instead of free text.

const SUMMARY_STYLES = {
  short: {
    label: 'Short: one or two sentences',
    prompt:
      'Summarize the web page below in one or two short sentences, under 30 words. ' +
      'Plain text only, no bullet points. Do not mention "the page" or "the article".',
    chrome: { type: 'tldr', length: 'short' }
  },
  standard: {
    label: 'Standard: about 50 words',
    prompt:
      'Summarize the web page below in about 50 words. Bullet points are allowed. ' +
      'Do not mention "the page" or "the article".',
    chrome: { type: 'tldr', length: 'medium' }
  },
  detailed: {
    label: 'Detailed: about 100 words',
    prompt:
      'Summarize the web page below in about 100 words, covering the main points. Bullet points are allowed. ' +
      'Do not mention "the page" or "the article".',
    chrome: { type: 'key-points', length: 'medium' }
  }
};

const DEFAULT_SUMMARY_STYLE = 'standard';

// The instructions to send for the saved settings. A blank custom prompt falls back to the standard one.
function summaryPromptFor(style, custom) {
  if (style === 'custom' && custom && custom.trim()) return custom.trim();
  return (SUMMARY_STYLES[style] || SUMMARY_STYLES[DEFAULT_SUMMARY_STYLE]).prompt;
}
