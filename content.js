(() => {
  "use strict";
  const host = document.createElement("div");
  host.id = "above-extension-root";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; font-family: system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    .bar-area { position: fixed; top: 0; left: 0; right: 0; height: 12px; pointer-events: auto; cursor: help; }
    .rail { height: 6px; width: 100%; background: rgba(15, 23, 42, .18); }
    .fill { height: 100%; width: 0; background: #0a66c2; transition: width .3s linear, background .3s; position: relative; overflow: hidden; }
    .fill.yellow { background: #eab308; }
    .fill.glimmer::after { content: ''; position: absolute; inset: 0; width: 35%; transform: translateX(-150%) skewX(-25deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent); animation: gleam 5s infinite; }
    @keyframes gleam { 0%, 75% { transform: translateX(-150%) skewX(-25deg); } 92%, 100% { transform: translateX(400%) skewX(-25deg); } }
    .tip { display: none; position: absolute; top: 14px; left: 10px; max-width: min(340px, calc(100vw - 20px)); padding: 12px 14px; border-radius: 10px; background: #172335; color: white; box-shadow: 0 6px 22px #0004; font: 13px/1.5 system-ui, sans-serif; white-space: pre-line; }
    .bar-area:hover .tip, .bar-area:focus-within .tip { display: block; }
    .bar-area:focus-visible { outline: 2px solid #0a66c2; }
    .overlay { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(9, 18, 33, .94); color: #fff; pointer-events: auto; }
    .card { width: min(440px, calc(100vw - 32px)); padding: 38px; background: #172335; border: 1px solid #ffffff25; border-radius: 18px; text-align: center; box-shadow: 0 20px 70px #0007; }
    h1 { font-size: 30px; margin: 0 0 12px; } p { font-size: 16px; line-height: 1.5; color: #d2dcea; margin: 0 0 20px; }
    button { appearance: none; border: 0; border-radius: 8px; padding: 12px 18px; background: #0a66c2; color: #fff; font: 600 15px system-ui; cursor: pointer; }
    button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  `;
  const bar = document.createElement("div");
  bar.className = "bar-area";
  bar.tabIndex = 0;
  bar.setAttribute("role", "progressbar");
  const rail = document.createElement("div");
  rail.className = "rail";
  const fill = document.createElement("div");
  fill.className = "fill";
  rail.append(fill);
  const tip = document.createElement("div");
  tip.className = "tip";
  bar.append(rail, tip);
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const card = document.createElement("div");
  card.className = "card";
  const heading = document.createElement("h1");
  heading.textContent = "Time's up for today";
  const description = document.createElement("p");
  const graceButton = document.createElement("button");
  graceButton.textContent = "Use my 5-minute grace period";
  card.append(heading, description, graceButton);
  overlay.append(card);
  shadow.append(style, bar);

  let lastInput = Date.now(); // Opening a tracked page counts as an interaction.
  let lastSentInput = 0;
  let busy = false;
  let current = null;
  const fmt = ms => {
    const minutes = Math.ceil(ms / 60_000);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  };

  function render(state) {
    current = state;
    if (!state) {
      bar.remove();
      overlay.remove();
      return;
    }
    if (!bar.isConnected) shadow.append(bar);
    fill.style.width = `${(state.fraction * 100).toFixed(2)}%`;
    fill.classList.toggle("yellow", state.yellow);
    fill.classList.toggle("glimmer", state.glimmer);
    bar.setAttribute("aria-valuenow", String(Math.round(state.fraction * 100)));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-label", `${state.domain}: ${fmt(state.remainingMs)} remaining of ${state.minutes} minutes`);
    let pace = state.yellow
      ? `At today's pace, you are likely to finish your quota in ${fmt(state.etaMs)}.`
      : "You are currently using this site at a sustainable pace.";
    if (state.blocked) pace = "Your daily quota is exhausted.";
    if (state.graceClaimed && !state.blocked) pace = `Grace period: ${fmt(state.graceRemainingMs)} of active use left.`;
    tip.textContent = `${state.domain}\n${fmt(state.usedMs)} used · ${fmt(state.remainingMs)} left (${Math.round(state.fraction * 100)}%)\n${pace}`;
    if (state.blocked) {
      description.textContent = state.graceClaimed
        ? `You've used your daily limit and your one-time grace period on ${state.domain}. Come back tomorrow.`
        : `You've used your ${state.minutes}-minute daily limit on ${state.domain}. Need to finish something? You can use five more active minutes once today.`;
      graceButton.hidden = state.graceClaimed;
      if (!overlay.isConnected) shadow.append(overlay);
    } else overlay.remove();
  }

  async function send(type, extra = {}) {
    try {
      const response = await chrome.runtime.sendMessage({ type, ...extra });
      if (response?.ok) render(response.value);
    } catch { /* Extension was reloaded or its service worker is restarting. */ }
  }

  async function pulse() {
    if (busy) return;
    busy = true;
    const visible = document.visibilityState === "visible";
    const activity = visible && lastInput > lastSentInput;
    try {
      await send("pulse", { visible, activity });
      if (activity) lastSentInput = lastInput;
    } finally { busy = false; }
  }

  function record(event) {
    if (event.composedPath().includes(host)) return;
    lastInput = Date.now();
  }
  for (const type of ["pointerdown", "pointermove", "wheel", "scroll", "keydown", "input", "touchstart"]) {
    document.addEventListener(type, record, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", pulse);
  window.addEventListener("focus", () => { lastInput = Date.now(); pulse(); });
  window.addEventListener("pagehide", () => send("pulse", { visible: false }));
  graceButton.addEventListener("click", () => send("claimGrace"));
  document.documentElement.append(host);
  pulse();
  setInterval(pulse, 5_000);
})();
