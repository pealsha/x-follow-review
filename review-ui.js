(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const DECISION_KEY = 'xFollowReview.decisions.v1';
  const ROUTE_RE = /^\/[A-Za-z0-9_]+\/following\/?$/;

  let host = null;
  let shadow = null;
  let root = null;
  let reviewMode = false;
  let currentIndex = 0;
  let users = [];
  let userKeys = new Set();
  let decisions = {};
  let lastPathname = location.pathname;
  let scanTimer = null;
  let themeTimer = null;
  let lastThemeSignature = '';

  const css = `
    :host {
      all: initial;
      color-scheme: var(--xfr-color-scheme, light);
    }
    * { box-sizing: border-box; }
    button, a { font: inherit; }

    .xfr-shell {
      position: fixed;
      top: 0;
      bottom: 0;
      width: 600px;
      pointer-events: none;
      z-index: 2147483000;
      color: var(--xfr-fg, #0f1419);
      font: 14px/1.42 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    .xfr-toggle {
      position: absolute;
      top: 11px;
      right: 12px;
      pointer-events: auto;
      min-height: 34px;
      border: 1px solid var(--xfr-border-strong, #cfd9de);
      border-radius: 999px;
      background: var(--xfr-elevated, rgba(255,255,255,.96));
      color: var(--xfr-fg, #0f1419);
      padding: 6px 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--xfr-shadow, 0 2px 10px rgba(0,0,0,.10));
      backdrop-filter: blur(12px);
    }
    .xfr-toggle:hover { background: var(--xfr-hover, #f7f9f9); }

    .xfr-panel {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      display: none;
      flex-direction: column;
      overflow: hidden;
      background: var(--xfr-bg, #fff);
      border-left: 1px solid var(--xfr-border, #eff3f4);
      border-right: 1px solid var(--xfr-border, #eff3f4);
    }
    .xfr-shell[data-open="true"] .xfr-panel { display: flex; }
    .xfr-shell[data-open="true"] .xfr-toggle { display: none; }

    .xfr-header {
      flex: none;
      min-height: 54px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--xfr-border, #eff3f4);
      background: var(--xfr-elevated, #fff);
      backdrop-filter: blur(12px);
    }
    .xfr-title { font-size: 18px; font-weight: 800; flex: 1; letter-spacing: -.01em; }
    .xfr-progress { color: var(--xfr-muted, #536471); font-size: 13px; white-space: nowrap; }

    button {
      appearance: none;
      border: 1px solid var(--xfr-border-strong, #cfd9de);
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 7px 11px;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: var(--xfr-hover, #f7f9f9); }
    button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }

    .xfr-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: var(--xfr-scroll-thumb, #cfd9de) transparent;
      background: var(--xfr-bg, #fff);
    }

    .xfr-profile {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--xfr-border, #eff3f4);
    }
    .xfr-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--xfr-placeholder-bg, #eff3f4);
    }
    .xfr-identity { min-width: 0; }
    .xfr-name-row { display: flex; min-width: 0; align-items: baseline; gap: 7px; }
    .xfr-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      font-weight: 800;
    }
    .xfr-handle {
      flex: none;
      color: var(--xfr-muted, #536471);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 42%;
    }
    .xfr-bio {
      margin-top: 4px;
      white-space: pre-wrap;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .xfr-profile-link {
      width: 34px;
      height: 34px;
      padding: 0;
      display: grid;
      place-items: center;
      font-size: 16px;
    }

    .xfr-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--xfr-border, #eff3f4);
    }
    .xfr-chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--xfr-subtle, #f7f9f9);
      color: var(--xfr-muted, #536471);
      font-size: 13px;
    }
    .xfr-chip-strong { color: var(--xfr-fg, #0f1419); font-weight: 700; }

    .xfr-section {
      padding: 14px 16px 16px;
      border-bottom: 1px solid var(--xfr-border, #eff3f4);
    }
    .xfr-section-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 10px;
    }
    .xfr-section-title { font-size: 16px; font-weight: 800; }
    .xfr-section-note { color: var(--xfr-muted, #536471); font-size: 12px; }
    .xfr-muted { color: var(--xfr-muted, #536471); }

    .xfr-media-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 3px;
      overflow: hidden;
      border-radius: 14px;
      background: var(--xfr-border, #eff3f4);
    }
    .xfr-media-placeholder {
      position: relative;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      background: var(--xfr-placeholder-bg, #eff3f4);
      color: var(--xfr-muted, #536471);
      font-size: 11px;
    }
    .xfr-media-placeholder:first-child::after {
      content: '接続待ち';
      position: absolute;
      inset: auto 6px 6px;
      text-align: center;
    }

    .xfr-bookmarks-placeholder {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .xfr-bookmark-tile {
      aspect-ratio: 4 / 3;
      border-radius: 12px;
      background: var(--xfr-placeholder-bg, #eff3f4);
      border: 1px solid var(--xfr-border, #eff3f4);
    }

    .xfr-utils {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      padding: 12px 16px 18px;
    }
    .xfr-utils button { font-size: 12px; padding: 6px 10px; color: var(--xfr-muted, #536471); }
    .xfr-status {
      width: 100%;
      color: var(--xfr-muted, #536471);
      font-size: 12px;
    }

    .xfr-footer {
      flex: none;
      display: grid;
      grid-template-columns: auto 1fr 1fr 1fr auto;
      gap: 7px;
      align-items: center;
      padding: 10px 12px max(10px, env(safe-area-inset-bottom));
      border-top: 1px solid var(--xfr-border, #eff3f4);
      background: var(--xfr-elevated, #fff);
      box-shadow: 0 -8px 22px var(--xfr-footer-shadow, rgba(0,0,0,.04));
      backdrop-filter: blur(14px);
    }
    .xfr-footer button { min-height: 44px; border-radius: 12px; }
    .xfr-nav { width: 44px; padding: 0; font-size: 17px; }
    .xfr-action { position: relative; }
    .xfr-keep { border-color: var(--xfr-keep, rgba(0,160,80,.55)); }
    .xfr-later { border-color: var(--xfr-later, rgba(180,145,0,.55)); }
    .xfr-remove { border-color: var(--xfr-remove, rgba(220,40,70,.55)); }
    .xfr-action[data-selected="true"] { background: var(--xfr-selected, rgba(29,155,240,.12)); }
    .xfr-kbd {
      display: inline-block;
      margin-left: 4px;
      padding: 0 4px;
      border: 1px solid var(--xfr-border-strong, #cfd9de);
      border-radius: 4px;
      color: var(--xfr-muted, #536471);
      font-size: 10px;
      line-height: 16px;
      vertical-align: 1px;
    }

    .xfr-empty {
      min-height: 55vh;
      display: grid;
      place-items: center;
      padding: 30px;
      text-align: center;
      color: var(--xfr-muted, #536471);
    }
    .xfr-empty strong { display: block; margin-bottom: 6px; color: var(--xfr-fg, #0f1419); font-size: 16px; }

    @media (max-width: 520px) {
      .xfr-footer { grid-template-columns: 36px 1fr 1fr 1fr 36px; gap: 4px; padding-inline: 6px; }
      .xfr-nav { width: 36px; }
      .xfr-kbd { display: none; }
      .xfr-action { padding-inline: 5px; font-size: 12px; }
    }
  `;

  function isFollowingRoute() {
    return ROUTE_RE.test(location.pathname);
  }

  function usableColumnRect(node) {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 480 || rect.width > 760) return null;
    if (rect.right <= 0 || rect.left >= window.innerWidth) return null;
    return rect;
  }

  function columnFromTimeline() {
    const seed = document.querySelector('[data-testid="UserCell"]') || document.querySelector('[role="tablist"]');
    if (!seed) return null;

    let node = seed;
    let best = null;
    for (let depth = 0; node && node !== document.documentElement && depth < 14; depth += 1, node = node.parentElement) {
      const rect = usableColumnRect(node);
      if (!rect) continue;
      if (rect.height < Math.min(500, window.innerHeight * 0.6)) continue;
      best = node;
    }
    return best;
  }

  function primaryColumn() {
    const direct = document.querySelector('[data-testid="primaryColumn"]');
    if (usableColumnRect(direct)) return direct;

    const timelineColumn = columnFromTimeline();
    if (timelineColumn) return timelineColumn;

    const main = document.querySelector('main[role="main"]');
    if (!main) return null;

    const descendants = Array.from(main.querySelectorAll(':scope > div, :scope > div > div'));
    return descendants.find((node) => usableColumnRect(node)) || (usableColumnRect(main) ? main : null);
  }

  function parseRgb(value) {
    if (!value) return null;
    const match = value.match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,\/]\s*([\d.]+))?\s*\)/i);
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4]),
    };
  }

  function luminance({ r, g, b }) {
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  function opaqueBackground(node) {
    let current = node;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const value = getComputedStyle(current).backgroundColor;
      const rgb = parseRgb(value);
      if (rgb && rgb.a > 0.08) return { value, rgb };
    }
    return null;
  }

  function detectTheme() {
    const column = primaryColumn();
    const candidates = [column, document.body, document.documentElement].filter(Boolean);
    let background = null;

    for (const candidate of candidates) {
      background = opaqueBackground(candidate);
      if (background) break;
    }

    if (!background) {
      background = { value: 'rgb(255, 255, 255)', rgb: { r: 255, g: 255, b: 255, a: 1 } };
    }

    const level = luminance(background.rgb);
    const dark = level < 128;
    const dim = dark && level > 12;
    return { ...background, dark, dim };
  }

  function applyTheme() {
    if (!host) return;
    const theme = detectTheme();
    const signature = `${theme.value}|${theme.dark}|${theme.dim}`;
    if (signature === lastThemeSignature) return;
    lastThemeSignature = signature;

    host.style.setProperty('--xfr-color-scheme', theme.dark ? 'dark' : 'light');
    host.style.setProperty('--xfr-bg', theme.value);

    if (theme.dark) {
      const dimBg = '#15202b';
      const blackBg = '#000000';
      const normalizedBg = theme.dim ? dimBg : blackBg;
      host.style.setProperty('--xfr-bg', normalizedBg);
      host.style.setProperty('--xfr-elevated', theme.dim ? 'rgba(21,32,43,.96)' : 'rgba(0,0,0,.96)');
      host.style.setProperty('--xfr-fg', '#e7e9ea');
      host.style.setProperty('--xfr-muted', theme.dim ? '#8899a6' : '#71767b');
      host.style.setProperty('--xfr-border', theme.dim ? '#38444d' : '#2f3336');
      host.style.setProperty('--xfr-border-strong', theme.dim ? '#536471' : '#536471');
      host.style.setProperty('--xfr-hover', 'rgba(239,243,244,.10)');
      host.style.setProperty('--xfr-subtle', theme.dim ? 'rgba(255,255,255,.055)' : '#16181c');
      host.style.setProperty('--xfr-placeholder-bg', theme.dim ? '#22303c' : '#202327');
      host.style.setProperty('--xfr-scroll-thumb', theme.dim ? '#536471' : '#333639');
      host.style.setProperty('--xfr-shadow', '0 3px 18px rgba(0,0,0,.38)');
      host.style.setProperty('--xfr-footer-shadow', 'rgba(0,0,0,.28)');
      host.style.setProperty('--xfr-selected', 'rgba(29,155,240,.16)');
      host.style.setProperty('--xfr-keep', 'rgba(0,186,124,.72)');
      host.style.setProperty('--xfr-later', 'rgba(255,212,0,.62)');
      host.style.setProperty('--xfr-remove', 'rgba(249,24,128,.65)');
    } else {
      host.style.setProperty('--xfr-bg', '#ffffff');
      host.style.setProperty('--xfr-elevated', 'rgba(255,255,255,.96)');
      host.style.setProperty('--xfr-fg', '#0f1419');
      host.style.setProperty('--xfr-muted', '#536471');
      host.style.setProperty('--xfr-border', '#eff3f4');
      host.style.setProperty('--xfr-border-strong', '#cfd9de');
      host.style.setProperty('--xfr-hover', '#f7f9f9');
      host.style.setProperty('--xfr-subtle', '#f7f9f9');
      host.style.setProperty('--xfr-placeholder-bg', '#eff3f4');
      host.style.setProperty('--xfr-scroll-thumb', '#cfd9de');
      host.style.setProperty('--xfr-shadow', '0 2px 10px rgba(0,0,0,.10)');
      host.style.setProperty('--xfr-footer-shadow', 'rgba(0,0,0,.05)');
      host.style.setProperty('--xfr-selected', 'rgba(29,155,240,.10)');
      host.style.setProperty('--xfr-keep', 'rgba(0,160,80,.55)');
      host.style.setProperty('--xfr-later', 'rgba(180,145,0,.55)');
      host.style.setProperty('--xfr-remove', 'rgba(220,40,70,.55)');
    }
  }

  function scheduleTheme() {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(applyTheme, 90);
  }

  function positionHost() {
    if (!host) return;
    const primary = primaryColumn();
    if (!primary) return;
    const rect = primary.getBoundingClientRect();
    host.style.left = `${Math.round(Math.max(0, rect.left))}px`;
    host.style.width = `${Math.round(Math.min(window.innerWidth - Math.max(0, rect.left), rect.width))}px`;
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  async function storageGet(key) {
    if (!extensionAlive()) return {};
    try {
      return await chrome.storage.local.get(key);
    } catch {
      return {};
    }
  }

  async function storageSet(value) {
    if (!extensionAlive()) return false;
    try {
      await chrome.storage.local.set(value);
      return true;
    } catch {
      return false;
    }
  }

  function mount() {
    if (host || !isFollowingRoute() || !document.documentElement) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);

    root = document.createElement('div');
    root.className = 'xfr-shell';
    root.dataset.open = 'false';
    shadow.append(root);

    document.documentElement.append(host);
    lastThemeSignature = '';
    positionHost();
    applyTheme();
    render();
    scanVisibleUsers();
  }

  function unmount() {
    host?.remove();
    host = null;
    shadow = null;
    root = null;
    reviewMode = false;
    users = [];
    userKeys = new Set();
    currentIndex = 0;
    lastThemeSignature = '';
  }

  function parseUserCell(cell) {
    const spans = Array.from(cell.querySelectorAll('span'));
    const handleEl = spans.find((el) => /^@[A-Za-z0-9_]{1,15}$/.test((el.textContent || '').trim()));
    if (!handleEl) return null;

    const handle = (handleEl.textContent || '').trim();
    const username = handle.slice(1);
    const profilePath = `/${username}`;
    const profileLink = Array.from(cell.querySelectorAll('a[href]')).find((a) => a.getAttribute('href') === profilePath);
    const avatar = Array.from(cell.querySelectorAll('img')).find((img) => /profile_images|pbs\.twimg\.com/i.test(img.src || '')) || cell.querySelector('img');

    const lines = (cell.innerText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const handleIndex = lines.findIndex((line) => line === handle);
    const name = handleIndex > 0 ? lines[handleIndex - 1] : username;
    const ignored = new Set([name, handle, 'Follow', 'Following', 'Follows you', 'フォロー', 'フォロー中', 'フォローされています']);
    const bioLines = lines.filter((line, index) => index > handleIndex && !ignored.has(line) && !/^\d+[,.\d]*\s*(Followers?|Following)$/i.test(line));

    return {
      key: handle.toLowerCase(),
      username,
      handle,
      name,
      bio: bioLines.slice(0, 4).join('\n'),
      avatarUrl: avatar?.src || '',
      profileUrl: new URL(profileLink?.getAttribute('href') || profilePath, location.origin).href,
    };
  }

  function scanVisibleUsers() {
    if (!isFollowingRoute()) return 0;
    let added = 0;
    document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
      const user = parseUserCell(cell);
      if (!user || userKeys.has(user.key)) return;
      userKeys.add(user.key);
      users.push(user);
      added += 1;
    });
    if (currentIndex >= users.length) currentIndex = Math.max(0, users.length - 1);
    if (added && root) render();
    return added;
  }

  async function loadDecisions() {
    const stored = await storageGet(DECISION_KEY);
    decisions = stored[DECISION_KEY] && typeof stored[DECISION_KEY] === 'object' ? stored[DECISION_KEY] : {};
  }

  async function saveDecision(user, decision) {
    if (!user) return;
    decisions[user.key] = { decision, reviewedAt: Date.now(), handle: user.handle, name: user.name };
    await storageSet({ [DECISION_KEY]: decisions });
    goToNextUndecided();
  }

  function goToNextUndecided() {
    if (!users.length) return;
    for (let step = 1; step <= users.length; step += 1) {
      const index = (currentIndex + step) % users.length;
      if (!decisions[users[index].key]) {
        currentIndex = index;
        render();
        return;
      }
    }
    move(1);
  }

  function move(delta) {
    if (!users.length) return;
    currentIndex = Math.max(0, Math.min(users.length - 1, currentIndex + delta));
    render();
  }

  function el(tag, className, text) {
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

  function actionButton(label, key, decision, user, className) {
    const node = button(label, () => void saveDecision(user, decision), `xfr-action ${className}`);
    node.dataset.selected = decisions[user?.key]?.decision === decision ? 'true' : 'false';
    node.append(el('span', 'xfr-kbd', key));
    return node;
  }

  function renderMediaSection() {
    const section = el('section', 'xfr-section');
    const head = el('div', 'xfr-section-head');
    head.append(el('div', 'xfr-section-title', '最近の画像・動画'));
    head.append(el('div', 'xfr-section-note', 'UserMedia 接続待ち'));
    section.append(head);

    const grid = el('div', 'xfr-media-grid');
    for (let i = 0; i < 6; i += 1) grid.append(el('div', 'xfr-media-placeholder'));
    section.append(grid);
    return section;
  }

  function renderBookmarkSection() {
    const section = el('section', 'xfr-section');
    const head = el('div', 'xfr-section-head');
    head.append(el('div', 'xfr-section-title', '自分がブックマークした投稿'));
    head.append(el('div', 'xfr-section-note', 'Bookmarks 接続待ち'));
    section.append(head);

    const tiles = el('div', 'xfr-bookmarks-placeholder');
    for (let i = 0; i < 3; i += 1) tiles.append(el('div', 'xfr-bookmark-tile'));
    section.append(tiles);
    return section;
  }

  function renderUserBody(user) {
    const frag = document.createDocumentFragment();

    const profile = el('section', 'xfr-profile');
    const avatar = el('img', 'xfr-avatar');
    avatar.src = user.avatarUrl;
    avatar.alt = '';
    profile.append(avatar);

    const identity = el('div', 'xfr-identity');
    const nameRow = el('div', 'xfr-name-row');
    nameRow.append(el('div', 'xfr-name', user.name));
    nameRow.append(el('div', 'xfr-handle', user.handle));
    identity.append(nameRow);
    identity.append(el('div', 'xfr-bio', user.bio || 'プロフィール文なし'));
    profile.append(identity);

    const openProfile = button('↗', () => window.open(user.profileUrl, '_blank', 'noopener'), 'xfr-profile-link');
    openProfile.title = 'プロフィールを開く';
    profile.append(openProfile);
    frag.append(profile);

    const summary = el('div', 'xfr-summary');
    summary.append(el('span', 'xfr-chip xfr-chip-strong', 'リスト  —'));
    summary.append(el('span', 'xfr-chip xfr-chip-strong', '★ ブックマーク  —'));
    const previous = decisions[user.key]?.decision;
    if (previous) {
      const labels = { keep: '残す', later: '保留', remove: '解除候補' };
      summary.append(el('span', 'xfr-chip', `前回: ${labels[previous] || previous}`));
    }
    frag.append(summary);

    frag.append(renderMediaSection());
    frag.append(renderBookmarkSection());

    const utils = el('div', 'xfr-utils');
    utils.append(button('表示中を再スキャン', () => {
      scanVisibleUsers();
      render();
    }));
    utils.append(button('さらに読み込む', () => {
      window.scrollBy({ top: Math.max(window.innerHeight * 1.6, 1000), behavior: 'smooth' });
      setTimeout(() => {
        scanVisibleUsers();
        render();
      }, 1400);
    }));
    const reviewedCount = users.filter((u) => decisions[u.key]).length;
    utils.append(el('div', 'xfr-status', `取得 ${users.length}人 / 判定済み ${reviewedCount}人。現在は判定のみ保存し、実際のフォロー解除は行いません。`));
    frag.append(utils);

    return frag;
  }

  function render() {
    if (!root) return;
    root.replaceChildren();
    root.dataset.open = reviewMode ? 'true' : 'false';

    const toggle = button('Review Mode', async () => {
      await loadDecisions();
      scanVisibleUsers();
      reviewMode = true;
      positionHost();
      applyTheme();
      render();
    }, 'xfr-toggle');
    root.append(toggle);

    const panel = el('div', 'xfr-panel');

    const header = el('header', 'xfr-header');
    header.append(el('div', 'xfr-title', 'Follow Review'));
    header.append(el('div', 'xfr-progress', users.length ? `${currentIndex + 1} / ${users.length}` : '0 users'));
    header.append(button('通常表示', () => {
      reviewMode = false;
      render();
    }));
    panel.append(header);

    const body = el('main', 'xfr-body');
    const user = users[currentIndex];
    if (user) {
      body.append(renderUserBody(user));
    } else {
      const empty = el('div', 'xfr-empty');
      const message = el('div');
      message.append(el('strong', '', 'フォロー相手をまだ取得できていません'));
      message.append(el('div', '', '「通常表示」に戻ってフォロー一覧を少しスクロールしてから、Review Modeを開き直してください。'));
      empty.append(message);
      body.append(empty);
    }
    panel.append(body);

    const footer = el('footer', 'xfr-footer');
    footer.append(button('←', () => move(-1), 'xfr-nav'));
    if (user) {
      footer.append(actionButton('残す', 'K', 'keep', user, 'xfr-keep'));
      footer.append(actionButton('保留', 'S', 'later', user, 'xfr-later'));
      footer.append(actionButton('解除候補', 'D', 'remove', user, 'xfr-remove'));
    } else {
      footer.append(button('残す', () => {}, 'xfr-action'));
      footer.append(button('保留', () => {}, 'xfr-action'));
      footer.append(button('解除候補', () => {}, 'xfr-action'));
    }
    footer.append(button('→', () => move(1), 'xfr-nav'));
    panel.append(footer);

    root.append(panel);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (isFollowingRoute()) scanVisibleUsers();
    }, 280);
  }

  window.addEventListener('resize', () => {
    positionHost();
    scheduleTheme();
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (!reviewMode || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    const user = users[currentIndex];
    const key = event.key.toLowerCase();
    if (key === 'k') void saveDecision(user, 'keep');
    else if (key === 's') void saveDecision(user, 'later');
    else if (key === 'd') void saveDecision(user, 'remove');
    else if (event.key === 'ArrowLeft') move(-1);
    else if (event.key === 'ArrowRight') move(1);
    else if (event.key === 'Escape') {
      reviewMode = false;
      render();
    } else return;
    event.preventDefault();
  }, true);

  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPathname) {
      lastPathname = location.pathname;
      if (isFollowingRoute()) {
        setTimeout(() => {
          mount();
          positionHost();
          scheduleTheme();
          scanVisibleUsers();
        }, 120);
      } else {
        unmount();
      }
      return;
    }

    if (isFollowingRoute()) {
      if (!host) mount();
      positionHost();
      scheduleTheme();
      scheduleScan();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  void loadDecisions().then(() => {
    if (isFollowingRoute()) mount();
  });
})();
