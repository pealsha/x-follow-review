(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const TARGET_ACTIONS = new Set(['sync-lists', 'sync-detail']);
  const QUERY_TTL = 6 * 60 * 60 * 1000;

  // Current public fallbacks. Live X bundle discovery always wins.
  const FALLBACK_QUERY_IDS = {
    ListsManagementPageTimeline: '4zAcuxtfEt0_ds2pU17Liw',
    ListMemberships: 'BlEXXdARdSeL_0KyKHHvvg',
    ListMembers: 'BQp2IEYkgxuSxqbTAr1e1g',
  };

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

  const listMemberCache = new Map();
  let bundleScanPromise = null;

  function shared() {
    return window.__xfrGraphqlShared || null;
  }

  function emit(id, ok, payload) {
    window.postMessage({
      marker: MARKER,
      type: 'response',
      id,
      ok,
      ...(ok ? { result: payload } : { error: String(payload?.message || payload) }),
    }, '*');
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
    const ownerResult = obj.user_results?.result || obj.owner_results?.result || obj.user?.result || null;
    return {
      id,
      name,
      description: obj.description || '',
      memberCount: Number(obj.member_count || 0),
      isPrivate: String(obj.mode || '').toLowerCase() === 'private',
      isMember: obj.is_member === true,
      hasMembershipFlag: Object.prototype.hasOwnProperty.call(obj, 'is_member'),
      ownerId: String(ownerResult?.rest_id || ownerResult?.id_str || ownerResult?.legacy?.id_str || ''),
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

  async function waitForHeaders(timeoutMs = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const s = shared();
      if (s?.headers) {
        const headers = new Headers(s.headers);
        if (headers.has('authorization') && headers.has('x-csrf-token')) {
          headers.set('content-type', 'application/json');
          return headers;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Xの認証済みGraphQLヘッダーを取得できませんでした。Following画面を再読み込みしてください。');
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

  function extractId(js, operation) {
    const escaped = operation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const a = new RegExp(`["']?queryId["']?\\s*:\\s*["']([A-Za-z0-9_-]+)["'][^}]{0,900}?["']?operationName["']?\\s*:\\s*["']${escaped}["']`);
    const b = new RegExp(`["']?operationName["']?\\s*:\\s*["']${escaped}["'][^}]{0,900}?["']?queryId["']?\\s*:\\s*["']([A-Za-z0-9_-]+)["']`);
    return js.match(a)?.[1] || js.match(b)?.[1] || '';
  }

  async function discoverQueryId(operation, force = false) {
    const s = shared();
    captureFromPerformance();
    if (!force) {
      const cached = s?.queryIds?.get(operation);
      const at = s?.queryTimes?.get(operation) || 0;
      if (cached && Date.now() - at < QUERY_TTL) return cached;
    }

    if (bundleScanPromise) await bundleScanPromise;
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
          const id = extractId(await response.text(), operation);
          if (id) {
            remember(operation, id);
            return id;
          }
        } catch {}
      }
      return '';
    })().finally(() => { bundleScanPromise = null; });

    const discovered = await bundleScanPromise;
    if (discovered) return discovered;
    return FALLBACK_QUERY_IDS[operation] || '';
  }

  function featuresFor(operation) {
    if (operation === 'UserByScreenName') return PROFILE_FEATURES;
    if (/^List|^Lists/.test(operation)) return LIST_FEATURES;
    return COMMON_FEATURES;
  }

  async function gqlGet(operation, variables = {}) {
    let queryId = await discoverQueryId(operation);
    if (!queryId) throw new Error(`${operation} のqueryIdを取得できませんでした。`);

    const send = async (id) => {
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        features: JSON.stringify(featuresFor(operation)),
      });
      if (operation === 'UserByScreenName') params.set('fieldToggles', JSON.stringify(FIELD_TOGGLES));
      return fetch(`${location.origin}/i/api/graphql/${id}/${operation}?${params}`, {
        method: 'GET',
        headers: await waitForHeaders(),
        credentials: 'include',
      });
    };

    let response = await send(queryId);
    if (response.status === 400 || response.status === 404) {
      const refreshed = await discoverQueryId(operation, true);
      if (refreshed && refreshed !== queryId) {
        queryId = refreshed;
        response = await send(queryId);
      }
    }

    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${operation}: HTTP ${response.status}${text ? ` ${text.slice(0, 180)}` : ''}`);
    if (body?.errors?.length && !body.data) {
      throw new Error(`${operation}: ${body.errors.map((error) => error?.message).filter(Boolean).join(' / ')}`);
    }
    return { body, response };
  }

  async function lookupUser(username) {
    const key = String(username || '').replace(/^@/, '').toLowerCase();
    if (!key) throw new Error('usernameが空です。');
    const s = shared();
    if (s?.lookupCache?.has(key)) return s.lookupCache.get(key);
    const { body } = await gqlGet('UserByScreenName', {
      screen_name: key,
      withGrokTranslatedBio: false,
      withSafetyModeUserFields: true,
    });
    const user = normalizeUser(body?.data?.user?.result) || collectUsers(body)[0];
    if (!user) throw new Error(`@${key} のユーザー情報を取得できませんでした。`);
    s?.lookupCache?.set(key, user);
    return user;
  }

  async function getOwnedLists(viewerId) {
    const { body } = await gqlGet('ListsManagementPageTimeline', { count: 100 });
    const lists = collectLists(body);
    return lists.filter((list) => !list.ownerId || !viewerId || list.ownerId === String(viewerId));
  }

  async function membershipsViaManagement(user, ownedLists) {
    try {
      const { body } = await gqlGet('ListsManagementPageTimeline', {
        count: 100,
        isListMembershipShown: true,
        isListMemberTargetUserId: user.id,
      });
      const lists = collectLists(body);
      if (!lists.some((list) => list.hasMembershipFlag)) return null;
      const ownedIds = new Set(ownedLists.map((list) => String(list.id)));
      return lists.filter((list) => list.isMember && ownedIds.has(String(list.id)));
    } catch {
      return null;
    }
  }

  async function membershipsViaListMemberships(user, ownedLists) {
    try {
      const { body } = await gqlGet('ListMemberships', {
        userId: user.id,
        count: 100,
        isListMembershipShown: true,
        isListMemberTargetUserId: user.id,
      });
      const ownedIds = new Set(ownedLists.map((list) => String(list.id)));
      return collectLists(body).filter((list) => ownedIds.has(String(list.id)));
    } catch {
      return null;
    }
  }

  async function isMemberViaListMembers(list, userId) {
    const key = String(list.id);
    let cache = listMemberCache.get(key);
    if (!cache) {
      cache = { ids: new Set(), cursor: '', done: false };
      listMemberCache.set(key, cache);
    }
    if (cache.ids.has(String(userId))) return true;
    if (cache.done) return false;

    for (let page = 0; page < 100; page += 1) {
      const { body } = await gqlGet('ListMembers', {
        listId: String(list.id),
        count: 100,
        ...(cache.cursor ? { cursor: cache.cursor } : {}),
      });
      const users = collectUsers(body);
      users.forEach((member) => cache.ids.add(String(member.id)));
      if (cache.ids.has(String(userId))) return true;
      const next = bottomCursor(body);
      if (!next || next === cache.cursor || !users.length) {
        cache.done = true;
        return false;
      }
      cache.cursor = next;
      await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 180));
    }
    return false;
  }

  async function membershipsViaMembers(user, ownedLists) {
    const matched = [];
    for (const list of ownedLists) {
      try {
        if (await isMemberViaListMembers(list, user.id)) matched.push(list);
      } catch {
        // One inaccessible list should not fail the whole detail panel.
      }
    }
    return matched;
  }

  async function resolveMemberships(user, ownedLists) {
    const management = await membershipsViaManagement(user, ownedLists);
    if (management !== null) return { lists: management, source: 'ListsManagementPageTimeline' };

    const memberships = await membershipsViaListMemberships(user, ownedLists);
    if (memberships !== null) return { lists: memberships, source: 'ListMemberships' };

    const members = await membershipsViaMembers(user, ownedLists);
    return { lists: members, source: 'ListMembers' };
  }

  async function syncLists() {
    const viewerId = currentUserId();
    const lists = await getOwnedLists(viewerId);
    return { lists, viewerId };
  }

  async function syncDetail(payload) {
    const user = await lookupUser(payload?.username);
    const viewerId = String(payload?.viewerId || currentUserId() || '');

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

    const listsPromise = (async () => {
      const ownedLists = await getOwnedLists(viewerId);
      const membership = await resolveMemberships(user, ownedLists);
      return { ownedLists, ...membership };
    })();

    const [mediaResult, listResult] = await Promise.allSettled([mediaPromise, listsPromise]);
    const media = mediaResult.status === 'fulfilled' ? mediaResult.value : [];
    const ownedLists = listResult.status === 'fulfilled' ? listResult.value.ownedLists : [];
    const lists = listResult.status === 'fulfilled' ? listResult.value.lists : [];

    return {
      user,
      media,
      lists,
      allLists: ownedLists,
      listSource: listResult.status === 'fulfilled' ? listResult.value.source : 'unavailable',
      mediaError: mediaResult.status === 'rejected' ? String(mediaResult.reason?.message || mediaResult.reason) : '',
      listError: listResult.status === 'rejected' ? String(listResult.reason?.message || listResult.reason) : '',
    };
  }

  // This script is loaded before graphql-page.js. Intercept only the two list
  // related actions so the legacy ListOwnerships path never sees them.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'request' || !TARGET_ACTIONS.has(message.action)) return;

    event.stopImmediatePropagation();
    Promise.resolve()
      .then(() => message.action === 'sync-lists' ? syncLists() : syncDetail(message.payload || {}))
      .then((result) => emit(message.id, true, result))
      .catch((error) => emit(message.id, false, error));
  }, true);
})();