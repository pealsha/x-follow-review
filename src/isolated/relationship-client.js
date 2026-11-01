(() => {
  const MARKER = 'X_FOLLOW_REVIEW_RELATION_V1';
  const FOLLOWING_KEY = 'xFollowReview.following.v1';
  const relations = new Map();
  let timer = 0;
  let applying = false;

  function canonical(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/^@/, '');
    return raw ? `@${raw}` : '';
  }

  function remember(items) {
    for (const item of items || []) {
      if (typeof item?.followsYou !== 'boolean') continue;
      const id = String(item.id || '');
      const key = canonical(item.key);
      if (id) relations.set(`id:${id}`, item.followsYou);
      if (key) relations.set(`key:${key}`, item.followsYou);
    }
  }

  function relationFor(user) {
    const id = String(user?.id || '');
    const key = canonical(user?.key || user?.handle || user?.username);
    if (id && relations.has(`id:${id}`)) return relations.get(`id:${id}`);
    if (key && relations.has(`key:${key}`)) return relations.get(`key:${key}`);
    return undefined;
  }

  async function apply() {
    if (applying || !relations.size) return;
    applying = true;
    try {
      const stored = await chrome.storage.local.get(FOLLOWING_KEY);
      const users = Array.isArray(stored[FOLLOWING_KEY]) ? stored[FOLLOWING_KEY] : [];
      let changed = false;
      const next = users.map((user) => {
        const followsYou = relationFor(user);
        if (typeof followsYou !== 'boolean' || user.followsYou === followsYou) return user;
        changed = true;
        return { ...user, followsYou };
      });
      if (changed) await chrome.storage.local.set({ [FOLLOWING_KEY]: next });
    } catch {} finally {
      applying = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void apply(), 120);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'relations') return;
    remember(message.items);
    schedule();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && FOLLOWING_KEY in changes && relations.size) schedule();
  });
})();
