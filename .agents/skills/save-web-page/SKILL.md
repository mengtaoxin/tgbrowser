---
name: save-web-page
description: >-
  Saves a web page as a single self-contained HTML file (inlined CSS, base64
  images and fonts) using the browser environment so JavaScript can finish
  rendering, via a bundled injectable script. Use when the user asks to save,
  archive, snapshot, or offline a URL/page as one HTML file, or mentions
  save-web-page / single-file HTML.
license: MIT
metadata:
  author: mengtaoxin
  version: "1.3.0"
---

# Save web page

Capture a live page into **one** offline-capable HTML file via the browser
(not curl/wget). Use the available browser tools (e.g. `cursor-ide-browser`:
navigate, lock, snapshot, CDP `Runtime.evaluate`) and the bundled scripts.

## Parameters

| Parameter | Required | Default |
| --- | --- | --- |
| URL | Yes | — |
| Save path | No | User’s current working directory |

- Directory given → write `<suggestedFilename>` (from the script) there.
- `.html` / `.htm` path given → use it as the output file.
- Resolve relative paths against the current working directory.
- Never overwrite an existing file without asking.

## Bundled scripts

| Script | Role |
| --- | --- |
| [scripts/inline-page.js](scripts/inline-page.js) | **Inject** into the page. Waits for JS/lazy content, then builds one HTML string: CSS inlined, images/fonts/icons as base64 `data:` URIs, same-origin iframes as `srcdoc`, open shadow roots as declarative shadow DOM, external SVG `<use>` sprites inlined, canvas → image, form state kept, scripts and `on*` handlers stripped. |
| [scripts/write-result.mjs](scripts/write-result.mjs) | **Run** with Node. Extracts the HTML from a saved CDP response JSON and writes the `.html` file. |
| [scripts/inline-remote-assets.mjs](scripts/inline-remote-assets.mjs) | **Run** with Node 18+ on the saved file. Downloads images (and CSS images/fonts) still referenced by remote URL — typically CORS-blocked ones — and inlines them as base64, including inside `srcdoc`. Retries transient errors; safe to re-run. |

## Workflow

```
Save web page:
- [ ] 1. Resolve URL and output path
- [ ] 2. Open URL in the browser
- [ ] 3. Handle login / captcha / blockers (user if needed)
- [ ] 4. Inject inline-page.js and review the summary
- [ ] 5. Write the file with write-result.mjs
- [ ] 6. Inline leftover remote images with inline-remote-assets.mjs
- [ ] 7. Report path, size, and leftovers
```

### 1–2. Resolve inputs and open the page

1. Require a full `http(s)://` URL; ask if missing.
2. Prefer browser tools over any CLI HTTP client. Order: list tabs →
   navigate → lock → work → unlock and close tabs you opened when done.

### 3. User intervention

Stop and ask the user to act in the browser tab when you hit login / SSO /
2FA, CAPTCHA or bot checks, consent or paywalls needing a human, or passkeys.
Continue only after they confirm. Never try to bypass security checks.

Before capture, dismiss cookie banners, newsletter popups, and open tooltips
(click their close / accept button) — otherwise they are frozen into the file.

### 4. Inject the capture script

1. Read `scripts/inline-page.js` and pass its **full contents** as the
   expression:
   `Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })`.
2. Optional options (set first, in a separate `Runtime.evaluate`):
   `window.__SAVE_WEB_PAGE_OPTIONS__ = { settleTimeoutMs: 30000 }`

   | Option | Default | Meaning |
   | --- | --- | --- |
   | `settle` | `true` | Wait for load, fonts, images, DOM quiet |
   | `autoScroll` | `true` | Scroll once to trigger lazy loading |
   | `quietMs` / `settleTimeoutMs` | `1000` / `15000` | DOM-quiet window / max wait |
   | `stripScripts` | `true` | Drop scripts, `noscript`, `on*` handlers |
   | `maxAssetBytes` | 25 MB | Skip larger assets |
   | `download` | `false` | Also trigger a browser download |

3. The call resolves to a summary: `title`, `suggestedFilename`, `bytes`,
   `inlinedAssets`, `unresolved[]`. The HTML is kept at
   `window.__SAVE_WEB_PAGE_RESULT__.html`.
4. If `unresolved` lists many same-site assets (CSP `connect-src` blocks
   `fetch`; images already fall back to a CORS canvas read), call
   `Page.setBypassCSP({ enabled: true })`, reload, and verify with a small
   `fetch()` of one unresolved URL. If it still fails, enable again and
   reload once more, then re-inject. Third-party images without CORS headers
   are handled in step 6.

### 5. Write the file

1. Fetch the HTML so the browser tool saves it to a file (padding keeps it
   over the inline-response threshold; trailing whitespace is trimmed):
   `Runtime.evaluate({ expression: "window.__SAVE_WEB_PAGE_RESULT__.html.padEnd(30000)", returnByValue: true })`
2. Run the helper on the saved response path:

   ```bash
   node <skill-dir>/scripts/write-result.mjs <cdp-response.json> <output.html>
   ```

   It refuses to overwrite unless `--force` (only after the user agrees).
3. Never re-type or paste the HTML yourself — it is large and base64-heavy.
4. Fallback if no response file is produced: rerun the capture with
   `download: true`, then move the file from the browser’s downloads folder.

### 6. Inline leftover remote images

If the summary had any `unresolved` entries, run:

```bash
node <skill-dir>/scripts/inline-remote-assets.mjs <output.html>
```

- Rewrites the file in place (or pass a second path; `--force` to overwrite it).
- Node's `fetch` has no CORS, so badge proxies and no-CORS CDNs work. It sends
  no browser cookies, so login-only assets still fail.
- Relative URLs resolve against the page URL recorded in the file (`--base <url>` to override).
- Prints `inlined` and `failed[]` (URL + reason). 404/5xx are usually dead upstream assets.
- It only touches image contexts (`img`, `poster`, SVG `image`, icons, CSS
  `url()`), never links, iframes, or media sources.

### 7. Report

Reply with absolute path, file size, page title, and any assets still remote
after step 6 (they need network to load).

## Limits

- Cross-origin iframes (embedded playgrounds, live code examples, ads) and
  closed shadow roots cannot be inlined.
- Remote images that need the user's cookies, or whose host is down, stay
  remote even after step 6.
- The file is a static snapshot: JS-computed layouts (overflow "…" menus),
  inner scroll positions, carousels, and hover states are frozen or reset.
- WebGL canvases may capture blank; video/audio stay as remote URLs.
- Infinite scroll / virtualized lists only keep what was loaded.
- Only save pages the user can legitimately access.
