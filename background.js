importScripts("core.js");
const C = globalThis.AboveCore;
const HEARTBEAT_GAP_MS = 10_000;
let sites = [];
let usage = {};
let session = null; // { tabId, domain, lastTick, lastActivity }
let queue = Promise.resolve();
const FOCUS_RULE_ID = 1;
const FOCUS_ALARM = "focus-expiry";
const FOCUS_PAGE = chrome.runtime.getURL("focus.html");
let focusBlock = null;
const ready = chrome.storage.local.get(["sites", "usage", "focusBlock"]).then(async data => {
  sites = Array.isArray(data.sites) ? data.sites : [];
  usage = data.usage && typeof data.usage === "object" ? data.usage : {};
  focusBlock = data.focusBlock || null;
  await restoreFocusBlock();
}).catch(error => console.error("Above startup:", error));

function updateFocusRule(block) {
  return chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [FOCUS_RULE_ID],
    addRules: block ? [{
      id: FOCUS_RULE_ID,
      priority: 1,
      action: { type: "redirect", redirect: { extensionPath: "/focus.html" } },
      condition: { requestDomains: block.domains, urlFilter: "|http", resourceTypes: ["main_frame"] }
    }] : []
  });
}

async function endFocusBlock() {
  await updateFocusRule(null);
  await chrome.storage.local.remove("focusBlock");
  focusBlock = null;
  await chrome.alarms.clear(FOCUS_ALARM);
}

async function restoreFocusBlock() {
  if (!focusBlock || focusBlock.until <= Date.now()) {
    await endFocusBlock();
    return;
  }
  await updateFocusRule(focusBlock);
  await chrome.alarms.create(FOCUS_ALARM, { when: focusBlock.until });
}

function matchesFocus(url, block = focusBlock) {
  return !!block && block.until > Date.now() && !!C.matchingSite(url, block.domains.map(domain => ({ domain })));
}

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === FOCUS_ALARM) enqueue(restoreFocusBlock);
});

// DNR is the first line of defense, but a site service worker can serve a
// navigation without a network request. Catch those navigations as well.
function enforceFocusNavigation({ tabId, frameId, url }) {
  if (frameId !== 0 || !/^https?:\/\//i.test(url)) return;
  enqueue(async () => {
    if (!matchesFocus(url)) return;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !matchesFocus(tab.pendingUrl || tab.url)) return;
    await chrome.tabs.update(tabId, { url: FOCUS_PAGE }).catch(() => {});
  });
}
chrome.webNavigation.onBeforeNavigate.addListener(enforceFocusNavigation);
chrome.webNavigation.onCommitted.addListener(enforceFocusNavigation);

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
    if (message.type === "startFocusBlock") {
      if (focusBlock?.until > now) throw new Error("End the current focus block first.");
      const domains = Array.isArray(message.domains) ? message.domains.map(C.normalizeDomain) : [];
      if (!domains.length || domains.length > 50 || domains.some(domain => !domain)) {
        throw new Error("Enter up to 50 valid comma-separated site URLs or domains.");
      }
      if (![30, 60, 120, 240, 480].includes(message.minutes)) throw new Error("Choose a focus duration.");
      const next = { domains: [...new Set(domains.map(domain => domain.replace(/^www\.(?=.+\.)/, "")))], startedAt: now, until: now + message.minutes * 60_000 };
      await updateFocusRule(next);
      try {
        await chrome.alarms.create(FOCUS_ALARM, { when: next.until });
        await chrome.storage.local.set({ focusBlock: next });
      } catch (error) {
        await updateFocusRule(null);
        await chrome.alarms.clear(FOCUS_ALARM);
        throw error;
      }
      focusBlock = next;
      if (session) {
        const tab = await chrome.tabs.get(session.tabId).catch(() => null);
        if (matchesFocus(tab?.url)) {
          settle(now);
          session = null;
          await persist();
        }
      }
      // Already-open documents won't navigate through the new rule on their own.
      const tabs = await chrome.tabs.query({});
      await Promise.allSettled(tabs.filter(tab => matchesFocus(tab.pendingUrl || tab.url))
        .map(tab => chrome.tabs.update(tab.id, { url: FOCUS_PAGE })));
      return focusBlock;
    }
    if (message.type === "endFocusBlock") {
      await endFocusBlock();
      return null;
    }
    if ((message.type === "pulse" || message.type === "claimGrace") &&
        (matchesFocus(sender.url) || matchesFocus(sender.tab?.url))) return null;
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
