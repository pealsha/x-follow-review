(() => {
  const MARKER = 'X_FOLLOW_REVIEW_GQL_V1';
  const shared = window.__xfrGraphqlShared ||= { headers: null, queryIds: new Map() };

  function emit(type, payload = {}) {
    window.postMessage({ marker: MARKER, type, ...payload }, '*');
  }

  function parseEndpoint(raw) {
    try {
      const url = new URL(raw, location.href);
      const match = url.pathname.match(/\/graphql\/([^/]+)\/([^/?#]+)/);
      return match ? { queryId: match[1], operation: match[2] } : null;
    } catch {
      return null;
    }
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    const endpoint = parseEndpoint(rawUrl);
    if (endpoint) {
      shared.queryIds.set(endpoint.operation, endpoint.queryId);
      try {
        const sourceHeaders = init.headers || input?.headers;
        if (sourceHeaders) shared.headers = new Headers(sourceHeaders);
      } catch {}
    }
    return nativeFetch(input, init);
  };

  emit('ready');
})();
