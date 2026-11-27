# Above

Above is a simple, private Chrome extension that helps you stay focused online in two ways:

1. **Daily site limits** — Choose the sites you tend to overuse, set a daily time budget, and let Above keep track for you. A quiet progress bar shows how you're pacing, and a full-page pause steps in when your time is up.
2. **Focus blocks** — Block distracting sites for a set stretch of time (30 minutes to 8 hours) whenever you need uninterrupted focus.

Everything stays in your browser. There are no accounts, no tracking, and no setup beyond loading the extension.

## Getting started

Above isn't on the Chrome Web Store yet, so you install it directly in Chrome in about a minute:

1. **Download Above:** Click the green **Code** button at the top of this page, choose **Download ZIP**, and unzip the downloaded folder. *(If you use Git, you can clone this repository instead.)*
2. **Open Chrome Extensions:** Type `chrome://extensions` into Chrome's address bar and press Enter.
3. **Turn on Developer mode:** Flip the **Developer mode** switch in the top-right corner.
4. **Load the extension:** Click **Load unpacked** and select the unzipped `above` folder.
5. **Open Above:** Click the **Above** icon in your Chrome toolbar (you can pin it from the puzzle-piece icon for quick access).

> If you already had sites open before installing, refresh those tabs once so Above can appear on them.

## How to use it

### 1. Daily site limits

Use **Site limits** for sites you want to keep in your life, just in moderation (like LinkedIn, Reddit, or news sites).

- Add a website domain (for example `linkedin.com`) and your daily limit in minutes, then click **Save limits**.
  - Entering `linkedin.com` automatically covers its subdomains too (such as `www.linkedin.com`).
  - The starter `linkedin.com` / 60-minute row is just an example—nothing is tracked until you click **Save limits**.
- **Only active time counts.** Above only counts time when the site is in your active, focused tab and you're actively using it. Time pauses automatically after 60 seconds without activity, or as soon as you switch tabs or windows.
- **Subtle progress bar.** A thin bar runs along the top of tracked pages. Hover over it to see time used, time remaining, and your pace:
  - **Blue** — You're on a sustainable pace for the day.
  - **Yellow** — At today's pace, you're likely to run out before midnight.
  - **Glimmer** — You've used 90% of today's budget.
- **When time runs out.** Above covers the page to give you a clean stopping point. If you're mid-message, you can claim one **5-minute grace period** per site per day (only active use counts). Limits and grace periods reset at midnight in your local timezone, including if your computer or browser was asleep overnight.

### 2. Focus blocks

Use **Focus block** when you want a distraction-free stretch of work without watching a timer.

- Enter the sites you want to block (separated by commas), or click any of your **Frequently blocked** shortcuts once you've run a few sessions.
- Choose a duration (**30 minutes**, **60 minutes**, **2 hours**, **4 hours**, or **8 hours**) and click **Start focusing**.
- Any open tab on those sites—and any new visit while the block is active—is redirected to a calm reminder screen until time is up.
- You can end a focus block early from the Above page if plans change. Sites blocked during a focus session won't count against your daily limits.

## Privacy & philosophy

- **100% local.** Your settings, daily counters, and frequently blocked sites stay on your computer. Above makes no network requests and collects no analytics or telemetry.
- **No content reading.** Above never reads the content of pages you visit or the text you type. It asks Chrome for broad website access only so you can add or change sites freely without Chrome prompting you for permissions every time.
- **A nudge, not a lockbox.** Above is designed for awareness and gentle friction—not tamper-proof enforcement. You remain in control and can adjust limits, end a focus block, or disable the extension whenever you choose.

## Contributing & technical notes

Interested in how Above is designed, the reasoning behind its behavior, or running the tests locally? See [DESIGN.md](DESIGN.md).
