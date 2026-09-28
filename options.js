(() => {
  const form = document.getElementById("form");
  const list = document.getElementById("sites");
  const notice = document.getElementById("notice");
  const C = globalThis.AboveCore;
  function row(domain = "", minutes = 60) {
    const el = document.createElement("div");
    el.className = "row";
    const domainLabel = document.createElement("label");
    domainLabel.textContent = "Domain";
    const domainInput = document.createElement("input");
    domainInput.type = "text";
    domainInput.placeholder = "linkedin.com";
    domainInput.value = domain;
    domainInput.required = true;
    domainLabel.append(domainInput);
    const minutesLabel = document.createElement("label");
    minutesLabel.textContent = "Minutes / day";
    const minutesInput = document.createElement("input");
    minutesInput.type = "number";
    minutesInput.min = "1";
    minutesInput.max = "1440";
    minutesInput.step = "1";
    minutesInput.value = minutes;
    minutesInput.required = true;
    minutesLabel.append(minutesInput);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${domain || "site"}`);
    remove.addEventListener("click", () => el.remove());
    el.append(domainLabel, minutesLabel, remove);
    list.append(el);
    return el;
  }
  async function message(type, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...extra });
    if (!response?.ok) throw new Error(response?.error || "Unable to contact extension");
    return response.value;
  }
  document.getElementById("add").addEventListener("click", () => row().querySelector("input").focus());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    notice.className = "";
    const sites = Array.from(list.children, el => {
      const [domainInput, minutesInput] = el.querySelectorAll("input");
      return { domain: C.normalizeDomain(domainInput.value), minutes: Number(minutesInput.value) };
    });
    if (sites.some(s => !s.domain || !Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 1440) ||
      new Set(sites.map(s => s.domain)).size !== sites.length) {
      notice.textContent = "Enter unique valid domains and limits between 1 and 1440 minutes.";
      return;
    }
    try {
      await message("saveSites", { sites });
      notice.className = "success";
      notice.textContent = "Saved. Open tabs will pick up your changes within five seconds.";
    } catch (error) { notice.textContent = error.message; }
  });
  message("getSettings").then(({ sites }) => {
    sites.forEach(s => row(s.domain, s.minutes));
    if (!sites.length) row("linkedin.com", 60);
  }).catch(error => { notice.textContent = error.message; });
})();
