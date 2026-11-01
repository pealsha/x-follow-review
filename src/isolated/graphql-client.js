(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const HOST_ID = 'x-follow-review-ui-host';
  const LIST_MEMBER_TTL = 24 * 60 * 60 * 1000;
  const BOOKMARK_FULL_SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000;
  const MEDIA_TTL = 30 * 60 * 1000;

  const KEYS = {
    following: 'xFollowReview.following.v1',
    bookmarks: 'xFollowReview.bookmarksByAuthor.v1',
    bookmarkMeta: 'xFollowReview.bookmarkMeta.v1',
    lists: 'xFollowReview.lists.v1',
    memberships: 'xFollowReview.listMemberships.v1',
    memberCache: 'xFollowReview.listMembers.v1',
    indexMeta: 'xFollowReview.listIndexMeta.v1',
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
  let membershipsCache = {};
  let listMembersCache = {};
  let indexMeta = {};
  let bookmarkMeta = {};
  let mediaCache = {};
  let cachesHydrated = false;
  let hydrationPromise = null;
  let listIndexRunning = false;
  let listIndexSignature = '';
  let prefetchTimer = 0;
  const mediaInFlight = new Set();

  let storagePatch = {};
  let storageTimer = 0;
  let storageWriteChain = Promise.resolve();

  function nextId() {
    seq += 1;
    return `xfr-${Date.now()}-${seq}`;
  }

  function canonicalUserKey(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^@/, '');
    return raw ? `@${raw}` : '';
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

  function queueStorage(patch, delay = 280) {
    Object.assign(storagePatch, patch);
    clearTimeout(storageTimer);
    storageTimer = setTimeout(() => void flushStorage(), delay);
  }

  function flushStorage(extraPatch = null) {
    if (extraPatch) Object.assign(storagePatch, extraPatch);
    clearTimeout(storageTimer);
    storageTimer = 0;
    const patch = storagePatch;
    storagePatch = {};
    if (!Object.keys(patch).length) return storageWriteChain;
    storageWriteChain = storageWriteChain.then(() => chrome.storage.local.set(patch)).catch(() => {});
    return storageWriteChain;
  }

  function setStatus(message, stage) {
    queueStorage({
      [KEYS.status]: { message, stage, updatedAt: Date.now(), transport: 'graphql' },
    }, 700);
  }

  function groupBookmarks(source = bookmarks) {
    const byAuthor = {};
    for (const post of source.values()) {
      const key = canonicalUserKey(post.authorKey || post.username);
      if (!key) continue;
      (byAuthor[key] ||= []).push(post);
    }
    return byAuthor;
  }

  function hydrateBookmarkMap(byAuthor) {
    bookmarks.clear();
    if (!byAuthor || typeof byAuthor !== 'object') return;
    for (const posts of Object.values(byAuthor)) {
      if (!Array.isArray(posts)) continue;
      for (const post of posts) {
        if (post?.id) bookmarks.set(String(post.id), post);
      }
    }
  }

  async function hydrateCaches() {
    if (cachesHydrated) return;
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      try {
        const stored = await chrome.storage.local.get(Object.values(KEYS));
        following.clear();
        if (Array.isArray(stored[KEYS.following])) {
          stored[KEYS.following].forEach((user) => following.set(user.id || user.key, user));
        }
        hydrateBookmarkMap(stored[KEYS.bookmarks]);
        bookmarkMeta = stored[KEYS.bookmarkMeta] && typeof stored[KEYS.bookmarkMeta] === 'object' ? stored[KEYS.bookmarkMeta] : {};
        listsCache = Array.isArray(stored[KEYS.lists]) ? stored[KEYS.lists] : [];
        membershipsCache = stored[KEYS.memberships] && typeof stored[KEYS.memberships] === 'object' ? stored[KEYS.memberships] : {};
        listMembersCache = stored[KEYS.memberCache] && typeof stored[KEYS.memberCache] === 'object' ? stored[KEYS.memberCache] : {};
        indexMeta = stored[KEYS.indexMeta] && typeof stored[KEYS.indexMeta] === 'object' ? stored[KEYS.indexMeta] : {};
        mediaCache = stored[KEYS.media] && typeof stored[KEYS.media] === 'object' ? stored[KEYS.media] : {};
      } catch {}
      cachesHydrated = true;
    })().finally(() => { hydrationPromise = null; });
    return hydrationPromise;
  }

  function listIndexKey() {
    const userIds = Array.from(following.values()).map((user) => String(user.id || '')).filter(Boolean).sort();
    const listIds = listsCache.map((list) => String(list.id || '')).filter(Boolean).sort();
    return `${listIds.join(',')}|${userIds.join(',')}`;
  }

  function listCacheFresh(listId) {
    const entry = listMembersCache[String(listId)];
    return Array.isArray(entry?.userIds) && Number(entry.updatedAt || 0) > 0 && Date.now() - Number(entry.updatedAt) < LIST_MEMBER_TTL;
  }

  function allListCachesFresh() {
    return listsCache.length > 0 && listsCache.every((list) => list?.id && listCacheFresh(list.id));
  }

  async function syncListIndex() {
    await hydrateCaches();
    if (listIndexRunning || !following.size || !listsCache.length) return;
    const signature = listIndexKey();
    if (!signature) return;

    if (
      indexMeta.signature === signature &&
      allListCachesFresh() &&
      membershipsCache &&
      Object.keys(membershipsCache).length
    ) {
      listIndexSignature = signature;
      return;
    }
    if (signature === listIndexSignature && allListCachesFresh()) return;

    listIndexRunning = true;
    try {
      const result = await request(
        'sync-list-index',
        {
          users: Array.from(following.values()),
          lists: listsCache,
          memberCache: listMembersCache,
        },
        (message) => {
          if (message.memberships && typeof message.memberships === 'object') {
            membershipsCache = message.memberships;
          }
          if (message.memberCache && typeof message.memberCache === 'object') {
            listMembersCache = { ...listMembersCache, ...message.memberCache };
          }
          queueStorage({
            [KEYS.memberships]: membershipsCache,
            [KEYS.memberCache]: listMembersCache,
          }, 420);
        },
      );

      membershipsCache = result.memberships || membershipsCache;
      listMembersCache = { ...listMembersCache, ...(result.memberCache || {}) };
      indexMeta = { signature, updatedAt: Date.now() };
      listIndexSignature = signature;
      await flushStorage({
        [KEYS.memberships]: membershipsCache,
        [KEYS.memberCache]: listMembersCache,
        [KEYS.indexMeta]: indexMeta,
      });
    } catch {
      // Cached memberships remain usable if X changes or rate-limits ListMembers.
    } finally {
      listIndexRunning = false;
      if (signature !== listIndexKey()) void syncListIndex();
    }
  }

  function bookmarkKnownIds() {
    // Sending every id is still small for normal bookmark collections and lets
    // the page stop at the first previously seen bookmark without a full scan.
    return Array.from(bookmarks.keys()).slice(0, 10000);
  }

  function shouldFullSyncBookmarks() {
    if (!bookmarks.size) return true;
    const lastFull = Number(bookmarkMeta.lastFullSyncAt || 0);
    if (!lastFull) return false;
    return Date.now() - lastFull > BOOKMARK_FULL_SYNC_INTERVAL;
  }

  async function syncBookmarks() {
    await hydrateCaches();
    const fullSync = shouldFullSyncBookmarks();
    const knownIds = fullSync ? [] : bookmarkKnownIds();
    const fresh = new Map();

    try {
      const result = await request('sync-bookmarks', { knownIds, fullSync }, (message) => {
        for (const post of message.items || []) {
          if (!post?.id) continue;
          fresh.set(String(post.id), post);
          bookmarks.set(String(post.id), post);
        }
        if (fresh.size) queueStorage({ [KEYS.bookmarks]: groupBookmarks() }, 360);
      });

      for (const post of result.posts || []) {
        if (!post?.id) continue;
        fresh.set(String(post.id), post);
      }

      if (result.fullSync && result.reachedEnd && (fresh.size || !bookmarks.size)) {
        if (fresh.size || !bookmarks.size) {
          bookmarks.clear();
          for (const [id, post] of fresh) bookmarks.set(id, post);
        }
      } else {
        for (const [id, post] of fresh) bookmarks.set(id, post);
      }

      const now = Date.now();
      bookmarkMeta = {
        ...bookmarkMeta,
        lastSyncAt: now,
        lastFullSyncAt: result.fullSync && result.reachedEnd
          ? now
          : (Number(bookmarkMeta.lastFullSyncAt || 0) || now),
        count: bookmarks.size,
      };
      await flushStorage({
        [KEYS.bookmarks]: groupBookmarks(),
        [KEYS.bookmarkMeta]: bookmarkMeta,
      });
      setStatus(`ブックマーク同期完了: ${bookmarks.size}件`, 'bookmarks-done');
    } catch (error) {
      setStatus(`ブックマーク同期失敗: ${error.message}`, 'error');
    }
  }

  async function syncLists() {
    await hydrateCaches();
    try {
      const result = await request('sync-lists');
      viewerId = result.viewerId || viewerId;
      const freshLists = Array.isArray(result.lists) ? result.lists : [];
      if (freshLists.length || !listsCache.length) listsCache = freshLists;
      await flushStorage({ [KEYS.lists]: listsCache });
      setStatus(`リスト同期完了: ${listsCache.length}件`, 'lists-done');
      void syncListIndex();
      if (lastHandle) void syncDetail(lastHandle);
    } catch (error) {
      setStatus(`リスト同期失敗: ${error.message}`, 'error');
      void syncListIndex();
    }
  }

  function startExtras() {
    if (extrasStarted) return;
    extrasStarted = true;
    void syncBookmarks();
    void syncLists();
  }

  async function startBaseSync() {
    if (baseSyncRunning) return;
    baseSyncRunning = true;
    extrasStarted = false;
    await hydrateCaches();
    setStatus('FollowingをGraphQLで更新中…', 'following');

    const hadCachedFollowing = following.size > 0;
    const freshFollowing = new Map();
    const extrasFallback = setTimeout(startExtras, 1200);

    try {
      const result = await request('sync-following', {}, (message) => {
        for (const user of message.items || []) freshFollowing.set(user.id || user.key, user);
        if (!hadCachedFollowing && freshFollowing.size) {
          queueStorage({ [KEYS.following]: Array.from(freshFollowing.values()) }, 300);
        }
        startExtras();
      });

      const finalUsers = Array.isArray(result.users) ? result.users : [];
      if (finalUsers.length || !following.size) {
        following.clear();
        finalUsers.forEach((user) => following.set(user.id || user.key, user));
        await flushStorage({ [KEYS.following]: Array.from(following.values()) });
      }
      setStatus(`Following取得完了: ${following.size}人`, 'following-done');
      startExtras();
      void syncListIndex();
    } catch (error) {
      setStatus(`Following取得失敗: ${error.message}`, 'error');
      startExtras();
    } finally {
      clearTimeout(extrasFallback);
      baseSyncRunning = false;
    }
  }

  function currentHandle(shadow) {
    return canonicalUserKey(shadow?.querySelector('.xfr-handle')?.textContent || '');
  }

  function mediaFresh(key) {
    const entry = mediaCache[key];
    return Array.isArray(entry?.items) && Number(entry.updatedAt || 0) > 0 && Date.now() - Number(entry.updatedAt) < MEDIA_TTL;
  }

  async function storeMedia(key, items) {
    mediaCache = {
      ...mediaCache,
      [key]: { items: Array.isArray(items) ? items : [], updatedAt: Date.now() },
    };
    await flushStorage({ [KEYS.media]: mediaCache });
  }

  async function prefetchMedia(handle) {
    await hydrateCaches();
    const key = canonicalUserKey(handle);
    const username = key.replace(/^@/, '');
    if (!username || mediaFresh(key) || mediaInFlight.has(key)) return;
    mediaInFlight.add(key);
    try {
      const result = await request('sync-media', { username }, null, 60000);
      await storeMedia(key, result.media || []);
    } catch {
      // Prefetch is opportunistic and should never surface as a user-facing error.
    } finally {
      mediaInFlight.delete(key);
    }
  }

  function scheduleNextPrefetch(handle) {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      const key = canonicalUserKey(handle);
      const users = Array.from(following.values());
      const index = users.findIndex((user) => canonicalUserKey(user.key || user.handle) === key);
      const next = index >= 0 ? users[index + 1] : null;
      if (next && lastHandle === key && lastOpen) void prefetchMedia(next.key || next.handle);
    }, 650);
  }

  async function syncDetail(handle) {
    await hydrateCaches();
    const key = canonicalUserKey(handle);
    const username = key.replace(/^@/, '');
    if (!username) return;

    const hasMembership = Object.prototype.hasOwnProperty.call(membershipsCache, key);
    if (mediaFresh(key) && hasMembership) {
      scheduleNextPrefetch(key);
      return;
    }
    if (mediaInFlight.has(key)) return;

    mediaInFlight.add(key);
    try {
      const result = await request('sync-detail', { username, viewerId });
      mediaCache = {
        ...mediaCache,
        [key]: { items: result.media || [], updatedAt: Date.now() },
      };
      membershipsCache = {
        ...membershipsCache,
        [key]: result.lists || membershipsCache[key] || [],
      };
      await flushStorage({
        [KEYS.media]: mediaCache,
        [KEYS.memberships]: membershipsCache,
      });
    } catch (error) {
      setStatus(`@${username} の詳細取得失敗: ${error.message}`, 'detail-error');
    } finally {
      mediaInFlight.delete(key);
      scheduleNextPrefetch(key);
    }
  }

  async function invalidateListCache(listId) {
    await hydrateCaches();
    const key = String(listId || '');
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(listMembersCache, key)) {
      listMembersCache = { ...listMembersCache };
      delete listMembersCache[key];
    }
    indexMeta = {};
    listIndexSignature = '';
    await flushStorage({
      [KEYS.memberCache]: listMembersCache,
      [KEYS.indexMeta]: indexMeta,
    });
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
    if (message.ok && message.result?.invalidateListId) {
      void invalidateListCache(message.result.invalidateListId);
    }

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
      }
    }
    if (KEYS.bookmarks in changes) hydrateBookmarkMap(changes[KEYS.bookmarks].newValue);
    if (KEYS.bookmarkMeta in changes) bookmarkMeta = changes[KEYS.bookmarkMeta].newValue || {};
    if (KEYS.lists in changes) listsCache = Array.isArray(changes[KEYS.lists].newValue) ? changes[KEYS.lists].newValue : [];
    if (KEYS.memberships in changes) membershipsCache = changes[KEYS.memberships].newValue || {};
    if (KEYS.memberCache in changes) listMembersCache = changes[KEYS.memberCache].newValue || {};
    if (KEYS.indexMeta in changes) indexMeta = changes[KEYS.indexMeta].newValue || {};
    if (KEYS.media in changes) mediaCache = changes[KEYS.media].newValue || {};

    if ((KEYS.following in changes || KEYS.lists in changes) && lastOpen) void syncListIndex();
  });

  const pageObserver = new MutationObserver(() => {
    const host = document.getElementById(HOST_ID);
    if (host) attach(host);
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  void hydrateCaches();
  const existing = document.getElementById(HOST_ID);
  if (existing) attach(existing);
})();
