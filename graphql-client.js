(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const HOST_ID = 'x-follow-review-ui-host';
  const FOLLOWING_KEY = 'xFollowReview.following.v1';
  const BOOKMARKS_KEY = 'xFollowReview.bookmarksByAuthor.v1';
  const LISTS_KEY = 'xFollowReview.lists.v1';
  const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';
  const MEDIA_KEY = 'xFollowReview.mediaByAuthor.v1';
  const SYNC_STATUS_KEY = 'xFollowReview.syncStatus.v1';

  const pending = new Map();
  let seq = 0;
  let attachedShadow = null;
  let lastHandle = '';
  let lastOpen = false;
  let baseSyncRunning = false;
  let viewerId = '';
  let extrasStarted = false;

  const following = new Map();
  const bookmarks = new Map();

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
      pending.set(id, { resolve, reject, onProgress, timer, action });
      window.postMessage({ marker: MARKER, type: 'request', id, action, payload }, '*');
    });
  }

  async function setStatus(message, stage, extra = {}) {
    try {
      await chrome.storage.local.set({
        [SYNC_STATUS_KEY]: { message, stage, updatedAt: Date.now(), transport: 'graphql', ...extra },
      });
    } catch {}
  }

  async function storeFollowing() {
    try {
      const users = Array.from(following.values());
      await chrome.storage.local.set({ [FOLLOWING_KEY]: users });
      window.dispatchEvent(new CustomEvent('xfr:following-updated', { detail: { users } }));
    } catch {}
  }

  async function storeBookmarks() {
    const byAuthor = {};
    for (const post of bookmarks.values()) {
      const key = String(post.authorKey || '').toLowerCase();
      if (!key) continue;
      (byAuthor[key] ||= []).push(post);
    }
    try { await chrome.storage.local.set({ [BOOKMARKS_KEY]: byAuthor }); } catch {}
  }

  function startExtras() {
    if (extrasStarted) return;
    extrasStarted = true;

    void request('sync-bookmarks', {}, (message) => {
      for (const post of message.items || []) bookmarks.set(post.id, post);
      void storeBookmarks();
      void setStatus(`ブックマークをGraphQLで同期中: ${message.total || bookmarks.size}件`, 'bookmarks');
    }).then(async (result) => {
      for (const post of result.posts || []) bookmarks.set(post.id, post);
      await storeBookmarks();
      await setStatus(`ブックマーク同期完了: ${bookmarks.size}件`, 'bookmarks-done');
    }).catch((error) => void setStatus(`ブックマーク同期失敗: ${error.message}`, 'error'));

    void request('sync-lists').then(async (result) => {
      viewerId = result.viewerId || viewerId;
      await chrome.storage.local.set({ [LISTS_KEY]: result.lists || [] });
      await setStatus(`リスト同期完了: ${(result.lists || []).length}件`, 'lists-done');
      if (attachedShadow && lastHandle) void syncDetail(lastHandle);
    }).catch((error) => void setStatus(`リスト同期失敗: ${error.message}`, 'error'));
  }

  async function startBaseSync() {
    if (baseSyncRunning) return;
    baseSyncRunning = true;
    extrasStarted = false;
    following.clear();
    bookmarks.clear();
    await setStatus('FollowingをGraphQLで取得中…', 'following');

    const extrasFallback = setTimeout(startExtras, 1800);
    try {
      const result = await request('sync-following', {}, (message) => {
        for (const user of message.items || []) following.set(user.id || user.key, user);
        void storeFollowing();
        void setStatus(`FollowingをGraphQLで取得中: ${message.total || following.size}人`, 'following');
        startExtras();
      });
      for (const user of result.users || []) following.set(user.id || user.key, user);
      await storeFollowing();
      await setStatus(`Following取得完了: ${following.size}人`, 'following-done');
      startExtras();
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
      const stored = await chrome.storage.local.get([MEDIA_KEY, LIST_MEMBERSHIP_KEY]);
      const media = stored[MEDIA_KEY] && typeof stored[MEDIA_KEY] === 'object' ? stored[MEDIA_KEY] : {};
      const memberships = stored[LIST_MEMBERSHIP_KEY] && typeof stored[LIST_MEMBERSHIP_KEY] === 'object' ? stored[LIST_MEMBERSHIP_KEY] : {};
      media[key] = { items: result.media || [], updatedAt: Date.now() };
      memberships[key] = result.lists || [];
      await chrome.storage.local.set({ [MEDIA_KEY]: media, [LIST_MEMBERSHIP_KEY]: memberships });
      await refreshUi(attachedShadow);
    } catch (error) {
      await setStatus(`@${username} の詳細取得失敗: ${error.message}`, 'detail-error');
    }
  }

  async function loadCache(handle) {
    if (!handle) return null;
    try {
      const stored = await chrome.storage.local.get([BOOKMARKS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY]);
      return {
        bookmarks: stored[BOOKMARKS_KEY]?.[handle] || [],
        lists: stored[LIST_MEMBERSHIP_KEY]?.[handle] || [],
        media: stored[MEDIA_KEY]?.[handle]?.items || [],
        mediaUpdatedAt: stored[MEDIA_KEY]?.[handle]?.updatedAt || 0,
        status: stored[SYNC_STATUS_KEY] || {},
      };
    } catch {
      return null;
    }
  }

  function findSection(shadow, title) {
    return Array.from(shadow?.querySelectorAll('.xfr-section') || []).find((section) =>
      (section.querySelector('.xfr-section-title')?.textContent || '').includes(title)
    );
  }

  function setNote(section, value) {
    const note = section?.querySelector('.xfr-section-note');
    if (note) note.textContent = value;
  }

  function renderMedia(section, items, updatedAt) {
    const grid = section?.querySelector('.xfr-media-grid');
    if (!grid) return;
    if (!updatedAt) {
      setNote(section, '選択時にGraphQLで取得');
      return;
    }
    setNote(section, items.length ? `${items.length}件` : 'なし');
    grid.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'xfr-media-placeholder';
      empty.textContent = 'なし';
      grid.append(empty);
      return;
    }
    items.slice(0, 12).forEach((item) => {
      const link = document.createElement('a');
      link.href = item.postUrl || item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.display = 'block';
      link.style.aspectRatio = '1';
      link.style.overflow = 'hidden';
      const image = document.createElement('img');
      image.src = item.url;
      image.alt = item.type === 'video' ? '動画' : '画像';
      image.loading = 'lazy';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.objectFit = 'cover';
      link.append(image);
      grid.append(link);
    });
  }

  function renderBookmarks(section, posts) {
    const grid = section?.querySelector('.xfr-bookmarks-placeholder');
    if (!grid) return;
    setNote(section, `${posts.length}件`);
    grid.replaceChildren();
    if (!posts.length) {
      const empty = document.createElement('div');
      empty.className = 'xfr-bookmark-tile';
      empty.textContent = 'なし';
      empty.style.display = 'grid';
      empty.style.placeItems = 'center';
      grid.append(empty);
      return;
    }
    posts.slice(0, 12).forEach((post) => {
      const link = document.createElement('a');
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'xfr-bookmark-tile';
      link.title = post.text || 'ブックマークした投稿';
      link.style.display = 'block';
      link.style.overflow = 'hidden';
      const media = post.media?.[0];
      if (media?.url) {
        const image = document.createElement('img');
        image.src = media.url;
        image.alt = '';
        image.loading = 'lazy';
        image.style.width = '100%';
        image.style.height = '100%';
        image.style.objectFit = 'cover';
        link.append(image);
      } else {
        const text = document.createElement('div');
        text.textContent = post.text || '投稿を開く';
        text.style.padding = '8px';
        text.style.fontSize = '11px';
        link.append(text);
      }
      grid.append(link);
    });
  }

  async function refreshUi(shadow) {
    const handle = currentHandle(shadow);
    if (!handle) return;
    const cache = await loadCache(handle);
    if (!cache) return;
    const chips = Array.from(shadow.querySelectorAll('.xfr-summary .xfr-chip'));
    const listChip = chips.find((chip) => /リスト/.test(chip.textContent || ''));
    const bookmarkChip = chips.find((chip) => /ブックマーク|★/.test(chip.textContent || ''));
    if (listChip) {
      const names = cache.lists.map((list) => list.name).filter(Boolean);
      listChip.textContent = names.length ? `リスト: ${names.join(' / ')}` : 'リスト: なし';
    }
    if (bookmarkChip) bookmarkChip.textContent = `★ ブックマーク ${cache.bookmarks.length}件`;
    renderMedia(findSection(shadow, '最近の画像・動画'), cache.media, cache.mediaUpdatedAt);
    renderBookmarks(findSection(shadow, 'ブックマーク'), cache.bookmarks);
    const status = shadow.querySelector('.xfr-status');
    if (status && cache.status.message) status.textContent = `${cache.status.message} / 通信: GraphQL直接`;
  }

  function attach(host) {
    const shadow = host.shadowRoot;
    if (!shadow || shadow === attachedShadow) return;
    attachedShadow = shadow;

    shadow.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (button && (button.textContent || '').includes('Review Mode')) setTimeout(() => void startBaseSync(), 0);
    }, true);

    const observer = new MutationObserver(() => {
      const shell = shadow.querySelector('.xfr-shell');
      const open = shell?.dataset.open === 'true';
      const handle = currentHandle(shadow);
      if (open && !lastOpen) void startBaseSync();
      if (open && handle && handle !== lastHandle) {
        lastHandle = handle;
        void syncDetail(handle);
        void refreshUi(shadow);
      }
      lastOpen = open;
    });
    observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER) return;
    if (message.type === 'progress') {
      const job = pending.get(message.id);
      job?.onProgress?.(message);
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
    if (area !== 'local' || !attachedShadow) return;
    if ([BOOKMARKS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY].some((key) => key in changes)) void refreshUi(attachedShadow);
  });

  const pageObserver = new MutationObserver(() => {
    const host = document.getElementById(HOST_ID);
    if (host) attach(host);
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  const existing = document.getElementById(HOST_ID);
  if (existing) attach(existing);
})();
