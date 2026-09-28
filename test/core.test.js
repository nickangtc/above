const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const site = { domain: 'linkedin.com', minutes: 60 };
const at = (hour, min = 0) => new Date(2026, 8, 28, hour, min).getTime();

test('matches exact domains and subdomains, not lookalikes', () => {
  assert.equal(C.matchingSite('https://www.linkedin.com/feed', [site]), site);
  assert.equal(C.matchingSite('https://evil-linkedin.com', [site]), null);
  assert.equal(C.matchingSite('https://linkedin.com.evil.org', [site]), null);
  assert.equal(C.matchingSite('https://example.com', [site]), null);
  assert.equal(C.matchingSite('https://a.linkedin.com', [site, { domain: 'a.linkedin.com', minutes: 10 }]).minutes, 10);
  assert.equal(C.normalizeDomain('https://LinkedIn.com/feed'), 'linkedin.com');
  assert.equal(C.normalizeDomain('https://user:pass@linkedin.com'), null);
});

test('charges only recent activity, caps missing heartbeat gaps and idle at 60s', () => {
  const start = at(8);
  let u = C.freshUsage(start);
  for (let t = start; t < start + 60_000; t += 5_000) u = C.charge(u, site, t, t + 5_000, start);
  assert.equal(u.usedMs, 60_000);
  u = C.charge(u, site, start + 60_000, start + 90_000, start);
  assert.equal(u.usedMs, 60_000);
  u = C.charge(u, site, start + 90_000, start + 5 * 60_000, start + 90_000);
  assert.equal(u.usedMs, 70_000);
});

test('yellow means quota fraction exceeds elapsed fraction of local day', () => {
  const now = at(8, 30);
  let u = { ...C.freshUsage(now), usedMs: 25 * 60_000 };
  const s = C.status(site, u, now);
  assert.equal(s.yellow, true);
  assert.ok(s.etaMs > 0);
  // With the agreed midnight-based linear rule, 15/60 < 8.5/24 at 8:30.
  u.usedMs = 15 * 60_000;
  assert.equal(C.status(site, u, now).yellow, false);
  u.usedMs = 5 * 60_000;
  assert.equal(C.status(site, u, now).yellow, false);
  u.usedMs = 54 * 60_000;
  assert.equal(C.status(site, u, now).glimmer, true);
});

test('quota blocks; one claimed grace period charges active use and expires', () => {
  const now = at(12);
  let u = { ...C.freshUsage(now), usedMs: 60 * 60_000 };
  assert.equal(C.status(site, u, now).blocked, true);
  u.graceClaimed = true;
  assert.equal(C.status(site, u, now).blocked, false);
  for (let t = now; t < now + C.GRACE_MS; t += 5_000) u = C.charge(u, site, t, t + 5_000, t);
  assert.equal(u.graceUsedMs, C.GRACE_MS);
  assert.equal(C.status(site, u, now + C.GRACE_MS).blocked, true);
});

test('local midnight resets usage and grace', () => {
  const before = new Date(2026, 8, 28, 23, 59, 59).getTime();
  let u = { ...C.freshUsage(before), usedMs: 30_000, graceClaimed: true };
  u = C.charge(u, site, before, before + 5_000, before);
  assert.equal(u.usedMs, 4_000);
  assert.equal(u.graceClaimed, false);
  assert.equal(C.status(site, u, before + 5_000).blocked, false);
});
