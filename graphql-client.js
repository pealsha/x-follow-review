(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const HOST_ID = 'x-follow-review-ui-host';

  const KEYS = {
    following: 'xFollowReview.following.v1',
    bookmarks: 'xFollowReview.bookmarksByAuthor.v1',
    lists: 'xFollowReview.lists.v1',
    memberships: 'xFollowReview.listMemberships.v1',
    media: 'xFollowReview.mediaByAuthor.v1',
    status: 'xFollowReview.syncStatus.v1',
  };

  const pending = new Map();
  const following = new Map();
  const bookmarks = new Map();

  let seq = 0;
  let attachedShadow = null;
  let lastOpen = false;
  let lastHandle = '';
  let baseSyncRunning = false;
  let extrasStarted = false;
  let viewerId = '';
  let listsCache = [];
  let listIndexRunning = false;
  let listIndexSignature = '';

  function nextId() {
    seq += 1;
    return `xfr-${Date.now()}-${seq}`;
  }

  function request(action, payload = {}, onProgress = null, timeoutMs = 10 * 60 * 1000) {
    const id = nextId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${action} timed out`));
      }, timeoutMs);
      pending.set(id, { action, resolve, reject, onProgress, timer });
      window.postMessage({ marker: MARKER, type: 'request', id, action, payload }, '*');
    });
  }

  async function setStatus(message, stage) {
    try {
      await chrome.storage.local.set({
        [KEYS.status]: { message, stage, updatedAt: Date.now(), transport: 'graphql' },
      });
    } catch {}
  }

  async function saveFollowing() {
    try {
      await chrome.storage.local.set({ [KEYS.following]: Array.from(following.values()) });
    } catch {}
  }

  async function saveBookmarks() {
    const byAuthor = {};
    for (const post of bookmarks.values()) {
      const key = String(post.authorKey || '').toLowerCase();
      if (!key) continue;
      (byAuthor[key] ||= []).push(post);
    }
    try { await chrome.storage.local.set({ [KEYS.bookmarks]: byAuthor }); } catch {}
  }

  function listIndexKey() {
    const userIds = Array.from(following.values()).map((user) => String(user.id || '')).filter(Boolean).sort();
    const listIds = listsCache.map((list) => String(list.id || '')).filter(Boolean).sort();
    return `${listIds.join(',')}|${userIds.join(',')}`;
  }

  async function syncListIndex() {
    if (listIndexRunning || !following.size || !listsCache.length) return;
    const signature = listIndexKey();
    if (!signature || signature === listIndexSignature) return;

    listIndexRunning = true;
    try {
      const persist = async (memberships) => {
        if (!memberships || typeof memberships !== 'object') return;
        try { await chrome.storage.local.set({ [KEYS.memberships]: memberships }); } catch {}
      };

      const result = await request(
        'sync-list-index',
        { users: Array.from(following.values()), lists: listsCache },
        (message) => void persist(message.memberships),
      );
      await persist(result.memberships || {});
      listIndexSignature = signature;
    } catch {
      // Per-user detail lookup remains a fallback; global indexing must not block Review Mode.
    } finally {
      listIndexRunning = false;
      if (signature !== listIndexKey()) void syncListIndex();
    }
  }

  function startExtras() {
    if (extrasStarted) return;
    extrasStarted = true;

    void request('sync-bookmarks', {}, (message) => {
      for (const post of message.items || []) bookmarks.set(post.id, post);
      void saveBookmarks();
    }).then(async (result) => {
      for (const post of result.posts || []) bookmarks.set(post.id, post);
      await saveBookmarks();
      await setStatus(`ブックマーク同期完了: ${bookmarks.size}件`, 'bookmarks-done');
    }).catch((error) => void setStatus(`ブックマーク同期失敗: ${error.message}`, 'error'));

    void request('sync-lists').then(async (result) => {
      viewerId = result.viewerId || viewerId;
      listsCache = Array.isArray(result.lists) ? result.lists : [];
      await chrome.storage.local.set({ [KEYS.lists]: listsCache });
      await setStatus(`リスト同期完了: ${listsCache.length}件`, 'lists-done');
      void syncListIndex();
      if (lastHandle) void syncDetail(lastHandle);
    }).catch((error) => void setStatus(`リスト同期失敗: ${error.message}`, 'error'));
  }

  async function startBaseSync() {
    if (baseSyncRunning) return;
    baseSyncRunning = true;
    extrasStarted = false;
    following.clear();
    bookmarks.clear();
    listsCache = [];
    listIndexSignature = '';
    await setStatus('FollowingをGraphQLで取得中…', 'following');

    const extrasFallback = setTimeout(startExtras, 1800);
    try {
      const result = await request('sync-following', {}, (message) => {
        for (const user of message.items || []) following.set(user.id || user.key, user);
        void saveFollowing();
        startExtras();
      });
      for (const user of result.users || []) following.set(user.id || user.key, user);
      await saveFollowing();
      await setStatus(`Following取得完了: ${following.size}人`, 'following-done');
      startExtras();
      void syncListIndex();
    } catch (error) {
      await setStatus(`Following取得失敗: ${error.message}`, 'error');
      startExtras();
    } finally {
      clearTimeout(extrasFallback);
      baseSyncRunning = false;
    }
  }

  function currentHandle(shadow) {
    return (shadow?.querySelector('.xfr-handle')?.textContent || '').trim().toLowerCase();
  }

  async function syncDetail(handle) {
    const username = String(handle || '').replace(/^@/, '');
    if (!username) return;
    try {
      const result = await request('sync-detail', { username, viewerId });
      const key = `@${username}`.toLowerCase();
      const stored = await chrome.storage.local.get([KEYS.media, KEYS.memberships]);
      const media = stored[KEYS.media] && typeof stored[KEYS.media] === 'object' ? stored[KEYS.media] : {};
      const memberships = stored[KEYS.memberships] && typeof stored[KEYS.memberships] === 'object' ? stored[KEYS.memberships] : {};
      media[key] = { items: result.media || [], updatedAt: Date.now() };
      memberships[key] = result.lists || memberships[key] || [];
      await chrome.storage.local.set({ [KEYS.media]: media, [KEYS.memberships]: memberships });
    } catch (error) {
      await setStatus(`@${username} の詳細取得失敗: ${error.message}`, 'detail-error');
    }
  }

  function attach(host) {
    const shadow = host.shadowRoot;
    if (!shadow || shadow === attachedShadow) return;
    attachedShadow = shadow;

    shadow.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (button && (button.textContent || '').includes('Review Mode')) {
        setTimeout(() => void startBaseSync(), 0);
      }
    }, true);

    const observer = new MutationObserver(() => {
      const shell = shadow.querySelector('.xfr-shell');
      const open = shell?.dataset.open === 'true';
      const handle = currentHandle(shadow);

      if (open && !lastOpen) void startBaseSync();
      if (open && handle && handle !== lastHandle) {
        lastHandle = handle;
        void syncDetail(handle);
      }
      lastOpen = open;
    });
    observer.observe(shadow, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-open'],
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER) return;

    if (message.type === 'progress') {
      pending.get(message.id)?.onProgress?.(message);
      return;
    }

    if (message.type !== 'response') return;
    const job = pending.get(message.id);
    if (!job) return;
    clearTimeout(job.timer);
    pending.delete(message.id);
    if (message.ok) job.resolve(message.result);
    else job.reject(new Error(message.error || `${job.action} failed`));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (KEYS.following in changes) {
      const users = changes[KEYS.following].newValue;
      if (Array.isArray(users)) {
        following.clear();
        users.forEach((user) => following.set(user.id || user.key, user));
        void syncListIndex();
      }
    }
    if (KEYS.lists in changes) {
      listsCache = Array.isArray(changes[KEYS.lists].newValue) ? changes[KEYS.lists].newValue : [];
      void syncListIndex();
    }
  });

  const pageObserver = new MutationObserver(() => {
    const host = document.getElementById(HOST_ID);
    if (host) attach(host);
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  const existing = document.getElementById(HOST_ID);
  if (existing) attach(existing);
})();
