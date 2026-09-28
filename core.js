/* Shared, side-effect-free rules for Above. Also loadable in Node for tests. */
(function (root) {
  "use strict";
  const IDLE_MS = 60_000;
  const GRACE_MS = 5 * 60_000;
  const MAX_GAP_MS = 10_000; // Never charge an unobserved browser sleep as active time.

  function dayKey(time) {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function nextMidnight(time) {
    const d = new Date(time);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  function startOfDay(time) {
    const d = new Date(time);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function normalizeDomain(input) {
    const text = String(input || "").trim();
    if (!text || /\s/.test(text)) return null;
    try {
      const url = new URL(text.includes("://") ? text : `https://${text}`);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (!host || !/^[a-z0-9.-]+$/.test(host) || host.includes("..") || host.startsWith("-") || host.endsWith("-")) return null;
      return host;
    } catch {
      return null;
    }
  }

  function matchingSite(url, sites) {
    let host;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return null;
      host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      return null;
    }
    return sites.filter(s => host === s.domain || host.endsWith(`.${s.domain}`))
      .sort((a, b) => b.domain.length - a.domain.length)[0] || null;
  }

  function freshUsage(time) {
    return { date: dayKey(time), usedMs: 0, graceUsedMs: 0, graceClaimed: false };
  }

  function usageForDay(usage, time) {
    return usage && usage.date === dayKey(time) ? usage : freshUsage(time);
  }

  // Charges only time in the current continuous, foreground, recently active session.
  // Splits at local midnight (including DST days), so no time leaks into the wrong day.
  function charge(usage, site, from, to, lastActivity) {
    let result = usage;
    const end = Math.min(to, from + MAX_GAP_MS, lastActivity + IDLE_MS);
    for (let cursor = from; cursor < end;) {
      result = usageForDay(result, cursor);
      const boundary = Math.min(end, nextMidnight(cursor));
      let remaining = boundary - cursor;
      const quota = site.minutes * 60_000;
      const regular = Math.min(remaining, Math.max(0, quota - result.usedMs));
      result.usedMs += regular;
      remaining -= regular;
      if (result.graceClaimed && remaining > 0) {
        result.graceUsedMs += Math.min(remaining, Math.max(0, GRACE_MS - result.graceUsedMs));
      }
      cursor = boundary;
    }
    return usageForDay(result, to);
  }

  function status(site, usage, now) {
    const today = usageForDay(usage, now);
    const quota = site.minutes * 60_000;
    const fraction = Math.min(1, today.usedMs / quota);
    const dayFraction = Math.min(1, (now - startOfDay(now)) / (nextMidnight(now) - startOfDay(now)));
    const blocked = today.usedMs >= quota && (!today.graceClaimed || today.graceUsedMs >= GRACE_MS);
    const yellow = !blocked && fraction > dayFraction;
    // Project today's rate so far linearly to the point at which the quota runs out.
    const elapsed = now - startOfDay(now);
    const etaMs = today.usedMs > 0 ? Math.max(0, quota * elapsed / today.usedMs - elapsed) : null;
    return {
      domain: site.domain, minutes: site.minutes, usedMs: today.usedMs,
      remainingMs: Math.max(0, quota - today.usedMs), fraction, yellow,
      glimmer: fraction >= 0.9 && !blocked, blocked,
      graceClaimed: today.graceClaimed,
      graceRemainingMs: Math.max(0, GRACE_MS - today.graceUsedMs),
      etaMs: yellow ? etaMs : null,
      dayFraction
    };
  }

  root.AboveCore = { IDLE_MS, GRACE_MS, dayKey, normalizeDomain, matchingSite, freshUsage, usageForDay, charge, status };
  if (typeof module !== "undefined") module.exports = root.AboveCore;
})(globalThis);
