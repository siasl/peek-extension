# Peek

A Chrome/Chromium extension (tested in Helium) that brings Arc-style **Peek** and **link summaries** to any browser.

- **Peek**: preview a link in an overlay without leaving the page. Works on sites that normally refuse to be framed, and keeps you logged in.
- **Hover summaries**: hover a link to get a short on-device summary with a thumbnail, like Arc's "5 second previews".
- **Never triggered by dragging.** Peek only opens from a modifier-click or the right-click menu.

## Install

Peek isn't on the Chrome Web Store, so you load it as an unpacked extension. It needs Chrome 116 or newer, or a Chromium browser based on it (Helium, Brave, Edge, Arc and others).

1. **Get the code.** Either:
   - clone it: `git clone https://github.com/siasl/peek-extension.git`, or
   - click **Code → Download ZIP** on the [GitHub page](https://github.com/siasl/peek-extension) and unzip it.

   Keep the folder somewhere permanent. The browser loads the extension from it every time it starts, so deleting or moving the folder breaks the extension.
2. Open `chrome://extensions` in your browser (Brave: `brave://extensions`, Edge: `edge://extensions`) and turn on **Developer mode**, usually a toggle in the top right.
3. Click **Load unpacked** and choose the folder that contains `manifest.json`. That's the `peek-extension` folder itself, not a folder inside it.
4. Click the puzzle-piece icon in the toolbar and pin **Peek** so its settings popup is one click away.
5. Reload any pages that were already open. The extension only affects pages loaded after it was installed.

To try it: hold **Shift** and click a link. A preview should open over the page.

**Updating:** run `git pull` (or download the ZIP again), then click the reload icon on Peek's card at `chrome://extensions`.

The manifest pins the extension ID (`jfjllmekaamcnijkmjocccgeeepbbggd`) so everyone who installs it gets the same ID, which the Apple Intelligence setup below relies on.

Hover summaries need one more step. See [Summary engines](#summary-engines).

## Using Peek

| Action | Result |
| --- | --- |
| Hold **Shift** and click a link | Opens the link in a peek overlay |
| Right-click a link, then **Peek link** | Same, no keyboard needed |
| **Cmd+O** (Ctrl+O on Windows/Linux) | Opens the peeked link in a new tab and closes the peek. If it does nothing, assign it at `chrome://extensions/shortcuts`. While the extension owns this key, it replaces your browser's "Open File" shortcut |
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

Requires a Mac with Apple Intelligence turned on (System Settings → Apple Intelligence & Siri) and [Homebrew](https://brew.sh). Run these from the `peek-extension` folder:

```bash
brew install apfel
./apfel/install-service.sh
```

The script installs a login item (a LaunchAgent named `com.peek.apfel`) that starts apfel automatically at login and keeps it running. It listens only on `http://127.0.0.1:11434`, so other computers can't reach it, and it accepts requests only from this extension. Read the script first if you like. It's short.

Open the toolbar popup afterwards. It should say "Apple Intelligence (apfel): running." If it says "not running", see [Troubleshooting](#troubleshooting).

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

## Troubleshooting

| Problem | Try this |
| --- | --- |
| Shift-click does nothing | Reload the page. Check the site isn't in "Disable on these sites". Pages like `chrome://` and the Chrome Web Store can't run extensions. |
| A site shows a login page or blank page in the peek | Some sites need their login cookies, which browsers don't send inside a frame on a different site (Instagram and X are examples). Add the site to "Open in a new tab instead of a peek" in the popup. |
| Popup says apfel is "not running" | Make sure you ran `./apfel/install-service.sh` and that `apfel` is installed (`brew install apfel`). Check `~/Library/Logs/peek-apfel.log`. |
| apfel won't start, or the port is in use | apfel uses port 11434, which is also Ollama's default. Quit Ollama or stop whatever else is using that port. |
| Popup says apfel answered with an error | The extension ID differs from the one the script allowed. Make sure `manifest.json` still contains its `key`, then run the install script again. |
| "No summary engine is available" | Set up Apple Intelligence above, or use Chrome's built-in model in Chrome 138+. |
| Summaries get cut off | See [Changing the summary style](#changing-the-summary-style). |

## Privacy

- Link summaries run on your device. The page text goes only to apfel on `127.0.0.1` or to Chrome's own built-in model. Nothing is sent to an AI service on the internet.
- To summarize a link, the extension downloads that page itself, without your cookies. This is the same request your browser would make if you visited the link.
- For Google News links, it contacts `news.google.com` to find the original article, using your normal Google session.
- Settings are stored in your browser's sync storage. The extension has no analytics, accounts or servers.

## Settings

Click the toolbar icon to open the popup:

- Peek modifier key
- Summary mode, hover delay and engine
- Apple Intelligence status and Chrome model download
- **Open in a new tab instead of a peek**: one domain per line, subdomains included. Defaults to `instagram.com` and `x.com`, which don't work well in a frame
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

## License

MIT. See [LICENSE](LICENSE).
