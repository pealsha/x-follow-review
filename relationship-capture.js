(() => {
  const MARKER = 'X_FOLLOW_REVIEW_RELATION_V1';
  const nativeFetch = window.fetch.bind(window);

  function operationFromUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      const url = new URL(raw, location.href);
      const match = url.pathname.match(/\/graphql\/[^/]+\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    } catch {
      return '';
    }
  }

  function walk(value, fn, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    fn(value);
    if (Array.isArray(value)) value.forEach((item) => walk(item, fn, seen));
    else Object.values(value).forEach((item) => walk(item, fn, seen));
  }

  function relationFromUser(obj) {
    if (!obj || typeof obj !== 'object' || obj.__typename === 'UserUnavailable') return null;
    const legacy = obj.legacy || {};
    const core = obj.core || {};
    const perspectives = obj.relationship_perspectives || legacy.relationship_perspectives || {};
    const username = core.screen_name || legacy.screen_name || obj.screen_name || '';
    const id = String(obj.rest_id || obj.id_str || legacy.id_str || '');
    if (!id || !username) return null;

    let followsYou;
    if (typeof perspectives.followed_by === 'boolean') followsYou = perspectives.followed_by;
    else if (typeof legacy.followed_by === 'boolean') followsYou = legacy.followed_by;
    else if (typeof obj.followed_by === 'boolean') followsYou = obj.followed_by;
    else return null;

    return {
      id,
      key: `@${username}`.toLowerCase(),
      followsYou,
    };
  }

  function emitRelations(body) {
    const map = new Map();
    walk(body, (obj) => {
      const relation = relationFromUser(obj);
      if (relation) map.set(relation.id, relation);
    });
    if (!map.size) return;
    window.postMessage({
      marker: MARKER,
      type: 'relations',
      items: Array.from(map.values()),
    }, '*');
  }

  window.fetch = async function(input, init = {}) {
    const response = await nativeFetch(input, init);
    const operation = operationFromUrl(input);
    if (operation === 'Following' || operation === 'UserByScreenName') {
      response.clone().json().then(emitRelations).catch(() => {});
    }
    return response;
  };
})();
