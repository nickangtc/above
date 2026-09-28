# Above

Above is a small, local-only Chrome extension for staying intentional about time spent on chosen websites. Set a daily budget for a domain (for example, one hour on LinkedIn), see your progress at the top of the page while you use it, and get a clear stopping point when the budget runs out. The goal is awareness and a useful nudge, not surveillance or tamper-proof enforcement.

## Install and configure

1. In Chrome, visit `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's `above` directory.
3. Click the Above toolbar icon (or open **Details → Extension options**). Add a domain and its daily limit in minutes, then click **Save limits**. The initial `linkedin.com` / 60-minute row is only a suggestion; nothing is tracked until it is saved.
4. Reload sites that were already open when you installed the extension so Chrome can inject the on-page UI. Subsequent changes to saved limits take effect in open tabs within five seconds.

A domain matches itself and its subdomains (`linkedin.com` includes `www.linkedin.com`), but not lookalike domains. You can add, edit, and remove up to 100 domains, with limits from 1 to 1440 minutes per day.

## How it works

- **Active time, not tab-open time.** Only the visible active tab in a focused Chrome window counts. Opening or refocusing it starts a session. Scrolling, mouse movement, clicking, typing, and touch renew activity; counting pauses 60 seconds after the last interaction, on leaving the site, or when the tab/window loses focus. Two tabs cannot double-count time.
- **Live progress.** A thin bar spans the top of each tracked page. It refreshes every five seconds (at most roughly ten seconds of latency around browser scheduling). Blue is the default. Hover over or keyboard-focus the bar to see time used, time remaining, and a pacing explanation. At 90% of the budget it glimmers once every five seconds.
- **Pacing warning.** Yellow means the fraction of the site's daily budget already used exceeds the fraction of the *local calendar day* already elapsed. This is a linear projection from midnight: if that average rate continues, the budget runs out before midnight. The tooltip estimates how long until that happens. This is a simple heuristic, not a prediction of what you will actually do next. For clarity, 15 minutes of a 60-minute budget at 8:30 AM is **blue** under this rule (25% used versus about 35% of the day elapsed), despite the original motivating example describing yellow; that example would require a different warning threshold or a different rate baseline.
- **Limit and grace.** At the limit, an overlay blocks the page. You can claim one five-minute grace period **per site per day** to finish a post or reply. Only active use consumes those five minutes. When it expires, the overlay returns with no second claim. Each site's usage and grace reset at local midnight, including across browser restarts.

## Privacy and limitations

Above has no account, backend, analytics, network requests, or telemetry. Settings and daily counters live in Chrome's local extension storage (`chrome.storage.local`). It doesn't read page content or record the text you type: interaction listeners only mark that an event occurred. To make new domains editable without repeatedly requesting permissions, Chrome injects a lightweight script on HTTP(S) pages; that script only shows UI and counts time for saved domains. Chrome internal pages and other pages where Chrome disallows content scripts cannot be tracked.

This is a self-management tool: disabling the extension or modifying local storage defeats the block. If Chrome sleeps, closes, or suspends the service worker, Above does not charge a long unobserved interval as active time. The bar is an in-page overlay, so unusual browser top-layer UI may appear above it.

## Development notes

This is a plain JavaScript Manifest V3 extension with no dependencies or build step:

- `manifest.json` declares the extension, options page, content script, and service worker.
- `content.js` collects interaction signals, requests a status every five seconds, and renders the bar, tooltip, and blocker in an isolated shadow root. It does not decide how much time to charge.
- `background.js` owns the authoritative counters, focus/tab transitions, daily grace claims, settings validation, and serialized writes to Chrome storage. The serialization prevents overlapping events from charging the same interval twice.
- `core.js` contains the domain matching, local-day boundary, charging, and pacing rules; it is shared with the Node tests in `test/core.test.js`. Charging caps any unobserved gap at ten seconds, ends at the idle cutoff, and splits spans across local midnight (including DST boundaries).
- `options.html`, `options.css`, and `options.js` provide the editable site list. There is no bundler or package installation.

Run checks from the repository root:

```sh
node --test test/*.test.js
for file in *.js test/*.js; do node --check "$file"; done
```

After changing extension files, click **Reload** for Above at `chrome://extensions`, then reload the tab you're testing. For manual testing, use a short daily limit and check tab switches, idling, midnight rollover, blocking, and the one-time grace button. Note that a limit change does not erase today's recorded time.
