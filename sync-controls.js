(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const CONTROL_MARKER = 'X_FOLLOW_REVIEW_CONTROL_V1';
  const REOPEN_KEY = 'xFollowReview.reopenAfterReload.v1';
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

  let shadow = null;
  let observer = null;
  let autoOpenTimer = 0;

  function controlButton(text, action, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.dataset.xfrControl = action;
    button.style.padding = '6px 10px';
    button.style.fontSize = '12px';
    if (danger) {
      button.style.borderColor = '#f4212e';
      button.style.color = '#f4212e';
    }
    return button;
  }

  async function forceResync() {
    if (!window.confirm('キャッシュ表示は残したまま、Following・Bookmarks・Listsを最初から再同期しますか？')) return;
    try {
      const stored = await chrome.storage.local.get(KEYS.bookmarkMeta);
      const bookmarkMeta = stored[KEYS.bookmarkMeta] && typeof stored[KEYS.bookmarkMeta] === 'object'
        ? stored[KEYS.bookmarkMeta]
        : {};
      await chrome.storage.local.set({
        [KEYS.bookmarkMeta]: { ...bookmarkMeta, lastFullSyncAt: 1 },
        [KEYS.memberships]: {},
        [KEYS.memberCache]: {},
        [KEYS.indexMeta]: {},
        [KEYS.media]: {},
      });
      sessionStorage.setItem(REOPEN_KEY, 'force');
      location.reload();
    } catch (error) {
      window.alert(`強制再同期の準備に失敗しました: ${error.message}`);
    }
  }

  function clearPageQueryCache() {
    const id = `xfr-control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.postMessage({
      marker: CONTROL_MARKER,
      type: 'request',
      id,
      action: 'clear-query-cache',
    }, '*');
  }

  async function resetCache() {
    if (!window.confirm('Follow Reviewのキャッシュをすべて削除して、最初から取得し直しますか？')) return;
    try {
      await chrome.storage.local.remove(Object.values(KEYS));
      clearPageQueryCache();
      sessionStorage.setItem(REOPEN_KEY, 'reset');
      setTimeout(() => location.reload(), 80);
    } catch (error) {
      window.alert(`キャッシュ初期化に失敗しました: ${error.message}`);
    }
  }

  function installControls() {
    if (!shadow) return;
    const top = shadow.querySelector('.xfr-topbar');
    if (!top || top.querySelector('[data-xfr-controls="true"]')) return;

    const group = document.createElement('div');
    group.dataset.xfrControls = 'true';
    group.style.display = 'flex';
    group.style.gap = '6px';
    group.style.alignItems = 'center';

    const force = controlButton('強制再同期', 'force');
    const reset = controlButton('キャッシュ初期化', 'reset', true);
    force.addEventListener('click', () => void forceResync());
    reset.addEventListener('click', () => void resetCache());
    group.append(force, reset);

    const close = Array.from(top.querySelectorAll('button')).find((button) => (button.textContent || '').includes('通常表示'));
    if (close) top.insertBefore(group, close);
    else top.append(group);
  }

  function tryAutoOpen() {
    if (!sessionStorage.getItem(REOPEN_KEY) || !shadow) return;
    const toggle = shadow.querySelector('.xfr-toggle');
    if (!toggle) return;
    sessionStorage.removeItem(REOPEN_KEY);
    clearTimeout(autoOpenTimer);
    autoOpenTimer = setTimeout(() => toggle.click(), 180);
  }

  function patch() {
    installControls();
    tryAutoOpen();
  }

  function attach() {
    const next = document.getElementById(HOST_ID)?.shadowRoot;
    if (!next || next === shadow) return;
    observer?.disconnect();
    shadow = next;
    observer = new MutationObserver(patch);
    observer.observe(shadow, { childList: true, subtree: true });
    patch();
  }

  const pageObserver = new MutationObserver(attach);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  attach();
})();
