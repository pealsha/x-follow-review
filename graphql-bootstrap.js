(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const BOOKMARKS_OPERATION = 'Bookmarks';
  const BOOKMARKS_QUERY_ID_FALLBACK = 'iblrFnKr6PZUR-dWpfXG6g';

  const shared = window.__xfrGraphqlShared ||= {
    headers: null,
    queryIds: new Map(),
    queryTimes: new Map(),
    lookupCache: new Map(),
  };

  const ownedLists = new Map();
  const actionsById = new Map();

  function remember(operation, queryId) {
    if (!operation || !queryId) return;
    shared.queryIds?.set(operation, queryId);
    shared.queryTimes?.set(operation, Date.now());
  }

  // Bookmarks is commonly placed in a lazy X chunk, so the generic main-bundle
  // scan may miss it. Seed the last known working id immediately, then try to
  // discover the current lazy-chunk id without opening another tab.
  remember(BOOKMARKS_OPERATION, BOOKMARKS_QUERY_ID_FALLBACK);

  function walk(value, fn, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    fn(value);
    if (Array.isArray(value)) value.forEach((item) => walk(item, fn, seen));
    else Object.values(value).forEach((item) => walk(item, fn, seen));
  }

  function collectLists(body) {
    walk(body, (obj) => {
      if (!obj || typeof obj !== 'object') return;
      const legacy = obj.legacy || {};
      const id = String(obj.rest_id || obj.id_str || legacy.id_str || '');
      const name = obj.name || legacy.name || '';
      const looksLikeList =
        'member_count' in obj || 'member_count' in legacy ||
        'mode' in obj || 'mode' in legacy ||
        'is_member' in obj || 'is_member' in legacy;
      if (!id || !name || !looksLikeList) return;
      ownedLists.set(id, {
        id,
        name,
        description: obj.description || legacy.description || '',
        memberCount: Number(obj.member_count ?? legacy.member_count ?? 0),
        isPrivate: String(obj.mode || legacy.mode || '').toLowerCase() === 'private',
      });
    });
  }

  function operationFromUrl(raw) {
    try {
      const url = new URL(typeof raw === 'string' ? raw : raw?.url, location.href);
      const match = url.pathname.match(/\/graphql\/([^/]+)\/([^/?#]+)/);
      return match ? decodeURIComponent(match[2]) : '';
    } catch {
      return '';
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    if (operationFromUrl(input) === 'ListsManagementPageTimeline') {
      try {
        collectLists(await response.clone().json());
      } catch {}
    }
    return response;
  };

  const nativePostMessage = window.postMessage.bind(window);
  window.postMessage = function(message, targetOrigin, transfer) {
    try {
      if (message?.marker === MARKER && message?.id) {
        if (message.type === 'request') {
          actionsById.set(message.id, message.action || '');
        } else if (message.type === 'response') {
          const action = actionsById.get(message.id);
          actionsById.delete(message.id);
          if (
            action === 'sync-lists' &&
            message.ok &&
            Array.isArray(message.result?.lists) &&
            message.result.lists.length === 0 &&
            ownedLists.size
          ) {
            message = {
              ...message,
              result: { ...message.result, lists: Array.from(ownedLists.values()) },
            };
          }
        }
      }
    } catch {}
    return nativePostMessage(message, targetOrigin, transfer);
  };

  function extractBookmarksQueryId(text) {
    return text.match(/queryId:\s*["']([A-Za-z0-9_-]+)["'][^}]{0,900}?operationName:\s*["']Bookmarks["']/)?.[1]
      || text.match(/operationName:\s*["']Bookmarks["'][^}]{0,900}?queryId:\s*["']([A-Za-z0-9_-]+)["']/)?.[1]
      || '';
  }

  async function discoverBookmarksQueryId() {
    try {
      const html = await nativeFetch(`${location.origin}/i/history`, { credentials: 'include' }).then((r) => r.text());
      const urls = Array.from(html.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[\w.-]+\.js/g), (m) => m[0]);
      const main = urls.find((url) => /\/main\.[\w-]+\.js$/.test(url));
      const candidates = main ? [main, ...urls.filter((url) => url !== main).slice(0, 12)] : urls.slice(0, 12);

      for (const url of candidates) {
        const js = await nativeFetch(url, { credentials: 'omit' }).then((r) => r.ok ? r.text() : '');
        let queryId = extractBookmarksQueryId(js);
        if (queryId) {
          remember(BOOKMARKS_OPERATION, queryId);
          return;
        }

        if (!/\/main\.[\w-]+\.js$/.test(url)) continue;
        const hash = js.match(/["']bookmarks["']\s*:\s*["']([\w-]+)["']/i)?.[1];
        if (!hash) continue;
        const base = url.replace(/main\.[\w-]+\.js$/, '');
        for (const chunkUrl of [`${base}bookmarks.${hash}a.js`, `${base}bookmarks.${hash}.js`]) {
          const chunk = await nativeFetch(chunkUrl, { credentials: 'omit' }).then((r) => r.ok ? r.text() : '').catch(() => '');
          queryId = extractBookmarksQueryId(chunk);
          if (queryId) {
            remember(BOOKMARKS_OPERATION, queryId);
            return;
          }
        }
      }
    } catch {}
  }

  void discoverBookmarksQueryId();
})();
