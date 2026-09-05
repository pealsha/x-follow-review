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

  const css = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .xfr-shell {
      position: fixed;
      inset: 0 auto 0 0;
      width: 600px;
      pointer-events: none;
      z-index: 2147483000;
      color: var(--xfr-fg, #0f1419);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .xfr-toggle {
      position: absolute;
      top: 10px;
      right: 12px;
      pointer-events: auto;
      border: 1px solid var(--xfr-border, rgba(127,127,127,.35));
      border-radius: 999px;
      background: var(--xfr-card, rgba(255,255,255,.96));
      color: var(--xfr-fg, #0f1419);
      padding: 7px 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
      backdrop-filter: blur(10px);
    }
    .xfr-panel {
      position: absolute;
      inset: 0;
      pointer-events: auto;
      background: var(--xfr-bg, #fff);
      border-left: 1px solid var(--xfr-border, rgba(127,127,127,.25));
      border-right: 1px solid var(--xfr-border, rgba(127,127,127,.25));
      display: none;
      overflow: hidden;
    }
    .xfr-shell[data-open="true"] .xfr-panel { display: flex; flex-direction: column; }
    .xfr-shell[data-open="true"] .xfr-toggle { display: none; }
    .xfr-header {
      min-height: 54px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--xfr-border, rgba(127,127,127,.25));
      background: var(--xfr-bg, #fff);
    }
    .xfr-title { font-size: 17px; font-weight: 800; flex: 1; }
    .xfr-progress { color: var(--xfr-muted, #536471); font-size: 13px; }
    button {
      appearance: none;
      border: 1px solid var(--xfr-border, rgba(127,127,127,.35));
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 7px 11px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: var(--xfr-hover, rgba(127,127,127,.12)); }
    .xfr-body { flex: 1; overflow: auto; padding: 16px; }
    .xfr-card {
      border: 1px solid var(--xfr-border, rgba(127,127,127,.25));
      border-radius: 18px;
      overflow: hidden;
      background: var(--xfr-card, rgba(255,255,255,.02));
    }
    .xfr-profile { display: grid; grid-template-columns: 64px 1fr; gap: 12px; padding: 16px; }
    .xfr-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: rgba(127,127,127,.15); }
    .xfr-name { font-size: 18px; font-weight: 800; margin-top: 2px; }
    .xfr-handle { color: var(--xfr-muted, #536471); margin: 1px 0 7px; }
    .xfr-bio { white-space: pre-wrap; }
    .xfr-section { padding: 14px 16px; border-top: 1px solid var(--xfr-border, rgba(127,127,127,.25)); }
    .xfr-section-title { font-weight: 800; margin-bottom: 8px; }
    .xfr-muted { color: var(--xfr-muted, #536471); }
    .xfr-placeholder-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .xfr-placeholder { aspect-ratio: 1; border-radius: 10px; background: var(--xfr-hover, rgba(127,127,127,.12)); display: grid; place-items: center; color: var(--xfr-muted, #536471); font-size: 11px; }
    .xfr-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 14px; }
    .xfr-actions button { border-radius: 12px; min-height: 46px; }
    .xfr-keep { border-color: rgba(0,160,80,.5); }
    .xfr-later { border-color: rgba(140,120,0,.5); }
    .xfr-remove { border-color: rgba(220,40,70,.5); }
    .xfr-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .xfr-status { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: var(--xfr-hover, rgba(127,127,127,.10)); color: var(--xfr-muted, #536471); }
    .xfr-empty { padding: 28px 18px; text-align: center; color: var(--xfr-muted, #536471); }
    .xfr-kbd { font-size: 11px; padding: 1px 5px; margin-left: 5px; border: 1px solid var(--xfr-border, rgba(127,127,127,.35)); border-radius: 5px; color: var(--xfr-muted, #536471); }
  `;

  function isFollowingRoute() {
    return ROUTE_RE.test(location.pathname);
  }

  function primaryColumn() {
    return document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main[role="main"]');
  }

  function theme() {
    const body = document.body;
    if (!body || !host) return;
    const style = getComputedStyle(body);
    const bg = style.backgroundColor || '#fff';
    const fg = style.color || '#0f1419';
    host.style.setProperty('--xfr-bg', bg);
    host.style.setProperty('--xfr-card', bg);
    host.style.setProperty('--xfr-fg', fg);
    const dark = (() => {
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return false;
      const [, r, g, b] = m.map(Number);
      return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    })();
    host.style.setProperty('--xfr-muted', dark ? '#8b98a5' : '#536471');
    host.style.setProperty('--xfr-border', dark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.15)');
    host.style.setProperty('--xfr-hover', dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)');
  }

  function positionHost() {
    if (!host) return;
    const primary = primaryColumn();
    if (!primary) return;
    const rect = primary.getBoundingClientRect();
    host.style.left = `${Math.max(0, rect.left)}px`;
    host.style.width = `${Math.max(360, rect.width)}px`;
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
    theme();
    positionHost();
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
    try {
      const stored = await chrome.storage.local.get(DECISION_KEY);
      decisions = stored[DECISION_KEY] && typeof stored[DECISION_KEY] === 'object' ? stored[DECISION_KEY] : {};
    } catch {
      decisions = {};
    }
  }

  async function saveDecision(user, decision) {
    if (!user) return;
    decisions[user.key] = { decision, reviewedAt: Date.now(), handle: user.handle, name: user.name };
    await chrome.storage.local.set({ [DECISION_KEY]: decisions });
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
    currentIndex = Math.min(currentIndex + 1, users.length - 1);
    render();
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

  function renderSection(title, message, placeholders = false) {
    const section = el('section', 'xfr-section');
    section.append(el('div', 'xfr-section-title', title));
    if (placeholders) {
      const grid = el('div', 'xfr-placeholder-grid');
      for (let i = 0; i < 4; i += 1) grid.append(el('div', 'xfr-placeholder', i === 0 ? '接続待ち' : ''));
      section.append(grid);
    }
    section.append(el('div', 'xfr-muted', message));
    return section;
  }

  function render() {
    if (!root) return;
    root.replaceChildren();
    root.dataset.open = reviewMode ? 'true' : 'false';

    const toggle = button('Review Mode', async () => {
      await loadDecisions();
      scanVisibleUsers();
      reviewMode = true;
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

    if (!user) {
      const empty = el('div', 'xfr-empty');
      empty.append(el('div', '', 'まだフォロー相手を取得できていません。'));
      empty.append(el('div', 'xfr-muted', '通常表示に戻ってフォロー一覧を少しスクロールしてから、再度Review Modeを開いてください。'));
      body.append(empty);
    } else {
      const card = el('article', 'xfr-card');
      const profile = el('div', 'xfr-profile');
      const avatar = el('img', 'xfr-avatar');
      avatar.src = user.avatarUrl;
      avatar.alt = '';
      profile.append(avatar);
      const profileText = el('div');
      profileText.append(el('div', 'xfr-name', user.name));
      profileText.append(el('div', 'xfr-handle', user.handle));
      profileText.append(el('div', 'xfr-bio', user.bio || 'プロフィール文なし'));
      const profileButton = button('プロフィールを開く', () => window.open(user.profileUrl, '_blank', 'noopener'));
      profileButton.style.marginTop = '10px';
      profileText.append(profileButton);
      profile.append(profileText);
      card.append(profile);

      card.append(renderSection('所属リスト', 'List系GraphQLを接続すると、ここに「絵師」「VRC」など自分のリスト所属を表示します。'));
      card.append(renderSection('最近の画像・動画', 'UserMediaを接続すると、直近のメディア投稿をここに並べます。', true));
      card.append(renderSection('自分がブックマークした投稿', 'Bookmarksを同期すると、この人の投稿だけを逆引きしてここに表示します。'));

      const actionWrap = el('div', 'xfr-section');
      const previous = decisions[user.key]?.decision;
      if (previous) actionWrap.append(el('div', 'xfr-status', `保存済み判定: ${previous}`));
      const actions = el('div', 'xfr-actions');
      const keep = button('残す', () => saveDecision(user, 'keep'), 'xfr-keep');
      keep.append(el('span', 'xfr-kbd', 'K'));
      const later = button('保留', () => saveDecision(user, 'later'), 'xfr-later');
      later.append(el('span', 'xfr-kbd', 'S'));
      const remove = button('解除候補', () => saveDecision(user, 'remove'), 'xfr-remove');
      remove.append(el('span', 'xfr-kbd', 'D'));
      actions.append(keep, later, remove);
      actionWrap.append(actions);
      card.append(actionWrap);
      body.append(card);
    }

    const toolbar = el('div', 'xfr-toolbar');
    toolbar.append(button('← 前', () => move(-1)));
    toolbar.append(button('次 →', () => move(1)));
    toolbar.append(button('表示中を再スキャン', () => {
      scanVisibleUsers();
      render();
    }));
    toolbar.append(button('さらに読み込む', () => {
      window.scrollBy({ top: Math.max(window.innerHeight * 1.5, 900), behavior: 'smooth' });
      setTimeout(() => {
        scanVisibleUsers();
        render();
      }, 1400);
    }));
    body.append(toolbar);

    const reviewedCount = users.filter((u) => decisions[u.key]).length;
    body.append(el('div', 'xfr-status', `取得 ${users.length}人 / 判定済み ${reviewedCount}人。現段階ではフォロー解除は実行せず、判定だけをchrome.storage.localへ保存します。`));

    panel.append(body);
    root.append(panel);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (isFollowingRoute()) scanVisibleUsers();
    }, 250);
  }

  window.addEventListener('resize', positionHost, { passive: true });
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
    else return;
    event.preventDefault();
  }, true);

  const observer = new MutationObserver(() => {
    if (location.pathname !== lastPathname) {
      lastPathname = location.pathname;
      if (isFollowingRoute()) {
        setTimeout(() => {
          mount();
          positionHost();
          scanVisibleUsers();
        }, 100);
      } else {
        unmount();
      }
      return;
    }
    if (isFollowingRoute()) {
      if (!host) mount();
      positionHost();
      scheduleScan();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  void loadDecisions().then(() => {
    if (isFollowingRoute()) mount();
  });
})();
