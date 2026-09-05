(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const FOLLOWING_KEY = 'xFollowReview.following.v1';
  const users = new Map();
  let shadow = null;
  let observer = null;
  let frame = 0;

  function canonical(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^@/, '');
    return raw ? `@${raw}` : '';
  }

  function loadUsers(list) {
    users.clear();
    for (const user of Array.isArray(list) ? list : []) {
      const key = canonical(user?.key || user?.handle || user?.username);
      if (key) users.set(key, user);
    }
  }

  function relationText(user) {
    if (user?.followsYou === true) return 'フォローされています';
    if (user?.followsYou === false) return '被フォローなし';
    return '';
  }

  function arrangeMeta(container, chip, column) {
    if (!container || !chip) return;
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${column}, max-content)`;
    container.style.justifyContent = 'start';
    container.style.columnGap = '6px';
    container.style.direction = 'ltr';
    chip.style.gridColumn = String(column);
    chip.style.gridRow = '1';
  }

  function upsertChip(container, user, compact) {
    if (!container) return;
    const text = relationText(user);
    let chip = container.querySelector('[data-xfr-followback="true"]');
    if (!text) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('span');
      chip.dataset.xfrFollowback = 'true';
      chip.className = compact ? 'xfr-mini-chip' : 'xfr-chip';
      container.append(chip);
    }
    chip.textContent = text;
    arrangeMeta(container, chip, 3);
  }

  function patch() {
    if (!shadow) return;
    for (const row of shadow.querySelectorAll('.xfr-user-row')) {
      const key = canonical(row.querySelector('.xfr-list-handle')?.textContent || '');
      if (!key) continue;
      upsertChip(row.querySelector('.xfr-row-meta'), users.get(key), true);
    }

    const key = canonical(shadow.querySelector('.xfr-detail-pane .xfr-handle')?.textContent || '');
    if (key) upsertChip(shadow.querySelector('.xfr-summary'), users.get(key), false);
  }

  function schedule() {
    if (frame || !shadow) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      patch();
    });
  }

  async function refreshUsers() {
    try {
      const stored = await chrome.storage.local.get(FOLLOWING_KEY);
      loadUsers(stored[FOLLOWING_KEY]);
      schedule();
    } catch {}
  }

  function attach() {
    const next = document.getElementById(HOST_ID)?.shadowRoot;
    if (!next || next === shadow) return;
    observer?.disconnect();
    shadow = next;
    observer = new MutationObserver(schedule);
    observer.observe(shadow, { childList: true, subtree: true });
    schedule();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(FOLLOWING_KEY in changes)) return;
    loadUsers(changes[FOLLOWING_KEY].newValue);
    schedule();
  });

  const pageObserver = new MutationObserver(attach);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  void refreshUsers();
  attach();
})();
