(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const STYLE_ID = 'xfr-ui-polish-style';
  const BOOKMARKS_KEY = 'xFollowReview.bookmarksByAuthor.v1';
  const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';
  let currentShadow = null;
  let observer = null;
  let boundList = null;
  let boundSearch = null;
  let listScrollTop = 0;
  let lastSearchValue = '';
  let bookmarkCounts = {};
  let membershipCounts = {};

  const css = `
    /* The workspace itself never scrolls the X page. Each review pane owns its
       own scroll area instead. */
    .xfr-workspace,
    .xfr-main,
    .xfr-list-pane,
    .xfr-detail-pane,
    .xfr-detail-grid,
    .xfr-primary-detail,
    .xfr-side-detail {
      min-height: 0;
    }

    .xfr-main {
      overflow: hidden;
    }

    /* Left side: search stays visible, the Following list alone scrolls. */
    .xfr-list-pane {
      overflow: hidden;
    }

    .xfr-user-list {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      touch-action: pan-y;
    }

    /* Right side: keep the profile and summary visible while the useful
       content below them scrolls. */
    .xfr-detail-pane {
      overflow: hidden;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }

    .xfr-profile {
      position: relative;
      z-index: 2;
      background: var(--xfr-bg);
    }

    .xfr-summary {
      position: relative;
      z-index: 2;
      background: var(--xfr-bg);
    }

    .xfr-detail-grid {
      min-height: 0;
      height: 100%;
      overflow: hidden;
      align-items: stretch;
    }

    .xfr-primary-detail,
    .xfr-side-detail {
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      touch-action: pan-y;
    }

    /* Bookmarks must be reachable even when the media grid is tall. */
    .xfr-bookmarks-placeholder {
      padding-bottom: 18px;
    }

    /* Profile identity behaves like X's own profile links. */
    a.xfr-name,
    a.xfr-handle {
      text-decoration: none;
      cursor: pointer;
    }

    a.xfr-name {
      color: var(--xfr-fg);
    }

    a.xfr-handle {
      color: var(--xfr-muted);
    }

    a.xfr-name:hover,
    a.xfr-handle:hover {
      text-decoration: underline;
    }

    /* Sync internals are development information, not part of the review UX. */
    .xfr-status {
      display: none !important;
    }

    .xfr-topbar > button:last-child {
      margin-left: auto;
    }

    @media (max-width: 1050px) {
      .xfr-detail-pane {
        overflow-y: auto;
        display: block;
        overscroll-behavior: contain;
      }

      .xfr-primary-detail,
      .xfr-side-detail {
        overflow: visible;
        max-height: none;
      }

      .xfr-detail-grid {
        overflow: visible;
        height: auto;
      }
    }
  `;

  function removeSyncSection(shadow) {
    for (const section of shadow.querySelectorAll('.xfr-section')) {
      const title = section.querySelector('.xfr-section-title')?.textContent?.trim();
      if (title === '同期状態') section.remove();
    }
  }

  function polishProfile(shadow) {
    const bio = shadow.querySelector('.xfr-bio');
    if (bio && (!bio.textContent?.trim() || bio.textContent.trim() === 'プロフィール文なし')) {
      bio.remove();
    }

    const profileButton = Array.from(shadow.querySelectorAll('.xfr-profile-actions button'))
      .find((button) => (button.textContent || '').trim().startsWith('プロフィール'));
    profileButton?.remove();

    const handleNode = shadow.querySelector('.xfr-handle');
    const username = (handleNode?.textContent || '').trim().replace(/^@/, '');
    if (!username) return;
    const href = `${location.origin}/${username}`;

    for (const selector of ['.xfr-name', '.xfr-handle']) {
      const node = shadow.querySelector(selector);
      if (!node) continue;
      if (node instanceof HTMLAnchorElement) {
        node.href = href;
        node.target = '_blank';
        node.rel = 'noopener';
        continue;
      }
      const link = document.createElement('a');
      link.className = node.className;
      link.textContent = node.textContent;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = `@${username} のプロフィールを開く`;
      node.replaceWith(link);
    }
  }

  function bindFollowingScroll(shadow) {
    const list = shadow.querySelector('.xfr-user-list');
    if (list && list !== boundList) {
      boundList = list;

      requestAnimationFrame(() => {
        if (!list.isConnected || list !== boundList) return;
        const max = Math.max(0, list.scrollHeight - list.clientHeight);
        list.scrollTop = Math.min(listScrollTop, max);
      });

      list.addEventListener('scroll', () => {
        if (list === boundList) listScrollTop = list.scrollTop;
      }, { passive: true });
    }

    const search = shadow.querySelector('.xfr-search');
    if (search && search !== boundSearch) {
      boundSearch = search;
      lastSearchValue = search.value;
      search.addEventListener('input', () => {
        if (search.value === lastSearchValue) return;
        lastSearchValue = search.value;
        listScrollTop = 0;
      }, { passive: true });
    }
  }

  function ensureCountChip(meta, kind, text) {
    const prefix = kind === 'bookmark' ? '★' : 'リスト';
    let chip = Array.from(meta.querySelectorAll('.xfr-mini-chip'))
      .find((node) => (node.textContent || '').trim().startsWith(prefix));
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'xfr-mini-chip';
      meta.append(chip);
    }
    if (chip.textContent !== text) chip.textContent = text;
  }

  function decorateRowCounts(shadow) {
    for (const row of shadow.querySelectorAll('.xfr-user-row')) {
      const handle = (row.querySelector('.xfr-list-handle')?.textContent || '').trim().toLowerCase();
      if (!handle) continue;
      const meta = row.querySelector('.xfr-row-meta');
      if (!meta) continue;
      const bookmarkCount = Array.isArray(bookmarkCounts[handle]) ? bookmarkCounts[handle].length : 0;
      const listCount = Array.isArray(membershipCounts[handle]) ? membershipCounts[handle].length : 0;
      ensureCountChip(meta, 'bookmark', `★ ${bookmarkCount}`);
      ensureCountChip(meta, 'list', `リスト ${listCount}`);
    }
  }

  async function refreshCountCache(shadow = currentShadow) {
    try {
      const stored = await chrome.storage.local.get([BOOKMARKS_KEY, LIST_MEMBERSHIP_KEY]);
      bookmarkCounts = stored[BOOKMARKS_KEY] && typeof stored[BOOKMARKS_KEY] === 'object' ? stored[BOOKMARKS_KEY] : {};
      membershipCounts = stored[LIST_MEMBERSHIP_KEY] && typeof stored[LIST_MEMBERSHIP_KEY] === 'object' ? stored[LIST_MEMBERSHIP_KEY] : {};
    } catch {
      bookmarkCounts = {};
      membershipCounts = {};
    }
    if (shadow) decorateRowCounts(shadow);
  }

  function polish(shadow) {
    removeSyncSection(shadow);
    polishProfile(shadow);
    bindFollowingScroll(shadow);
    decorateRowCounts(shadow);
  }

  function install(shadow) {
    if (!shadow || shadow === currentShadow) {
      if (shadow) polish(shadow);
      return;
    }

    observer?.disconnect();
    currentShadow = shadow;
    boundList = null;
    boundSearch = null;
    listScrollTop = 0;
    lastSearchValue = '';

    if (!shadow.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      shadow.append(style);
    }

    polish(shadow);
    void refreshCountCache(shadow);
    observer = new MutationObserver(() => polish(shadow));
    observer.observe(shadow, { childList: true, subtree: true });
  }

  function findAndInstall() {
    const host = document.getElementById(HOST_ID);
    if (host?.shadowRoot) install(host.shadowRoot);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (BOOKMARKS_KEY in changes || LIST_MEMBERSHIP_KEY in changes) void refreshCountCache();
  });

  const pageObserver = new MutationObserver(findAndInstall);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', findAndInstall, { passive: true });
  findAndInstall();
})();
