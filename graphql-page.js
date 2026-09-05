(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const QUERY_TTL = 6 * 60 * 60 * 1000;
  const shared = window.__xfrGraphqlShared ||= {
    headers: null,
    queryIds: new Map(),
    queryTimes: new Map(),
    lookupCache: new Map(),
  };

  const WANTED = new Set([
    'Following',
    'Bookmarks',
    'UserByScreenName',
    'UserMedia',
    'ListsManagementPageTimeline',
    'ListOwnerships',
    'ListAddMember',
    'ListRemoveMember',
  ]);

  const COMMON_FEATURES = {
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
  };

  const PROFILE_FEATURES = {
    ...COMMON_FEATURES,
    hidden_profile_subscriptions_enabled: true,
    profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false,
    subscriptions_verification_info_is_identity_verified_enabled: true,
    subscriptions_verification_info_verified_since_enabled: true,
    highlights_tweets_tab_ui_enabled: true,
    responsive_web_twitter_article_notes_tab_enabled: true,
  };

  const LIST_FEATURES = {
    ...COMMON_FEATURES,
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

  const FIELD_TOGGLES = {
    withPayments: false,
    withAuxiliaryUserLabels: true,
    withArticleRichContentState: true,
    withArticlePlainText: false,
    withGrokAnalyze: false,
  };

  let bundleScanPromise = null;

  function emit(type, payload = {}) {
    window.postMessage({ marker: MARKER, type, ...payload }, '*');
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
    if (!operation || !queryId) return;
    shared.queryIds.set(operation, queryId);
    shared.queryTimes.set(operation, Date.now());
  }

  function captureHeaders(input, init) {
    try {
      const source = init?.headers || input?.headers;
      if (!source) return;
      const headers = new Headers(source);
      if (headers.size || Array.from(headers.keys()).length) shared.headers = headers;
    } catch {}
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const endpoint = parseEndpoint(rawUrl);
    if (endpoint) {
      remember(endpoint.operation, endpoint.queryId);
      captureHeaders(input, init);
    }
    return nativeFetch(input, init);
  };

  function captureFromPerformance() {
    for (const entry of performance.getEntriesByType('resource')) {
      const endpoint = parseEndpoint(entry.name);
      if (endpoint) remember(endpoint.operation, endpoint.queryId);
    }
  }

  function extractIds(js, wanted) {
    const found = {};
    const patterns = [
      /["']?queryId["']?\s*:\s*["']([A-Za-z0-9_-]+)["'][^}]{0,700}?["']?operationName["']?\s*:\s*["']([^"']+)["']/g,
      /["']?operationName["']?\s*:\s*["']([^"']+)["'][^}]{0,700}?["']?queryId["']?\s*:\s*["']([A-Za-z0-9_-]+)["']/g,
    ];
    patterns.forEach((pattern, index) => {
      for (const match of js.matchAll(pattern)) {
        const operation = match[index === 0 ? 2 : 1];
        const queryId = match[index === 0 ? 1 : 2];
        if (wanted.has(operation)) found[operation] = queryId;
      }
    });
    return found;
  }

  async function scanBundles() {
    if (bundleScanPromise) return bundleScanPromise;
    bundleScanPromise = (async () => {
      captureFromPerformance();
      const missing = () => new Set(Array.from(WANTED).filter((op) => {
        const at = shared.queryTimes.get(op) || 0;
        return !shared.queryIds.get(op) || Date.now() - at > QUERY_TTL;
      }));
      if (!missing().size) return;

      const urls = new Set(Array.from(document.scripts).map((s) => s.src).filter(Boolean));
      try {
        const htmlResponse = await nativeFetch(`${location.origin}/home`, { credentials: 'include' });
        const html = await htmlResponse.text();
        for (const match of html.matchAll(/https:\/\/[^"'\s<>]+\.js(?:\?[^"'\s<>]*)?/g)) urls.add(match[0]);
      } catch {}

      const ranked = Array.from(urls)
        .filter((value) => {
          try { return ['abs.twimg.com', 'x.com'].includes(new URL(value).hostname); } catch { return false; }
        })
        .sort((a, b) => Number(/main\.|client-web|responsive-web/.test(b)) - Number(/main\.|client-web|responsive-web/.test(a)))
        .slice(0, 30);

      for (const url of ranked) {
        const wanted = missing();
        if (!wanted.size) break;
        try {
          const response = await nativeFetch(url, { credentials: 'omit' });
          if (!response.ok) continue;
          const found = extractIds(await response.text(), wanted);
          Object.entries(found).forEach(([operation, queryId]) => remember(operation, queryId));
        } catch {}
      }
    })().finally(() => { bundleScanPromise = null; });
    return bundleScanPromise;
  }

  async function getQueryId(operation, force = false) {
    captureFromPerformance();
    if (!force) {
      const id = shared.queryIds.get(operation);
      const at = shared.queryTimes.get(operation) || 0;
      if (id && Date.now() - at < QUERY_TTL) return id;
    }
    if (force) {
      shared.queryIds.delete(operation);
      shared.queryTimes.delete(operation);
    }
    await scanBundles();
    const resolved = shared.queryIds.get(operation);
    if (!resolved) throw new Error(`${operation} のqueryIdを現在のX bundleから取得できませんでした。`);
    return resolved;
  }

  async function waitForHeaders(timeoutMs = 6000) {
    const started = Date.now();
    while (!shared.headers && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!shared.headers) throw new Error('XのGraphQLリクエストヘッダーを取得できませんでした。Following画面を再読み込みしてください。');
    const headers = new Headers(shared.headers);
    headers.set('content-type', 'application/json');
    return headers;
  }

  function featuresFor(operation) {
    if (operation === 'UserByScreenName') return PROFILE_FEATURES;
    if (/^List|^Lists/.test(operation)) return LIST_FEATURES;
    return COMMON_FEATURES;
  }

  async function gqlGet(operation, variables = {}, forceRefresh = false) {
    const queryId = await getQueryId(operation, forceRefresh);
    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(featuresFor(operation)),
    });
    if (operation === 'UserByScreenName') params.set('fieldToggles', JSON.stringify(FIELD_TOGGLES));
    const url = `${location.origin}/i/api/graphql/${queryId}/${operation}?${params}`;
    const response = await nativeFetch(url, {
      method: 'GET',
      headers: await waitForHeaders(),
      credentials: 'include',
    });
    if ((response.status === 400 || response.status === 404) && !forceRefresh) return gqlGet(operation, variables, true);
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
    if (body?.errors?.length && !body.data) throw new Error(`${operation}: ${body.errors.map((e) => e?.message).filter(Boolean).join(' / ')}`);
    return { body, response };
  }

  async function gqlMutation(operation, variables) {
    const send = async (queryId) => nativeFetch(`${location.origin}/i/api/graphql/${queryId}/${operation}`, {
      method: 'POST',
      headers: await waitForHeaders(),
      credentials: 'include',
      body: JSON.stringify({ variables, queryId }),
    });
    let queryId = await getQueryId(operation);
    let response = await send(queryId);
    if (response.status === 400 || response.status === 404) {
      queryId = await getQueryId(operation, true);
      response = await send(queryId);
    }
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
    const fatal = (body?.errors || []).filter((e) => !/decode/i.test(e?.message || '') && !(e?.path || []).join('.').includes('default_banner_media_results'));
    if (fatal.length) throw new Error(`${operation}: ${fatal.map((e) => e?.message).filter(Boolean).join(' / ')}`);
    return body;
  }

  function walk(value, fn, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    fn(value);
    if (Array.isArray(value)) value.forEach((item) => walk(item, fn, seen));
    else Object.values(value).forEach((item) => walk(item, fn, seen));
  }

  function normalizeUser(result) {
    if (!result || typeof result !== 'object') return null;
    const legacy = result.legacy || {};
    const core = result.core || {};
    const username = core.screen_name || legacy.screen_name || result.screen_name || '';
    const id = String(result.rest_id || result.id_str || legacy.id_str || '');
    if (!id || !username) return null;
    return {
      id,
      username,
      handle: `@${username}`,
      key: `@${username}`.toLowerCase(),
      name: core.name || legacy.name || username,
      bio: result.profile_bio?.description ?? legacy.description ?? '',
      avatarUrl: result.avatar?.image_url || legacy.profile_image_url_https || '',
      profileUrl: `${location.origin}/${username}`,
    };
  }

  function collectUsers(data) {
    const map = new Map();
    walk(data, (obj) => {
      const user = normalizeUser(obj);
      if (user && !map.has(user.id)) map.set(user.id, user);
    });
    return Array.from(map.values());
  }

  function normalizeTweet(tweet) {
    if (!tweet || typeof tweet !== 'object') return null;
    const id = String(tweet.rest_id || tweet.id_str || tweet.legacy?.id_str || '');
    const text = tweet.note_tweet?.note_tweet_results?.result?.text || tweet.legacy?.full_text || tweet.full_text || tweet.text || '';
    if (!id || (!text && !tweet.legacy?.extended_entities?.media)) return null;
    const author = normalizeUser(tweet.core?.user_results?.result || tweet.user_results?.result);
    if (!author) return null;
    const rawMedia = tweet.legacy?.extended_entities?.media || tweet.legacy?.entities?.media || [];
    const media = rawMedia.map((item) => ({
      type: item.type === 'photo' ? 'image' : (item.type || 'media'),
      url: item.media_url_https || item.media_url || '',
    })).filter((item) => item.url);
    return {
      id,
      authorKey: author.key,
      username: author.username,
      text,
      url: `${location.origin}/${author.username}/status/${id}`,
      media,
    };
  }

  function collectTweets(data) {
    const map = new Map();
    walk(data, (obj) => {
      const tweet = normalizeTweet(obj);
      if (tweet && !map.has(tweet.id)) map.set(tweet.id, tweet);
    });
    return Array.from(map.values());
  }

  function normalizeList(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const id = String(obj.id_str || obj.rest_id || '');
    const name = typeof obj.name === 'string' ? obj.name : '';
    if (!id || !name || !('member_count' in obj || 'mode' in obj || 'subscriber_count' in obj || 'is_member' in obj)) return null;
    return {
      id,
      name,
      description: obj.description || '',
      memberCount: Number(obj.member_count || 0),
      isPrivate: String(obj.mode || '').toLowerCase() === 'private',
      isMember: obj.is_member === true,
    };
  }

  function collectLists(data) {
    const map = new Map();
    walk(data, (obj) => {
      const list = normalizeList(obj);
      if (list && !map.has(list.id)) map.set(list.id, list);
    });
    return Array.from(map.values());
  }

  function bottomCursor(data) {
    let cursor = '';
    walk(data, (obj) => {
      if (cursor) return;
      if (obj.cursorType === 'Bottom' && typeof obj.value === 'string') cursor = obj.value;
      else if (typeof obj.entryId === 'string' && /cursor-bottom/i.test(obj.entryId) && typeof obj.content?.value === 'string') cursor = obj.content.value;
    });
    return cursor;
  }

  function currentUserId() {
    try {
      const raw = document.cookie.split(';').map((v) => v.trim()).find((v) => v.startsWith('twid='))?.slice(5) || '';
      return decodeURIComponent(raw).match(/u=(\d+)/)?.[1] || '';
    } catch {
      return '';
    }
  }

  async function lookupUser(username) {
    const key = String(username || '').replace(/^@/, '').toLowerCase();
    if (!key) throw new Error('usernameが空です。');
    if (shared.lookupCache.has(key)) return shared.lookupCache.get(key);
    const { body } = await gqlGet('UserByScreenName', {
      screen_name: key,
      withGrokTranslatedBio: false,
      withSafetyModeUserFields: true,
    });
    const user = normalizeUser(body?.data?.user?.result) || collectUsers(body)[0];
    if (!user) throw new Error(`@${key} のユーザー情報を取得できませんでした。`);
    shared.lookupCache.set(key, user);
    return user;
  }

  async function pause(response, fallback = 450) {
    const remaining = Number(response?.headers?.get('x-rate-limit-remaining'));
    const reset = Number(response?.headers?.get('x-rate-limit-reset'));
    if (Number.isFinite(remaining) && remaining <= 3 && Number.isFinite(reset)) {
      const wait = Math.min(Math.max(reset * 1000 - Date.now() + 1000, 1000), 15 * 60 * 1000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, fallback + Math.random() * 220));
  }

  async function syncFollowing(requestId) {
    const userId = currentUserId();
    if (!userId) throw new Error('twid cookieからログイン中ユーザーIDを取得できませんでした。');
    let cursor = '';
    const seen = new Map();
    for (let page = 0; page < 300; page += 1) {
      const { body, response } = await gqlGet('Following', {
        userId,
        count: 50,
        includePromotedContent: false,
        ...(cursor ? { cursor } : {}),
      });
      const fresh = collectUsers(body).filter((user) => user.id !== userId && !seen.has(user.id));
      fresh.forEach((user) => seen.set(user.id, user));
      emit('progress', { id: requestId, kind: 'following', items: fresh, total: seen.size });
      const next = bottomCursor(body);
      if (!next || next === cursor || (!fresh.length && page > 1)) break;
      cursor = next;
      await pause(response, 350);
    }
    return { users: Array.from(seen.values()) };
  }

  async function syncBookmarks(requestId) {
    let cursor = '';
    const seen = new Map();
    for (let page = 0; page < 500; page += 1) {
      const { body, response } = await gqlGet('Bookmarks', { count: 50, ...(cursor ? { cursor } : {}) });
      const fresh = collectTweets(body).filter((tweet) => !seen.has(tweet.id));
      fresh.forEach((tweet) => seen.set(tweet.id, tweet));
      emit('progress', { id: requestId, kind: 'bookmarks', items: fresh, total: seen.size });
      const next = bottomCursor(body);
      if (!next || next === cursor || (!fresh.length && page > 1)) break;
      cursor = next;
      await pause(response, 800);
    }
    return { posts: Array.from(seen.values()) };
  }

  async function syncLists() {
    try {
      const { body } = await gqlGet('ListsManagementPageTimeline', { count: 100 });
      return { lists: collectLists(body), viewerId: currentUserId() };
    } catch (firstError) {
      const userId = currentUserId();
      if (!userId) throw firstError;
      const { body } = await gqlGet('ListOwnerships', {
        userId,
        count: 100,
        isListMembershipShown: true,
        isListMemberTargetUserId: userId,
      });
      return { lists: collectLists(body), viewerId: userId };
    }
  }

  async function syncDetail(username, viewerId = '') {
    const user = await lookupUser(username);
    const ownerId = viewerId || currentUserId();
    const mediaPromise = gqlGet('UserMedia', {
      userId: user.id,
      count: 20,
      includePromotedContent: false,
      withClientEventToken: false,
      withBirdwatchNotes: false,
      withVoice: true,
    }).then(({ body }) => collectTweets(body)
      .flatMap((tweet) => tweet.media.map((media) => ({ ...media, postUrl: tweet.url, postId: tweet.id })))
      .slice(0, 18));

    const membershipsPromise = ownerId
      ? gqlGet('ListOwnerships', {
          userId: ownerId,
          isListMemberTargetUserId: user.id,
          count: 100,
          isListMembershipShown: true,
        }).then(({ body }) => collectLists(body))
      : Promise.resolve([]);

    const [media, allLists] = await Promise.all([mediaPromise, membershipsPromise]);
    return { user, media, lists: allLists.filter((list) => list.isMember), allLists };
  }

  async function toggleList(payload) {
    const user = await lookupUser(payload?.username);
    const operation = payload?.add ? 'ListAddMember' : 'ListRemoveMember';
    await gqlMutation(operation, { listId: String(payload?.listId || ''), userId: user.id });
    return { ok: true, operation, userId: user.id, listId: String(payload?.listId || '') };
  }

  async function handle(action, payload, requestId) {
    if (action === 'discover') {
      await scanBundles();
      return Object.fromEntries(shared.queryIds);
    }
    if (action === 'sync-following') return syncFollowing(requestId);
    if (action === 'sync-bookmarks') return syncBookmarks(requestId);
    if (action === 'sync-lists') return syncLists();
    if (action === 'sync-detail') return syncDetail(payload?.username, payload?.viewerId || '');
    if (action === 'toggle-list') return toggleList(payload || {});
    throw new Error(`Unknown GraphQL action: ${action}`);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'request') return;
    Promise.resolve()
      .then(() => handle(message.action, message.payload || {}, message.id))
      .then((result) => emit('response', { id: message.id, ok: true, result }))
      .catch((error) => emit('response', { id: message.id, ok: false, error: String(error?.message || error) }));
  });

  captureFromPerformance();
  emit('ready');
})();
