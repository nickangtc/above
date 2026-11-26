(() => {
  const form = document.getElementById("form");
  const list = document.getElementById("sites");
  const notice = document.getElementById("notice");
  const C = globalThis.AboveCore;
  const focusInput = document.getElementById('focus-sites');
  const focusStatus = document.getElementById('focus-status');
  const focusToggle = document.getElementById('focus-toggle');
  const focusDuration = document.getElementById('focus-duration');
  const focusProgress = document.getElementById('focus-progress');
  const focusFrequent = document.getElementById('focus-frequent');
  const focusChips = document.getElementById('focus-chips');
  const focusCard = focusProgress.closest('.focus');
  const progressRects = focusProgress.querySelectorAll('rect');
  let focusActive = false;
  let currentFocusBlock = null;
  let focusDomainCounts = {};

  function sizeFocusProgress() {
    for (const rect of progressRects) {
      rect.setAttribute('width', Math.max(0, focusCard.clientWidth - 4));
      rect.setAttribute('height', Math.max(0, focusCard.clientHeight - 4));
    }
  }
  new ResizeObserver(sizeFocusProgress).observe(focusCard);

  function updateFocusProgress() {
    if (!currentFocusBlock) return;
    const { startedAt, until } = currentFocusBlock;
    const remaining = until - Date.now();
    if (remaining <= 0) { renderFocus(null); return; }
    // Sessions created before the ring was added don't have a known start time.
    if (!Number.isFinite(startedAt) || startedAt >= until) return;
    const percent = Math.min(100, remaining / (until - startedAt) * 100);
    progressRects[1].style.strokeDashoffset = 100 - percent;
    focusProgress.setAttribute('aria-valuenow', Math.ceil(percent));
    focusProgress.setAttribute('aria-valuetext', `${Math.ceil(remaining / 60_000)} minutes remaining`);
    focusProgress.removeAttribute('hidden');
  }
  setInterval(updateFocusProgress, 1000);
  document.addEventListener('visibilitychange', updateFocusProgress);

  function updateFocusChipStates() {
    const selected = C.focusInputDomains(focusInput.value);
    for (const chip of focusChips.querySelectorAll('.focus-chip')) {
      const added = selected.has(chip.dataset.domain);
      chip.classList.toggle('is-added', added);
      chip.disabled = focusActive || added;
      chip.setAttribute('aria-pressed', String(added));
    }
  }

  function renderFrequentDomains(counts) {
    focusDomainCounts = counts && typeof counts === 'object' ? counts : {};
    const top = C.topFocusDomains(focusDomainCounts, 10);
    focusChips.replaceChildren();
    focusFrequent.hidden = top.length === 0;
    for (const { domain, count } of top) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'focus-chip';
      chip.dataset.domain = domain;
      chip.textContent = domain;
      chip.title = `Used ${count} ${count === 1 ? 'time' : 'times'}`;
      chip.addEventListener('click', () => {
        if (focusActive) return;
        focusInput.value = C.appendFocusDomain(focusInput.value, domain);
        updateFocusChipStates();
      });
      focusChips.append(chip);
    }
    updateFocusChipStates();
  }

  function renderFocus(block) {
    focusActive = !!block && block.until > Date.now();
    currentFocusBlock = focusActive ? block : null;
    focusProgress.setAttribute('hidden', '');
    focusInput.disabled = focusDuration.disabled = focusActive;
    if (focusActive) focusInput.value = block.domains.join(', ');
    focusStatus.textContent = focusActive ? `Focus block ends at ${new Date(block.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '';
    focusToggle.textContent = focusActive ? 'End focus block' : 'Start focusing';
    updateFocusChipStates();
    updateFocusProgress();
  }
  focusInput.addEventListener('input', updateFocusChipStates);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.focusBlock) renderFocus(changes.focusBlock.newValue);
    if (changes.focusDomainCounts) renderFrequentDomains(changes.focusDomainCounts.newValue);
  });
  focusToggle.addEventListener('click', async () => {
    focusToggle.disabled = true;
    try {
      const block = focusActive ? await message('endFocusBlock') : await message('startFocusBlock', {
        domains: focusInput.value.split(','), minutes: Number(focusDuration.value)
      });
      renderFocus(block);
    } catch (error) { focusStatus.textContent = error.message; }
    finally { focusToggle.disabled = false; }
  });
  chrome.storage.local.get(['focusBlock', 'focusDomainCounts']).then(({ focusBlock, focusDomainCounts }) => {
    renderFrequentDomains(focusDomainCounts);
    renderFocus(focusBlock);
  });
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
