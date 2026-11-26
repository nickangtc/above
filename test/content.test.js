const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual content script with a minimal DOM and controllable clock/messages.
test('overnight wake clears stale grace UI and ignores a late yesterday response', async () => {
  const yesterday = new Date(2026, 8, 28, 23, 59).getTime();
  const morning = new Date(2026, 8, 29, 9).getTime();
  let now = yesterday;
  const calls = [];
  let tick;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const elements = [];
  class Element {
    constructor() {
      elements.push(this);
      this.isConnected = false;
      this.style = {};
      this.classList = { toggle() {} };
    }
    attachShadow() { return new Element(); }
    append(...children) { for (const child of children) child.isConnected = true; }
    remove() { this.isConnected = false; }
    setAttribute() {}
    addEventListener() {}
  }
  const document = {
    createElement: () => new Element(),
    documentElement: new Element(),
    addEventListener() {},
    visibilityState: 'visible'
  };
  const chrome = { runtime: { sendMessage: message => new Promise(resolve => calls.push({ message, resolve })) } };
  const context = { document, window: { addEventListener() {} }, chrome, Date: Clock,
    setInterval: fn => { tick = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8'), context);
  const bar = elements.find(el => el.className === 'bar-area');
  const tip = elements.find(el => el.className === 'tip');
  assert.equal(calls.length, 1);
  const yesterdayState = { date: '2026-09-28', domain: 'x.com', minutes: 1,
    usedMs: 60_000, remainingMs: 0, fraction: 1, yellow: false, glimmer: false,
    blocked: false, graceClaimed: true, graceRemainingMs: 180_000 };
  calls[0].resolve({ ok: true, value: yesterdayState });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(tip.textContent, /Grace period:/);
  // A second pulse is still in flight when the browser wakes the next morning.
  tick();
  assert.equal(calls.length, 2);
  now = morning;
  tick();
  assert.equal(bar.isConnected, false);
  calls[1].resolve({ ok: true, value: yesterdayState });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bar.isConnected, false); // Late yesterday response was ignored.
  tick();
  assert.equal(calls.length, 3);
  const todayState = { ...yesterdayState, date: '2026-09-29', usedMs: 0,
    remainingMs: 60_000, fraction: 0, graceClaimed: false, graceRemainingMs: 300_000 };
  calls[2].resolve({ ok: true, value: todayState });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bar.isConnected, true);
  assert.doesNotMatch(tip.textContent, /Grace period:/);
  assert.match(tip.textContent, /0m used/);
});
