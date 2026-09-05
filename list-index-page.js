(() => {
  const MARKER = 'X_FOLLOW_REVIEW_LIST_INDEX_V1';
  const QUERY_TTL = 6 * 60 * 60 * 1000;
  const FALLBACK_QUERY_ID = 'BQp2IEYkgxuSxqbTAr1e1g';
  const OPERATION = 'ListMembers';

  const LIST_FEATURES = {
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    responsive_web_edit_tweet_api_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
    articles_preview_enabled: true,
    rweb_video_screen_enabled: false,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    premium_content_api_read_enabled: false,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true,
    responsive_web_grok_share_attachment_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  };

  let bundleScanPromise = null;

  function shared() {
    return window.__xfrGraphqlShared || null;
  }

  function emit(type, payload = {}) {
    window.postMessage({ marker: MARKER, type, ...payload }, '*');
  }

  function usableHeaders(value) {
    try {
      const headers = new Headers(value || undefined);
      return headers.has('authorization') && headers.has('x-csrf-token');
    } catch {
      return false;
    }
  }

  async function waitForHeaders(timeoutMs = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const s = shared();
      if (usableHeaders(s?.headers)) {
        const headers = new Headers(s.headers);
        headers.set('content-type', 'application/json');
        return headers;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Xの認証済みGraphQLヘッダーを取得できませんでした。');
  }

  function parseEndpoint(raw) {
    try {
      const url = new URL(raw, location.href);
      const match = url.pathname.match(/\/graphql\/([^/]+)\/([^/?#]+)/);
      return match ? { queryId: decodeURIComponent(match[1]), operation: decodeURIComponent(match[2]) } : null;
    } catch {
      return null;
    }
  }

  function remember(operation, queryId) {
    const s = shared();
    if (!s || !operation || !queryId) return;
    s.queryIds?.set(operation, queryId);
    s.queryTimes?.set(operation, Date.now());
  }

  function captureFromPerformance() {
    for (const entry of performance.getEntriesByType('resource')) {
      const endpoint = parseEndpoint(entry.name);
      if (endpoint) remember(endpoint.operation, endpoint.queryId);
    }
  }

  function extractId(js) {
    const a = /["']?queryId["']?\s*:\s*["']([A-Za-z0-9_-]+)["'][^}]{0,900}?["']?operationName["']?\s*:\s*["']ListMembers["']/;
    const b = /["']?operationName["']?\s*:\s*["']ListMembers["'][^}]{0,900}?["']?queryId["']?\s*:\s*["']([A-Za-z0-9_-]+)["']/;
    return js.match(a)?.[1] || js.match(b)?.[1] || '';
  }

  async function discoverQueryId(force = false) {
    captureFromPerformance();
    const s = shared();
    const cached = s?.queryIds?.get(OPERATION);
    const at = s?.queryTimes?.get(OPERATION) || 0;
    if (!force && cached && Date.now() - at < QUERY_TTL) return cached;

    if (force) {
      s?.queryIds?.delete(OPERATION);
      s?.queryTimes?.delete(OPERATION);
    }

    if (bundleScanPromise) return bundleScanPromise;
    bundleScanPromise = (async () => {
      const urls = new Set(Array.from(document.scripts).map((script) => script.src).filter(Boolean));
      try {
        const response = await fetch(`${location.origin}/home`, { credentials: 'include' });
        const html = await response.text();
        for (const match of html.matchAll(/https:\/\/[^"'\s<>]+\.js(?:\?[^"'\s<>]*)?/g)) urls.add(match[0]);
      } catch {}

      const ranked = Array.from(urls)
        .filter((value) => {
          try { return ['abs.twimg.com', 'x.com'].includes(new URL(value).hostname); } catch { return false; }
        })
        .sort((a, b) => Number(/main\.|client-web|responsive-web/.test(b)) - Number(/main\.|client-web|responsive-web/.test(a)))
        .slice(0, 40);

      for (const url of ranked) {
        try {
          const response = await fetch(url, { credentials: 'omit' });
          if (!response.ok) continue;
          const queryId = extractId(await response.text());
          if (queryId) {
            remember(OPERATION, queryId);
            return queryId;
          }
        } catch {}
      }
      return FALLBACK_QUERY_ID;
    })().finally(() => { bundleScanPromise = null; });

    return bundleScanPromise;
  }

  async function gqlListMembers(listId, cursor = '', forceRefresh = false) {
    const queryId = await discoverQueryId(forceRefresh);
    const variables = {
      listId: String(listId),
      count: 100,
      ...(cursor ? { cursor } : {}),
    };
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(LIST_FEATURES),
    });
    const response = await fetch(`${location.origin}/i/api/graphql/${queryId}/${OPERATION}?${params}`, {
      method: 'GET',
      headers: await waitForHeaders(),
      credentials: 'include',
    });
    if ((response.status === 400 || response.status === 404) && !forceRefresh) {
      return gqlListMembers(listId, cursor, true);
    }
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${OPERATION}: HTTP ${response.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
    if (body?.errors?.length && !body.data) {
      throw new Error(`${OPERATION}: ${body.errors.map((error) => error?.message).filter(Boolean).join(' / ')}`);
    }
    return body;
  }

  function walk(value, fn, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    fn(value);
    if (Array.isArray(value)) value.forEach((item) => walk(item, fn, seen));
    else Object.values(value).forEach((item) => walk(item, fn, seen));
  }

  function collectUserIds(data) {
    const ids = new Set();
    walk(data, (obj) => {
      if (obj?.__typename === 'UserUnavailable') return;
      const legacy = obj?.legacy || {};
      const core = obj?.core || {};
      const username = core.screen_name || legacy.screen_name || obj?.screen_name || '';
      const id = String(obj?.rest_id || obj?.id_str || legacy.id_str || '');
      if (id && username) ids.add(id);
    });
    return ids;
  }

  function bottomCursor(data) {
    let cursor = '';
    walk(data, (obj) => {
      if (cursor) return;
      if (obj.cursorType === 'Bottom' && typeof obj.value === 'string') cursor = obj.value;
      else if (typeof obj.entryId === 'string' && /cursor-bottom/i.test(obj.entryId) && typeof obj.content?.value === 'string') cursor = obj.content.value;
      else if (typeof obj.entryId === 'string' && /cursor-bottom/i.test(obj.entryId) && typeof obj.content?.itemContent?.value === 'string') cursor = obj.content.itemContent.value;
    });
    return cursor;
  }

  async function fetchAllMembers(listId) {
    const ids = new Set();
    let cursor = '';
    for (let page = 0; page < 100; page += 1) {
      const body = await gqlListMembers(listId, cursor);
      collectUserIds(body).forEach((id) => ids.add(id));
      const next = bottomCursor(body);
      if (!next || next === cursor) break;
      cursor = next;
    }
    return ids;
  }

  async function buildIndex(requestId, payload) {
    const lists = Array.isArray(payload?.lists) ? payload.lists : [];
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const memberships = {};
    const userById = new Map();

    for (const user of users) {
      const id = String(user?.id || '');
      const key = String(user?.key || user?.handle || '').toLowerCase();
      if (!id || !key) continue;
      userById.set(id, key);
      memberships[key] = [];
    }

    for (let index = 0; index < lists.length; index += 1) {
      const list = lists[index];
      if (!list?.id) continue;
      const memberIds = await fetchAllMembers(list.id);
      for (const memberId of memberIds) {
        const key = userById.get(String(memberId));
        if (!key) continue;
        memberships[key].push({ id: String(list.id), name: list.name || String(list.id) });
      }
      emit('progress', {
        id: requestId,
        memberships,
        completed: index + 1,
        total: lists.length,
      });
    }

    return { memberships, listCount: lists.length, userCount: userById.size };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'request') return;
    if (message.action !== 'sync-list-index') return;

    void buildIndex(message.id, message.payload || {})
      .then((result) => emit('response', { id: message.id, ok: true, result }))
      .catch((error) => emit('response', { id: message.id, ok: false, error: String(error?.message || error) }));
  });
})();
