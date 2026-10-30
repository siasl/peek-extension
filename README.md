# Peek

A Chrome/Chromium extension (tested in Helium) that brings Arc-style **Peek** and **link summaries** to any browser.

- **Peek**: preview a link in an overlay without leaving the page. Works on sites that normally refuse to be framed, and keeps you logged in.
- **Hover summaries**: hover a link to get a short on-device summary with a thumbnail, like Arc's "5 second previews".
- **Never triggered by dragging.** Peek only opens from a modifier-click or the right-click menu.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Pin the extension if you want quick access to its settings popup.

The manifest pins the extension ID (`jfjllmekaamcnijkmjocccgeeepbbggd`) so the Apple Intelligence setup below keeps working across reloads.

## Using Peek

| Action | Result |
| --- | --- |
| Hold **Shift** and click a link | Opens the link in a peek overlay |
| Right-click a link, then **Peek link** | Same, no keyboard needed |
| **Esc** or click outside | Closes the peek |
| Toolbar buttons in the peek | Close, copy link, open in a new tab |

Details:

- The key is configurable in the popup: Shift, Option/Alt, Control, or Command/Windows.
- The page behind the peek is scroll-locked, so scrolling inside it never moves the page underneath.
- Peek strips `X-Frame-Options` and CSP headers from the frame **only in the tab that has a peek open**, and only while it is open.
- The peek loads directly in the page, so cookies are sent as first-party and your logins (Reddit, etc.) carry over.
- On **Google News**, links open the real article instead of the Google News redirect page.

## Hover summaries

Hover a link for a moment and a card appears with the page's thumbnail, title and a short summary.

### When summaries appear

Set this in the toolbar popup:

| Mode | Behavior |
| --- | --- |
| **On search pages only** (default) | Google, Bing, DuckDuckGo, Brave, Kagi, Ecosia, Yahoo, Startpage, Yandex and Google News |
| **On all sites** | Every link, on every site |
| **Off** | No summaries |

On any site, **hold Shift while hovering** a link to summarize it, even in "search pages only" mode. Pressing Shift while already resting on a link works too. Scrolling, clicking or pressing another key dismisses the card.

The hover delay can be set to 0.4s, 0.7s (default) or 1.2s.

### Summary engines

Pick the engine in the popup:

| Engine | What it is |
| --- | --- |
| **Auto** (default) | Apple Intelligence first, then Chrome's built-in model if available |
| **Apple Intelligence only** | Uses the on-device Apple model through [apfel](https://apfel.franzai.com) |
| **Chrome on-device only** | Uses Chrome's Gemini Nano through the Summarizer API |

Everything runs on your device. Page text is sent only to a server on `127.0.0.1` (apfel) or to Chrome's built-in model.

#### Apple Intelligence setup (macOS)

Requires a Mac with Apple Intelligence enabled and [Homebrew](https://brew.sh).

```bash
brew install apfel
./apfel/install-service.sh
```

The script installs a LaunchAgent (`com.peek.apfel`) that runs apfel at login on `http://127.0.0.1:11434`, allowing only this extension's origin. The popup shows whether apfel is running.

To remove it:

```bash
launchctl bootout gui/$(id -u)/com.peek.apfel && rm ~/Library/LaunchAgents/com.peek.apfel.plist
```

#### Chrome on-device setup

This works in Chrome 138+, not Helium or other Chromium builds that cannot download Gemini Nano. Open the popup and click **Enable summaries** to download the model once. Peek only uses Chrome's model if it is already downloaded.

### Changing the summary style

The prompt lives in `background.js` as `SUMMARY_PROMPT`. Page text is trimmed to 6,000 characters and the answer is capped at 250 tokens (`max_tokens` in `streamApfel`), so raise those if summaries get cut off. Apple's model has a 4,096-token context window, so keep input modest.

### What the card shows when a page can't be read

- Some sites block automated fetches (bot protection, paywalls). Peek never tries to evade this.
- On search pages, it falls back to the snippet the search engine already shows for that result.
- Otherwise the card says it couldn't load the page.
- Summaries are fetched without your cookies, so hovering never touches your logged-in sessions.

## Settings

Click the toolbar icon to open the popup:

- Peek modifier key
- Summary mode, hover delay and engine
- Apple Intelligence status and Chrome model download
- **Disable on these sites**: one domain per line, subdomains included

Settings sync through `chrome.storage.sync`.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `background.js` | Header stripping, page fetching, apfel streaming, context menu |
| `content.js` | Click handling and the peek overlay |
| `summary.js` | Hover handling and the summary card |
| `extract.js` | Pulls readable text, title and image from fetched HTML |
| `gnews.js` | Resolves Google News links to the original article |
| `peek.html`, `peek.js` | Fallback frame used when a page's CSP blocks direct framing |
| `options.html`, `options.js` | Toolbar popup |
| `apfel/install-service.sh` | Optional LaunchAgent for Apple Intelligence |

## Permissions

- `declarativeNetRequest`: strips framing headers in the tab with an open peek
- `contextMenus`: the "Peek link" menu item
- `storage`: your settings
- `<all_urls>`: lets peek work on any site and lets the extension fetch pages for summaries
