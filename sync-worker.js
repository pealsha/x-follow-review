(() => {
  let running = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function safeSend(message) {
    try {
      const pending = chrome.runtime.sendMessage(message);
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {}
  }

  function statusLink(root) {
    return Array.from(root.querySelectorAll('a[href]')).find((a) => /^\/[A-Za-z0-9_]+\/status\/\d+/.test(a.getAttribute('href') || ''));
  }

  function extractTweet(article) {
    const link = statusLink(article);
    if (!link) return null;
    const href = link.getAttribute('href') || '';
    const match = href.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
    if (!match) return null;

    const [, username, id] = match;
    const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || '';
    const images = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]'))
      .map((img) => img.src)
      .filter(Boolean);
    const videoPosters = Array.from(article.querySelectorAll('video[poster]'))
      .map((video) => video.poster)
      .filter(Boolean);

    return {
      id,
      username,
      authorKey: `@${username}`.toLowerCase(),
      url: new URL(`/${username}/status/${id}`, location.origin).href,
      text,
      media: [
        ...images.map((url) => ({ type: 'image', url })),
        ...videoPosters.map((url) => ({ type: 'video', url })),
      ],
    };
  }

  function collectTweets(map) {
    document.querySelectorAll('article[data-testid="tweet"], [data-testid="tweet"]').forEach((article) => {
      const tweet = extractTweet(article);
      if (tweet) map.set(tweet.id, tweet);
    });
  }

  function extractUserCell(cell) {
    const handle = Array.from(cell.querySelectorAll('span'))
      .map((span) => (span.textContent || '').trim())
      .find((text) => /^@[A-Za-z0-9_]{1,15}$/.test(text));
    if (!handle) return null;
    return { handle, key: handle.toLowerCase() };
  }

  async function scrollUntilStable(scan, { maxRounds = 300, stableLimit = 6, delay = 650 } = {}) {
    let stable = 0;
    let previousCount = -1;
    for (let round = 0; round < maxRounds; round += 1) {
      const count = scan();
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 160;
      if (count === previousCount && atBottom) stable += 1;
      else stable = 0;
      if (stable >= stableLimit) return count;
      previousCount = count;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      await sleep(delay);
    }
    return scan();
  }

  async function syncBookmarks() {
    const posts = new Map();
    await scrollUntilStable(() => {
      collectTweets(posts);
      safeSend({ type: 'XFR_SYNC_WORKER_PROGRESS', kind: 'bookmarks', count: posts.size });
      return posts.size;
    }, { maxRounds: 500, stableLimit: 7, delay: 700 });
    return { posts: Array.from(posts.values()) };
  }

  function listNameFromAnchor(anchor) {
    const text = (anchor.innerText || '').split('\n').map((line) => line.trim()).filter(Boolean);
    return text[0] || `List ${anchor.getAttribute('href')?.split('/').pop() || ''}`;
  }

  async function syncLists() {
    const lists = new Map();
    await scrollUntilStable(() => {
      document.querySelectorAll('a[href]').forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const match = href.match(/^\/i\/lists\/(\d+)\/?$/);
        if (!match) return;
        const id = match[1];
        if (!lists.has(id)) lists.set(id, { id, name: listNameFromAnchor(anchor) });
      });
      safeSend({ type: 'XFR_SYNC_WORKER_PROGRESS', kind: 'lists', count: lists.size });
      return lists.size;
    }, { maxRounds: 80, stableLimit: 5, delay: 650 });
    return { lists: Array.from(lists.values()) };
  }

  async function syncListMembers(meta) {
    const members = new Map();
    await scrollUntilStable(() => {
      document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
        const user = extractUserCell(cell);
        if (user) members.set(user.key, user);
      });
      safeSend({ type: 'XFR_SYNC_WORKER_PROGRESS', kind: 'list-members', count: members.size, meta });
      return members.size;
    }, { maxRounds: 220, stableLimit: 6, delay: 650 });
    return { members: Array.from(members.values()), list: meta };
  }

  async function syncMedia(meta) {
    const tweets = new Map();
    await scrollUntilStable(() => {
      collectTweets(tweets);
      const withMedia = Array.from(tweets.values()).filter((tweet) => tweet.media.length > 0);
      safeSend({ type: 'XFR_SYNC_WORKER_PROGRESS', kind: 'media', count: withMedia.length, meta });
      return withMedia.length;
    }, { maxRounds: 35, stableLimit: 4, delay: 550 });

    const items = Array.from(tweets.values())
      .filter((tweet) => tweet.media.length > 0)
      .slice(0, 18)
      .flatMap((tweet) => tweet.media.map((media) => ({ ...media, postUrl: tweet.url, postId: tweet.id })));
    return { username: meta?.username || '', items: items.slice(0, 18) };
  }

  async function run(kind, meta) {
    if (running) return;
    running = true;
    try {
      await sleep(800);
      let data;
      if (kind === 'bookmarks') data = await syncBookmarks();
      else if (kind === 'lists') data = await syncLists();
      else if (kind === 'list-members') data = await syncListMembers(meta);
      else if (kind === 'media') data = await syncMedia(meta);
      else throw new Error(`unknown sync kind: ${kind}`);
      safeSend({ type: 'XFR_SYNC_WORKER_RESULT', kind, meta, data });
    } catch (error) {
      safeSend({ type: 'XFR_SYNC_WORKER_ERROR', kind, meta, error: String(error?.message || error) });
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'XFR_SYNC_WORKER_START') return;
    void run(message.kind, message.meta || {});
  });
})();
