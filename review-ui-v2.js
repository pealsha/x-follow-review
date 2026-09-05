(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const ROUTE_RE = /^\/[A-Za-z0-9_]+\/following\/?$/;
  const FOLLOWING_KEY = 'xFollowReview.following.v1';
  const BOOKMARKS_KEY = 'xFollowReview.bookmarksByAuthor.v1';
  const LISTS_KEY = 'xFollowReview.lists.v1';
  const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';
  const MEDIA_KEY = 'xFollowReview.mediaByAuthor.v1';
  const SYNC_STATUS_KEY = 'xFollowReview.syncStatus.v1';
  const GQL_MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const ACTION_MARKER = 'X_FOLLOW_REVIEW_ACTION_V1';

  let host = null;
  let shadow = null;
  let root = null;
  let lastPath = location.pathname;
  let themeTimer = null;
  let seq = 0;
  const pending = new Map();

  const state = {
    open: false,
    users: [],
    selectedKey: '',
    search: '',
    bookmarks: {},
    lists: [],
    memberships: {},
    media: {},
    sync: {},
    busy: false,
  };

  const css = `
    :host { all: initial; color-scheme: var(--xfr-scheme, dark); }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    .xfr-shell {
      position: fixed;
      top: 0;
      bottom: 0;
      width: 600px;
      z-index: 2147483000;
      pointer-events: none;
      color: var(--xfr-fg);
      font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    }
    .xfr-toggle {
      position: absolute;
      top: 10px;
      right: 12px;
      pointer-events: auto;
      border: 1px solid var(--xfr-border-strong);
      border-radius: 999px;
      background: var(--xfr-elevated);
      color: var(--xfr-fg);
      padding: 7px 13px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(12px);
    }
    .xfr-workspace {
      position: absolute;
      inset: 0;
      display: none;
      grid-template-rows: 56px minmax(0,1fr);
      pointer-events: auto;
      background: var(--xfr-bg);
      border-left: 1px solid var(--xfr-border);
    }
    .xfr-shell[data-open="true"] .xfr-workspace { display: grid; }
    .xfr-shell[data-open="true"] .xfr-toggle { display: none; }
    .xfr-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      border-bottom: 1px solid var(--xfr-border);
      background: var(--xfr-elevated);
      backdrop-filter: blur(14px);
    }
    .xfr-title { font-size: 19px; font-weight: 800; }
    .xfr-status { flex: 1; color: var(--xfr-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button {
      appearance: none;
      border: 1px solid var(--xfr-border-strong);
      background: transparent;
      color: var(--xfr-fg);
      border-radius: 999px;
      padding: 7px 12px;
      cursor: pointer;
      font-weight: 700;
    }
    button:hover { background: var(--xfr-hover); }
    button:disabled { opacity: .5; cursor: default; }
    .xfr-main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 340px) minmax(0,1fr);
    }
    .xfr-list-pane {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0,1fr);
      border-right: 1px solid var(--xfr-border);
      background: var(--xfr-bg);
    }
    .xfr-search-wrap { padding: 12px; border-bottom: 1px solid var(--xfr-border); }
    .xfr-search {
      width: 100%;
      border: 1px solid var(--xfr-border-strong);
      border-radius: 999px;
      background: var(--xfr-subtle);
      color: var(--xfr-fg);
      padding: 9px 13px;
      outline: none;
    }
    .xfr-search:focus { border-color: #1d9bf0; }
    .xfr-user-list { min-height: 0; overflow-y: auto; scrollbar-color: var(--xfr-scroll) transparent; }
    .xfr-user-row {
      display: grid;
      grid-template-columns: 44px minmax(0,1fr);
      gap: 10px;
      width: 100%;
      padding: 11px 12px;
      border: 0;
      border-bottom: 1px solid var(--xfr-border);
      border-radius: 0;
      text-align: left;
      font-weight: 400;
      background: transparent;
    }
    .xfr-user-row:hover { background: var(--xfr-hover); }
    .xfr-user-row[data-selected="true"] { background: var(--xfr-selected); }
    .xfr-list-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: var(--xfr-subtle); }
    .xfr-user-main { min-width: 0; }
    .xfr-list-name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xfr-list-handle { color: var(--xfr-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xfr-row-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
    .xfr-mini-chip { color: var(--xfr-muted); font-size: 11px; padding: 2px 6px; border-radius: 999px; background: var(--xfr-subtle); }
    .xfr-empty { padding: 24px 16px; color: var(--xfr-muted); text-align: center; }
    .xfr-detail-pane { min-width: 0; min-height: 0; overflow-y: auto; background: var(--xfr-bg); scrollbar-color: var(--xfr-scroll) transparent; }
    .xfr-profile {
      display: grid;
      grid-template-columns: 64px minmax(0,1fr) auto;
      gap: 14px;
      align-items: start;
      padding: 18px 22px;
      border-bottom: 1px solid var(--xfr-border);
    }
    .xfr-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--xfr-subtle); }
    .xfr-name-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .xfr-name { font-size: 19px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xfr-handle { color: var(--xfr-muted); white-space: nowrap; }
    .xfr-bio { margin-top: 5px; white-space: pre-wrap; max-width: 820px; }
    .xfr-profile-actions { display: flex; gap: 8px; }
    .xfr-danger { border-color: #f4212e; color: #f4212e; }
    .xfr-detail-grid {
      display: grid;
      grid-template-columns: minmax(0,1.7fr) minmax(260px,.8fr);
      align-items: start;
    }
    .xfr-primary-detail { min-width: 0; border-right: 1px solid var(--xfr-border); }
    .xfr-side-detail { min-width: 0; }
    .xfr-summary { display: flex; gap: 7px; flex-wrap: wrap; padding: 12px 18px; border-bottom: 1px solid var(--xfr-border); }
    .xfr-chip { font-size: 12px; padding: 4px 8px; border-radius: 999px; background: var(--xfr-subtle); color: var(--xfr-muted); }
    .xfr-section { padding: 16px 18px 20px; border-bottom: 1px solid var(--xfr-border); }
    .xfr-section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
    .xfr-section-title { font-size: 16px; font-weight: 800; }
    .xfr-section-note { font-size: 12px; color: var(--xfr-muted); }
    .xfr-media-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 3px; border-radius: 14px; overflow: hidden; }
    .xfr-media-placeholder { aspect-ratio: 1; display: grid; place-items: center; background: var(--xfr-subtle); color: var(--xfr-muted); }
    .xfr-bookmarks-placeholder { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; }
    .xfr-bookmark-tile { aspect-ratio: 4/3; border-radius: 10px; background: var(--xfr-subtle); color: var(--xfr-fg); text-decoration: none; overflow: hidden; border: 1px solid var(--xfr-border); }
    .xfr-list-options { display: grid; gap: 6px; }
    .xfr-list-option { display: flex; align-items: center; gap: 9px; padding: 8px 9px; border-radius: 10px; cursor: pointer; }
    .xfr-list-option:hover { background: var(--xfr-hover); }
    .xfr-list-option input { width: 17px; height: 17px; accent-color: #1d9bf0; }
    .xfr-sync-box { color: var(--xfr-muted); font-size: 12px; background: var(--xfr-subtle); border-radius: 12px; padding: 10px 11px; }
    @media (max-width: 1050px) {
      .xfr-main { grid-template-columns: 280px minmax(0,1fr); }
      .xfr-detail-grid { grid-template-columns: 1fr; }
      .xfr-primary-detail { border-right: 0; }
      .xfr-media-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
    }
  `;

  function isRoute() { return ROUTE_RE.test(location.pathname); }

  function primaryColumn() {
    return document.querySelector('[data-testid="primaryColumn"]') || (() => {
      const cell = document.querySelector('[data-testid="UserCell"]');
      let node = cell;
      while (node && node !== document.documentElement) {
        const rect = node.getBoundingClientRect();
        if (rect.width >= 500 && rect.width <= 700 && rect.height > 500) return node;
        node = node.parentElement;
      }
      return null;
    })();
  }

  function applyGeometry() {
    if (!host) return;
    const column = primaryColumn();
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    host.style.left = `${left}px`;
    host.style.width = state.open ? `${Math.max(520, window.innerWidth - left)}px` : `${Math.max(500, rect.width)}px`;
  }

  function applyTheme() {
    if (!host) return;
    const bg = getComputedStyle(document.body).backgroundColor || 'rgb(0,0,0)';
    const m = bg.match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    const lum = m ? (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000 : 0;
    const dark = lum < 128;
    const dim = dark && lum > 12;
    const vars = dark ? {
      '--xfr-scheme': 'dark', '--xfr-bg': dim ? '#15202b' : '#000', '--xfr-elevated': dim ? 'rgba(21,32,43,.96)' : 'rgba(0,0,0,.96)',
      '--xfr-fg': '#e7e9ea', '--xfr-muted': dim ? '#8899a6' : '#71767b', '--xfr-border': dim ? '#38444d' : '#2f3336',
      '--xfr-border-strong': dim ? '#536471' : '#536471', '--xfr-subtle': dim ? 'rgba(255,255,255,.06)' : '#16181c',
      '--xfr-hover': 'rgba(239,243,244,.10)', '--xfr-selected': 'rgba(29,155,240,.14)', '--xfr-scroll': '#536471',
    } : {
      '--xfr-scheme': 'light', '--xfr-bg': '#fff', '--xfr-elevated': 'rgba(255,255,255,.96)', '--xfr-fg': '#0f1419', '--xfr-muted': '#536471',
      '--xfr-border': '#eff3f4', '--xfr-border-strong': '#cfd9de', '--xfr-subtle': '#f7f9f9', '--xfr-hover': '#f7f9f9',
      '--xfr-selected': 'rgba(29,155,240,.10)', '--xfr-scroll': '#cfd9de',
    };
    Object.entries(vars).forEach(([key, value]) => host.style.setProperty(key, value));
  }

  function scheduleTheme() {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => { applyTheme(); applyGeometry(); }, 80);
  }

  function el(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, onClick, className = '') {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function seedFromDom() {
    const map = new Map(state.users.map((u) => [u.key, u]));
    document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
      const handle = Array.from(cell.querySelectorAll('span')).map((s) => (s.textContent || '').trim()).find((v) => /^@[A-Za-z0-9_]{1,15}$/.test(v));
      if (!handle) return;
      const username = handle.slice(1);
      const lines = (cell.innerText || '').split('\n').map((v) => v.trim()).filter(Boolean);
      const hi = lines.indexOf(handle);
      const avatar = cell.querySelector('img');
      const key = handle.toLowerCase();
      if (!map.has(key)) map.set(key, {
        id: '', key, handle, username, name: hi > 0 ? lines[hi - 1] : username,
        bio: lines.slice(hi + 1).filter((v) => !['Following','フォロー中'].includes(v)).slice(0,3).join('\n'),
        avatarUrl: avatar?.src || '', profileUrl: `${location.origin}/${username}`,
      });
    });
    state.users = Array.from(map.values());
  }

  async function loadState() {
    seedFromDom();
    try {
      const stored = await chrome.storage.local.get([FOLLOWING_KEY, BOOKMARKS_KEY, LISTS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY]);
      if (Array.isArray(stored[FOLLOWING_KEY]) && stored[FOLLOWING_KEY].length) state.users = stored[FOLLOWING_KEY];
      state.bookmarks = stored[BOOKMARKS_KEY] || {};
      state.lists = Array.isArray(stored[LISTS_KEY]) ? stored[LISTS_KEY] : [];
      state.memberships = stored[LIST_MEMBERSHIP_KEY] || {};
      state.media = stored[MEDIA_KEY] || {};
      state.sync = stored[SYNC_STATUS_KEY] || {};
    } catch {}
    if (!state.selectedKey || !state.users.some((u) => u.key === state.selectedKey)) state.selectedKey = state.users[0]?.key || '';
  }

  function selectedUser() { return state.users.find((u) => u.key === state.selectedKey) || null; }

  function filteredUsers() {
    const q = state.search.trim().toLowerCase();
    if (!q) return state.users;
    return state.users.filter((u) => `${u.name} ${u.handle} ${u.bio}`.toLowerCase().includes(q));
  }

  function renderMedia(items) {
    const grid = el('div', 'xfr-media-grid');
    if (!items.length) {
      grid.append(el('div', 'xfr-media-placeholder', '取得中 / なし'));
      return grid;
    }
    items.slice(0, 16).forEach((item) => {
      const link = el('a');
      link.href = item.postUrl || item.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.style.aspectRatio = '1';
      link.style.overflow = 'hidden';
      const img = el('img');
      img.src = item.url;
      img.alt = item.type === 'video' ? '動画' : '画像';
      img.loading = 'lazy';
      img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
      link.append(img); grid.append(link);
    });
    return grid;
  }

  function renderBookmarks(posts) {
    const grid = el('div', 'xfr-bookmarks-placeholder');
    if (!posts.length) {
      grid.append(el('div', 'xfr-bookmark-tile', 'なし / 同期中'));
      return grid;
    }
    posts.slice(0, 12).forEach((post) => {
      const link = el('a', 'xfr-bookmark-tile');
      link.href = post.url; link.target = '_blank'; link.rel = 'noopener'; link.title = post.text || '';
      const media = post.media?.[0];
      if (media?.url) {
        const img = el('img'); img.src = media.url; img.alt = ''; img.loading = 'lazy'; img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; link.append(img);
      } else {
        const text = el('div', '', post.text || '投稿を開く'); text.style.padding = '9px'; text.style.fontSize = '11px'; link.append(text);
      }
      grid.append(link);
    });
    return grid;
  }

  function postRequest(marker, action, payload = {}, timeout = 30000) {
    seq += 1;
    const id = `xfr-ui-${Date.now()}-${seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${action} timed out`)); }, timeout);
      pending.set(id, { resolve, reject, timer, marker });
      window.postMessage({ marker, type: 'request', id, action, payload }, '*');
    });
  }

  async function toggleMembership(list, checked) {
    const user = selectedUser();
    if (!user || !list) return;
    state.busy = true; render();
    try {
      await postRequest(GQL_MARKER, 'toggle-list', { username: user.username, listId: list.id, add: checked }, 45000);
      const current = Array.isArray(state.memberships[user.key]) ? state.memberships[user.key].slice() : [];
      state.memberships[user.key] = checked
        ? [...current.filter((v) => String(v.id) !== String(list.id)), { id: list.id, name: list.name }]
        : current.filter((v) => String(v.id) !== String(list.id));
      await chrome.storage.local.set({ [LIST_MEMBERSHIP_KEY]: state.memberships });
    } catch (error) {
      state.sync = { message: `リスト更新失敗: ${error.message}` };
    } finally {
      state.busy = false; render();
    }
  }

  async function unfollowSelected() {
    const user = selectedUser();
    if (!user?.id) return;
    if (!window.confirm(`@${user.username} のフォローを解除しますか？`)) return;
    state.busy = true; render();
    try {
      await postRequest(ACTION_MARKER, 'unfollow', { userId: user.id }, 30000);
      const index = state.users.findIndex((u) => u.key === user.key);
      state.users = state.users.filter((u) => u.key !== user.key);
      state.selectedKey = state.users[Math.min(index, state.users.length - 1)]?.key || '';
      await chrome.storage.local.set({ [FOLLOWING_KEY]: state.users });
    } catch (error) {
      state.sync = { message: `フォロー解除失敗: ${error.message}` };
    } finally {
      state.busy = false; render();
    }
  }

  function renderListPane() {
    const pane = el('aside', 'xfr-list-pane');
    const searchWrap = el('div', 'xfr-search-wrap');
    const input = el('input', 'xfr-search');
    input.type = 'search'; input.placeholder = `フォロー中を検索 (${state.users.length})`; input.value = state.search;
    input.addEventListener('input', () => { state.search = input.value; render(); });
    searchWrap.append(input); pane.append(searchWrap);
    const list = el('div', 'xfr-user-list');
    const users = filteredUsers();
    if (!users.length) list.append(el('div', 'xfr-empty', state.users.length ? '該当するユーザーはいません' : 'Followingを取得中…'));
    users.forEach((user) => {
      const row = button('', () => { state.selectedKey = user.key; render(); }, 'xfr-user-row');
      row.dataset.selected = user.key === state.selectedKey ? 'true' : 'false';
      const avatar = el('img', 'xfr-list-avatar'); avatar.src = user.avatarUrl || ''; avatar.alt = '';
      const main = el('div', 'xfr-user-main');
      main.append(el('div', 'xfr-list-name', user.name || user.username));
      main.append(el('div', 'xfr-list-handle', user.handle || `@${user.username}`));
      const meta = el('div', 'xfr-row-meta');
      const bc = state.bookmarks[user.key]?.length || 0;
      const lc = state.memberships[user.key]?.length || 0;
      if (bc) meta.append(el('span', 'xfr-mini-chip', `★ ${bc}`));
      if (lc) meta.append(el('span', 'xfr-mini-chip', `リスト ${lc}`));
      main.append(meta); row.append(avatar, main); list.append(row);
    });
    pane.append(list); return pane;
  }

  function renderDetailPane() {
    const pane = el('section', 'xfr-detail-pane');
    const user = selectedUser();
    if (!user) { pane.append(el('div', 'xfr-empty', '左の一覧からユーザーを選択してください')); return pane; }

    const profile = el('section', 'xfr-profile');
    const avatar = el('img', 'xfr-avatar'); avatar.src = user.avatarUrl || ''; avatar.alt = '';
    const identity = el('div');
    const nr = el('div', 'xfr-name-row'); nr.append(el('div', 'xfr-name', user.name || user.username), el('div', 'xfr-handle', user.handle || `@${user.username}`));
    identity.append(nr, el('div', 'xfr-bio', user.bio || 'プロフィール文なし'));
    const actions = el('div', 'xfr-profile-actions');
    actions.append(button('プロフィール ↗', () => window.open(user.profileUrl || `${location.origin}/${user.username}`, '_blank', 'noopener')));
    const unfollow = button('フォロー解除', () => void unfollowSelected(), 'xfr-danger'); unfollow.disabled = state.busy || !user.id; actions.append(unfollow);
    profile.append(avatar, identity, actions); pane.append(profile);

    const summary = el('div', 'xfr-summary');
    summary.append(el('span', 'xfr-chip', `リスト ${state.memberships[user.key]?.length || 0}`));
    summary.append(el('span', 'xfr-chip', `★ ブックマーク ${state.bookmarks[user.key]?.length || 0}`));
    pane.append(summary);

    const grid = el('div', 'xfr-detail-grid');
    const primary = el('div', 'xfr-primary-detail');
    const mediaSection = el('section', 'xfr-section');
    const mh = el('div', 'xfr-section-head'); mh.append(el('div', 'xfr-section-title', '最近の画像・動画'), el('div', 'xfr-section-note', state.media[user.key]?.updatedAt ? `${state.media[user.key]?.items?.length || 0}件` : '選択時にGraphQL取得'));
    mediaSection.append(mh, renderMedia(state.media[user.key]?.items || [])); primary.append(mediaSection);

    const bookmarkSection = el('section', 'xfr-section');
    const bh = el('div', 'xfr-section-head'); bh.append(el('div', 'xfr-section-title', '自分がブックマークした投稿'), el('div', 'xfr-section-note', `${state.bookmarks[user.key]?.length || 0}件`));
    bookmarkSection.append(bh, renderBookmarks(state.bookmarks[user.key] || [])); primary.append(bookmarkSection);

    const side = el('aside', 'xfr-side-detail');
    const listSection = el('section', 'xfr-section');
    const lh = el('div', 'xfr-section-head'); lh.append(el('div', 'xfr-section-title', 'リスト'), el('div', 'xfr-section-note', `${state.lists.length}件`)); listSection.append(lh);
    const options = el('div', 'xfr-list-options');
    if (!state.lists.length) options.append(el('div', 'xfr-empty', 'リストを同期中…'));
    const memberIds = new Set((state.memberships[user.key] || []).map((v) => String(v.id)));
    state.lists.forEach((list) => {
      const label = el('label', 'xfr-list-option');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = memberIds.has(String(list.id)); cb.disabled = state.busy;
      cb.addEventListener('change', () => void toggleMembership(list, cb.checked));
      label.append(cb, el('span', '', list.name)); options.append(label);
    });
    listSection.append(options); side.append(listSection);
    const syncSection = el('section', 'xfr-section'); syncSection.append(el('div', 'xfr-section-title', '同期状態'), el('div', 'xfr-sync-box', state.sync.message || 'GraphQL同期待機中')); side.append(syncSection);

    grid.append(primary, side); pane.append(grid); return pane;
  }

  function render() {
    if (!root) return;
    root.replaceChildren(); root.dataset.open = state.open ? 'true' : 'false'; applyGeometry();
    const toggle = button('Review Mode', async () => { state.open = true; await loadState(); render(); }, 'xfr-toggle'); root.append(toggle);
    const workspace = el('div', 'xfr-workspace');
    const top = el('header', 'xfr-topbar');
    top.append(el('div', 'xfr-title', 'Follow Review'));
    top.append(el('div', 'xfr-status', state.sync.message || `${state.users.length}人`));
    top.append(button('通常表示', () => { state.open = false; render(); }));
    workspace.append(top);
    const main = el('main', 'xfr-main'); main.append(renderListPane(), renderDetailPane()); workspace.append(main); root.append(workspace);
  }

  async function refreshFromStorage() { await loadState(); render(); }

  function mount() {
    if (host || !isRoute()) return;
    host = document.createElement('div'); host.id = HOST_ID; shadow = host.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = css; shadow.append(style);
    root = el('div', 'xfr-shell'); root.dataset.open = 'false'; shadow.append(root); document.documentElement.append(host);
    applyTheme(); applyGeometry(); void loadState().then(render);
  }

  function unmount() { host?.remove(); host = null; shadow = null; root = null; state.open = false; }

  window.addEventListener('resize', () => { applyGeometry(); scheduleTheme(); }, { passive: true });
  document.addEventListener('keydown', (event) => { if (state.open && event.key === 'Escape') { state.open = false; render(); } }, true);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || (message.marker !== GQL_MARKER && message.marker !== ACTION_MARKER) || message.type !== 'response') return;
    const job = pending.get(message.id); if (!job) return; clearTimeout(job.timer); pending.delete(message.id);
    if (message.ok) job.resolve(message.result); else job.reject(new Error(message.error || 'request failed'));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ([FOLLOWING_KEY, BOOKMARKS_KEY, LISTS_KEY, LIST_MEMBERSHIP_KEY, MEDIA_KEY, SYNC_STATUS_KEY].some((key) => key in changes)) void refreshFromStorage();
  });

  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (isRoute()) setTimeout(mount, 80); else unmount();
      return;
    }
    if (isRoute() && !host) mount();
    scheduleTheme();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (isRoute()) mount();
})();
