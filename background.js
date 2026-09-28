importScripts("core.js");
const C = globalThis.AboveCore;
const HEARTBEAT_GAP_MS = 10_000;
let sites = [];
let usage = {};
let session = null; // { tabId, domain, lastTick, lastActivity }
let queue = Promise.resolve();
const ready = chrome.storage.local.get(["sites", "usage"]).then(data => {
  sites = Array.isArray(data.sites) ? data.sites : [];
  usage = data.usage && typeof data.usage === "object" ? data.usage : {};
});

// Serialize every transition, including storage writes. Events may arrive while another
// event is awaiting Chrome APIs; charging the same interval twice is not acceptable.
function enqueue(task) {
  const result = queue.then(async () => { await ready; return task(); });
  queue = result.catch(error => console.error("Above:", error));
  return result;
}

async function persist() {
  await chrome.storage.local.set({ usage });
}

function settle(now) {
  if (!session) return;
  const previous = usage[session.domain];
  const site = sites.find(s => s.domain === session.domain);
  if (site) {
    usage[site.domain] = C.charge(C.usageForDay(previous, session.lastTick), site,
      session.lastTick, now, session.lastActivity);
  }
  session.lastTick = now;
}

async function isForeground(tabId, windowId) {
  try {
    const [tab, win] = await Promise.all([chrome.tabs.get(tabId), chrome.windows.get(windowId)]);
    return tab.active && win.focused;
  } catch {
    return false;
  }
}

function stateFor(url, now) {
  const site = C.matchingSite(url, sites);
  if (!site) return null;
  usage[site.domain] = C.usageForDay(usage[site.domain], now);
  return C.status(site, usage[site.domain], now);
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  enqueue(async () => {
    const now = Date.now();
    if (message.type === "pulse" && sender.tab?.id != null) {
      const tab = sender.tab;
      const site = C.matchingSite(tab.url || sender.url, sites);
      const foreground = await isForeground(tab.id, tab.windowId);
      // An unfocused tab or hidden document must never accumulate time.
      const eligible = site && foreground && message.visible === true;
      if (session && (!eligible || session.tabId !== tab.id || session.domain !== site.domain)) {
        settle(now);
        session = null;
      }
      if (eligible) {
        if (!session) session = { tabId: tab.id, domain: site.domain, lastTick: now, lastActivity: now };
        else settle(now); // Settle against OLD last activity before accepting a new input.
        if (message.activity === true) session.lastActivity = now;
      }
      await persist();
      return stateFor(tab.url || sender.url, now);
    }
    if (message.type === "getSettings") {
      return { sites, statuses: sites.map(site => C.status(site, C.usageForDay(usage[site.domain], now), now)) };
    }
    if (message.type === "saveSites") {
      if (!Array.isArray(message.sites) || message.sites.length > 100) throw new Error("Invalid site list");
      const cleaned = message.sites.map(item => ({ domain: C.normalizeDomain(item.domain), minutes: Number(item.minutes) }));
      if (cleaned.some(s => !s.domain || !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 1440) ||
        new Set(cleaned.map(s => s.domain)).size !== cleaned.length) throw new Error("Enter unique domains and limits of 1–1440 minutes.");
      settle(now);
      session = null;
      sites = cleaned;
      await chrome.storage.local.set({ sites, usage });
      return { sites };
    }
    if (message.type === "claimGrace" && sender.tab?.id != null) {
      const site = C.matchingSite(sender.tab.url || sender.url, sites);
      if (!site || !(await isForeground(sender.tab.id, sender.tab.windowId))) return null;
      settle(now);
      const today = C.usageForDay(usage[site.domain], now);
      if (today.usedMs >= site.minutes * 60_000 && !today.graceClaimed) {
        today.graceClaimed = true;
        usage[site.domain] = today;
        await persist();
      }
      return C.status(site, today, now);
    }
    return null;
  }).then(value => reply({ ok: true, value }), error => reply({ ok: false, error: error.message }));
  return true;
});

// Transition immediately on tab/window changes rather than waiting for the next pulse.
function stopIf(predicate) {
  enqueue(async () => {
    if (session && predicate(session)) {
      settle(Date.now());
      session = null;
      await persist();
    }
  });
}
chrome.tabs.onActivated.addListener(({ tabId }) => stopIf(s => s.tabId !== tabId));
chrome.tabs.onRemoved.addListener(tabId => stopIf(s => s.tabId === tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading" || info.url) stopIf(s => s.tabId === tabId);
});
chrome.windows.onFocusChanged.addListener(() => {
  enqueue(async () => {
    if (!session) return;
    const tab = await chrome.tabs.get(session.tabId).catch(() => null);
    if (!tab || !(await isForeground(tab.id, tab.windowId))) {
      settle(Date.now());
      session = null;
      await persist();
    }
  });
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
