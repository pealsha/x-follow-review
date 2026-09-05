(() => {
  const MARKER = 'X_FOLLOW_REVIEW_LIST_INDEX_V1';
  const HOST_ID = 'x-follow-review-ui-host';
  const FOLLOWING_KEY = 'xFollowReview.following.v1';
  const LISTS_KEY = 'xFollowReview.lists.v1';
  const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';

  let seq = 0;
  let running = false;
  let runningSignature = '';
  let completedSignature = '';
  let attachedShadow = null;
  let timer = 0;
  const pending = new Map();

  function nextId() {
    seq += 1;
    return `xfr-list-index-${Date.now()}-${seq}`;
  }

  function isReviewOpen() {
    const host = document.getElementById(HOST_ID);
    const shell = host?.shadowRoot?.querySelector('.xfr-shell');
    return shell?.dataset.open === 'true';
  }

  function signatureFor(users, lists) {
    const userIds = users.map((user) => String(user?.id || '')).filter(Boolean).sort();
    const listIds = lists.map((list) => String(list?.id || '')).filter(Boolean).sort();
    return `${listIds.join(',')}|${userIds.join(',')}`;
  }

  function request(users, lists) {
    const id = nextId();
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        pending.delete(id);
        reject(new Error('list index timed out'));
      }, 10 * 60 * 1000);
      pending.set(id, { resolve, reject, timerId });
      window.postMessage({
        marker: MARKER,
        type: 'request',
        id,
        action: 'sync-list-index',
        payload: { users, lists },
      }, '*');
    });
  }

  async function persist(memberships) {
    if (!memberships || typeof memberships !== 'object') return;
    try {
      await chrome.storage.local.set({ [LIST_MEMBERSHIP_KEY]: memberships });
    } catch {}
  }

  async function maybeStart() {
    if (running || !isReviewOpen()) return;
    let stored;
    try {
      stored = await chrome.storage.local.get([FOLLOWING_KEY, LISTS_KEY]);
    } catch {
      return;
    }

    const users = Array.isArray(stored[FOLLOWING_KEY]) ? stored[FOLLOWING_KEY] : [];
    const lists = Array.isArray(stored[LISTS_KEY]) ? stored[LISTS_KEY] : [];
    if (!users.length || !lists.length) return;

    const signature = signatureFor(users, lists);
    if (!signature || signature === completedSignature || signature === runningSignature) return;

    running = true;
    runningSignature = signature;
    try {
      const result = await request(users, lists);
      await persist(result?.memberships || {});
      completedSignature = signature;
    } catch {
      // Detail-time lookup remains available as a fallback, so a global index
      // failure must not block Review Mode.
    } finally {
      running = false;
      runningSignature = '';
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void maybeStart(), 120);
  }

  function attachShadow() {
    const host = document.getElementById(HOST_ID);
    const shadow = host?.shadowRoot;
    if (!shadow || shadow === attachedShadow) return;
    attachedShadow = shadow;
    const observer = new MutationObserver(schedule);
    observer.observe(shadow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-open'],
    });
    schedule();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER) return;

    if (message.type === 'progress') {
      if (pending.has(message.id)) void persist(message.memberships || {});
      return;
    }

    if (message.type !== 'response') return;
    const job = pending.get(message.id);
    if (!job) return;
    clearTimeout(job.timerId);
    pending.delete(message.id);
    if (message.ok) job.resolve(message.result);
    else job.reject(new Error(message.error || 'list index failed'));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (FOLLOWING_KEY in changes || LISTS_KEY in changes) schedule();
  });

  const pageObserver = new MutationObserver(() => {
    attachShadow();
    schedule();
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  attachShadow();
})();
