const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const AboveCore = require('../core.js');

const source = readFileSync(join(__dirname, '../background.js'), 'utf8');

function worker(initial = {}) {
  let now = Date.now();
  let rule;
  let alarm;
  const storage = { sites: [{ domain: 'linkedin.com', minutes: 60 }], ...initial };
  const tab = { id: 1, windowId: 1, active: true, url: 'https://www.linkedin.com/feed/' };
  const focusPage = 'chrome-extension://test/focus.html';
  const navigations = [];
  const event = () => ({ addListener(listener) { this.fire = listener; } });
  const chrome = {
    runtime: { getURL: () => focusPage, onMessage: event() },
    storage: { local: {
      get: async () => ({ ...storage }),
      set: async data => { Object.assign(storage, data); },
      remove: async key => { delete storage[key]; }
    } },
    declarativeNetRequest: { updateDynamicRules: async ({ addRules }) => { rule = addRules[0]; } },
    alarms: { onAlarm: event(), create: async (name, options) => { alarm = { name, ...options }; }, clear: async () => { alarm = undefined; } },
    tabs: {
      get: async () => tab, query: async () => [tab], update: async (id, { url }) => { navigations.push([id, url]); },
      onActivated: event(), onRemoved: event(), onUpdated: event()
    },
    windows: { get: async () => ({ focused: true }), onFocusChanged: event() },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event() },
    action: { onClicked: event() }
  };
  vm.runInNewContext(source, { AboveCore, importScripts() {}, chrome, console, Date: { now: () => now } });
  return {
    send: (type, fields = {}, sender = {}) => new Promise(resolve => chrome.runtime.onMessage.fire({ type, ...fields }, sender, resolve)),
    advance: ms => { now += ms; }, expire: () => chrome.alarms.onAlarm.fire(alarm),
    navigate: (url, frameId = 0) => {
      if (frameId === 0) tab.url = url;
      chrome.webNavigation.onCommitted.fire({ tabId: tab.id, frameId, url });
    },
    storage, tab, focusPage, navigations,
    get rule() { return rule; }
  };
}

test('focus installs a main-frame redirect, does not charge usage, and removes the rule at expiry', async () => {
  const w = worker();
  const start = await w.send('startFocusBlock', { domains: ['https://www.linkedin.com/feed/', 'x.com'], minutes: 60 });
  assert.equal(start.ok, true);
  assert.equal(start.value.until - start.value.startedAt, 60 * 60_000);
  assert.equal(w.storage.focusBlock.startedAt, start.value.startedAt);
  assert.deepEqual(Array.from(w.rule.condition.requestDomains), ['linkedin.com', 'x.com']);
  assert.deepEqual(Array.from(w.rule.condition.resourceTypes), ['main_frame']);
  assert.equal(w.rule.action.redirect.extensionPath, '/focus.html');
  assert.deepEqual(w.navigations, [[1, w.focusPage]]);
  assert.equal((await w.send('startFocusBlock', { domains: ['example.com'], minutes: 30 })).ok, false);
  const sender = { tab: w.tab, url: w.tab.url };
  for (let i = 0; i < 2; i++) {
    assert.equal((await w.send('pulse', { visible: true, activity: true }, sender)).value, null);
    w.advance(5_000);
  }
  assert.equal((await w.send('getSettings')).value.statuses[0].usedMs, 0);
  w.navigate('https://x.com/home');
  await w.send('getSettings');
  assert.deepEqual(w.navigations, [[1, w.focusPage], [1, w.focusPage]]);
  w.navigate('https://example.com');
  w.navigate('https://x.com/embedded', 1);
  await w.send('getSettings');
  assert.equal(w.navigations.length, 2);
  w.tab.url = 'https://www.linkedin.com/feed/';
  w.advance(60 * 60_000);
  w.expire();
  await w.send('getSettings');
  assert.equal(w.rule, undefined);
  assert.equal(w.storage.focusBlock, undefined);
  assert.equal((await w.send('pulse', { visible: true, activity: true }, sender)).value.domain, 'linkedin.com');
});
