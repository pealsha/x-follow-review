(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const BOOKMARKS_KEY = 'xFollowReview.bookmarksByAuthor.v1';
  const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';
  const MEDIA_KEY = 'xFollowReview.mediaByAuthor.v1';
  const SYNC_STATUS_KEY = 'xFollowReview.syncStatus.v1';

  let attachedShadow = null;
  let lastHandle = '';
  let lastOpen = false;
  let autoCollectRunning = false;
  let originalScrollY = 0;

  function safeSend(message) {
    try {
      const pending = chrome.runtime.sendMessage(message);
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {}
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function autoCollectFollowing() {
    if (autoCollectRunning) return;
    autoCollectRunning = true;
    originalScrollY = window.scrollY;
    let stable = 0;
    let lastHeight = 0;

    try {
      for (let round = 0; round < 350; round += 1) {
        const height = document.documentElement.scrollHeight;
        const atBottom = window.scrollY + window.innerHeight >= height - 160;
        if (height === lastHeight && atBottom) stable += 1;
        else stable = 0;
        if (stable >= 7) break;
        lastHeight = height;
        window.scrollTo({ top: height, behavior: 'auto' });
        await sleep(650);
      }
    } finally {
      window.scrollTo({ top: originalScrollY, behavior: 'auto' });
      autoCollectRunning = false;
    }
  }

  function currentHandle(shadow) {
    return (shadow.querySelector('.xfr-handle')?.textContent || '').trim().toLowerCase();
  }

  function currentUsername(shadow) {
    const handle = currentHandle(shadow);
    return handle.startsWith('@') ? handle.slice(1) : handle;
  }

  async function loadCaches(handle) {
    if (!handle) return null;
    try {
      const stored = await chrome.storage.local.get([BOOKMARKS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY]);
      return {
        bookmarks: stored[BOOKMARKS_KEY]?.[handle] || [],
        lists: stored[LIST_MEMBERSHIP_KEY]?.[handle] || [],
        media: stored[MEDIA_KEY]?.[handle]?.items || [],
        mediaUpdatedAt: stored[MEDIA_KEY]?.[handle]?.updatedAt || 0,
        syncStatus: stored[SYNC_STATUS_KEY] || {},
      };
    } catch {
      return null;
    }
  }

  function findSection(shadow, needle) {
    return Array.from(shadow.querySelectorAll('.xfr-section')).find((section) =>
      (section.querySelector('.xfr-section-title')?.textContent || '').includes(needle)
    );
  }

  function setSectionNote(section, text) {
    const note = section?.querySelector('.xfr-section-note');
    if (note) note.textContent = text;
  }

  function renderMediaGrid(section, items, updatedAt) {
    const grid = section?.querySelector('.xfr-media-grid');
    if (!grid) return;

    if (!updatedAt) {
      setSectionNote(section, '自動取得中…');
      return;
    }

    setSectionNote(section, items?.length ? `${items.length}件取得済み` : 'メディア投稿なし');
    if (!items?.length) {
      grid.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'xfr-media-placeholder';
      empty.textContent = 'なし';
      grid.append(empty);
      return;
    }

    grid.replaceChildren();
    items.slice(0, 6).forEach((item) => {
      const link = document.createElement('a');
      link.href = item.postUrl || item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.display = 'block';
      link.style.aspectRatio = '1';
      link.style.overflow = 'hidden';
      link.style.background = 'var(--xfr-placeholder-bg, #eff3f4)';

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

  function renderBookmarks(section, posts, syncStatus) {
    const grid = section?.querySelector('.xfr-bookmarks-placeholder');
    if (!grid) return;

    const bookmarksFinished = syncStatus?.stage === 'bookmarks-done' || syncStatus?.stage === 'lists' || syncStatus?.stage === 'list-members' || syncStatus?.stage === 'lists-done';
    setSectionNote(section, bookmarksFinished ? `${posts?.length || 0}件` : '自動同期中…');

    if (!posts?.length) {
      if (!bookmarksFinished) return;
      grid.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'xfr-bookmark-tile';
      empty.style.display = 'grid';
      empty.style.placeItems = 'center';
      empty.style.color = 'var(--xfr-muted, #536471)';
      empty.textContent = 'なし';
      grid.append(empty);
      return;
    }

    grid.replaceChildren();
    posts.slice(0, 6).forEach((post) => {
      const media = post.media?.[0];
      const link = document.createElement('a');
      link.href = post.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.display = 'block';
      link.style.aspectRatio = '4 / 3';
      link.style.borderRadius = '12px';
      link.style.overflow = 'hidden';
      link.style.border = '1px solid var(--xfr-border, #eff3f4)';
      link.style.background = 'var(--xfr-placeholder-bg, #eff3f4)';
      link.title = post.text || 'ブックマークした投稿';

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
        text.style.lineHeight = '1.35';
        text.style.color = 'var(--xfr-fg, inherit)';
        link.append(text);
      }
      grid.append(link);
    });
  }

  function updateSummary(shadow, cache) {
    const chips = Array.from(shadow.querySelectorAll('.xfr-summary .xfr-chip'));
    if (!chips.length) return;

    const listChip = chips.find((chip) => /リスト/.test(chip.textContent || '')) || chips[0];
    const bookmarkChip = chips.find((chip) => /ブックマーク|★/.test(chip.textContent || '')) || chips[1];

    if (listChip) {
      const names = cache.lists.map((list) => list.name).filter(Boolean);
      const listsFinished = cache.syncStatus?.stage === 'lists-done';
      listChip.textContent = names.length
        ? `リスト: ${names.slice(0, 3).join(' / ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`
        : listsFinished ? 'リスト: なし' : 'リスト: 同期中…';
    }
    if (bookmarkChip) bookmarkChip.textContent = `★ ブックマーク ${cache.bookmarks.length}件`;
  }

  async function refreshUi(shadow) {
    const handle = currentHandle(shadow);
    if (!handle) return;
    const cache = await loadCaches(handle);
    if (!cache) return;

    updateSummary(shadow, cache);
    renderMediaGrid(findSection(shadow, '最近の画像・動画'), cache.media, cache.mediaUpdatedAt);
    renderBookmarks(findSection(shadow, 'ブックマーク'), cache.bookmarks, cache.syncStatus);

    const status = shadow.querySelector('.xfr-status');
    if (status && cache.syncStatus?.message) {
      if (!status.dataset.xfrBase) status.dataset.xfrBase = status.textContent || '';
      status.textContent = `${status.dataset.xfrBase} / ${cache.syncStatus.message}`;
    }
  }

  function prefetchCurrent(shadow) {
    const username = currentUsername(shadow);
    if (!username) return;
    safeSend({ type: 'XFR_MEDIA_PREFETCH', usernames: [username], origin: location.origin });
  }

  function startAutomaticSync(shadow) {
    safeSend({ type: 'XFR_AUTO_SYNC_START', origin: location.origin });
    void autoCollectFollowing();
    prefetchCurrent(shadow);
    void refreshUi(shadow);
  }

  function attach(host) {
    const shadow = host.shadowRoot;
    if (!shadow || shadow === attachedShadow) return;
    attachedShadow = shadow;

    shadow.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button');
      if (!button) return;
      if ((button.textContent || '').includes('Review Mode')) {
        setTimeout(() => startAutomaticSync(shadow), 0);
      }
    }, true);

    const observer = new MutationObserver(() => {
      const shell = shadow.querySelector('.xfr-shell');
      const open = shell?.dataset.open === 'true';
      const handle = currentHandle(shadow);

      if (open && !lastOpen) startAutomaticSync(shadow);
      if (open && handle && handle !== lastHandle) {
        lastHandle = handle;
        prefetchCurrent(shadow);
        void refreshUi(shadow);
      }
      lastOpen = open;
    });
    observer.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !attachedShadow) return;
    if ([BOOKMARKS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY].some((key) => key in changes)) {
      void refreshUi(attachedShadow);
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
