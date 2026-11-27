# Design & Architecture Notes

This document captures the intents, trade-offs, and key decisions behind Above rather than walking through the code line by line.

## Philosophy & Constraints

- **Awareness and friction, not tamper-proof enforcement.** Above assumes the user wants help staying intentional. It does not try to stop a determined user from disabling the extension, editing local storage, or ending a focus block early.
- **Local-only by design.** There is no backend, account system, sync service, or telemetry. All state lives in local browser storage.
- **Zero dependencies, zero build step.** Above is plain JavaScript, HTML, and CSS (Manifest V3) so anyone can inspect the entire extension, load it directly from the repository, and modify it without installing a toolchain.

## Two Features, Two Mechanisms

Above combines two distinct productivity intents, and each uses a different browser mechanism because their goals differ:

1. **Daily site limits (in-page awareness + soft intervention)**
   - Needs continuous visual feedback (the top progress bar and pacing tooltip), active-use detection, and a one-time 5-minute grace period.
   - Because of that, daily limits run via a lightweight in-page UI isolated inside a closed Shadow DOM so site styles cannot break it and it cannot leak styles onto the page.
   - The page script is intentionally untrusted with accounting: it only reports visibility and that an interaction occurred, while the background service worker is the single authority for charging time and deciding blocked state.

2. **Focus blocks (hard, distraction-free wall)**
   - The intent is an immediate, zero-temptation redirect before a distracting page even loads.
   - Primary enforcement uses Chrome's declarative network request redirection so navigations are intercepted before the page renders.
   - Because sites with their own service workers can satisfy a navigation without hitting the network, navigation listeners act as a secondary fallback to redirect those tabs as well.
   - Starting a focus block immediately redirects already-open matching tabs and pauses/ignores daily-limit charging for blocked domains so a blocked tab cannot burn daily quota.

## Time Accounting Decisions

- **Active foreground time only.** Leaving a tab open in the background or stepping away from the computer should not consume a daily budget. Time only accrues for the active tab in a focused window while the document is visible, and pauses after 60 seconds without user interaction.
- **Capped unobserved gaps.** Browser sleep, machine suspension, or service worker restarts can create long gaps between heartbeats. Any single unobserved interval is capped so waking a laptop never charges phantom usage.
- **Local calendar day boundaries.** Budgets and grace periods reset at local midnight. Intervals spanning midnight are split at the boundary (respecting daylight saving time transitions) so usage never leaks into the next day. Status responses carry their local calendar date so tabs waking up after an overnight pause immediately clear yesterday's UI and ignore any delayed prior-day responses.
- **Serialized transitions.** Browser events (tab switches, window focus changes, heartbeats, settings saves) can arrive concurrently while earlier handlers await Chrome APIs. All state transitions and storage writes are serialized through a single queue so the same interval can never be charged twice.
- **Removing a site preserves today's usage.** Deleting a domain from the limits list does not wipe today's recorded time, preventing accidental or impulsive resets if the site is re-added the same day.

## Pacing Heuristic

The progress bar turns yellow when the fraction of a site's daily budget used exceeds the fraction of the local calendar day elapsed since midnight.

- This is intentionally a simple linear projection from midnight—predictable and free of assumptions about when the user wakes up or works.
- It is meant as a quick directional signal ("at this average rate, you'll run out before midnight"), not a behavioral prediction.

## Permissions & Privacy Trade-off

Above requests broad `http`/`https` host access up front rather than requesting per-domain optional permissions.

- **Why:** Users frequently add, edit, and ad-hoc block domains in both daily limits and focus blocks. Prompting for browser permission on every domain change creates friction that undermines a quick focus tool.
- **Safeguard:** The extension remains inert on sites that aren't configured, never reads page DOM content, and never inspects keyboard/pointer payloads—interaction listeners only record that an event occurred.

## Local Development

The shared rules and focus-block logic are tested with Node's built-in test runner (no packages to install):

```sh
node --test test/*.test.js
for file in *.js test/*.js; do node --check "$file"; done
```

After editing extension files:

1. Open `chrome://extensions` and click **Reload** on Above.
2. Reload any open webpage tabs you are testing so they pick up the updated content script.
