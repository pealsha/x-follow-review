(() => {
  const shared = window.__xfrGraphqlShared;
  if (!shared || window.__xfrGraphqlXhrInstalled) return;
  window.__xfrGraphqlXhrInstalled = true;

  function usableHeaders(value) {
    try {
      const headers = new Headers(value || undefined);
      return headers.has('authorization') && headers.has('x-csrf-token');
    } catch {
      return false;
    }
  }

  let acceptedHeaders = usableHeaders(shared.headers) ? new Headers(shared.headers) : null;
  try {
    Object.defineProperty(shared, 'headers', {
      configurable: true,
      enumerable: true,
      get() { return acceptedHeaders; },
      set(value) {
        if (!usableHeaders(value)) return;
        acceptedHeaders = new Headers(value);
      },
    });
  } catch {}

  function parseEndpoint(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      const match = url.pathname.match(/\/graphql\/([^/]+)\/([^/?#]+)/);
      return match ? {
        queryId: decodeURIComponent(match[1]),
        operation: decodeURIComponent(match[2]),
      } : null;
    } catch {
      return null;
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__xfrGraphqlRequest = {
      method: String(method || 'GET').toUpperCase(),
      url: String(url || ''),
      headers: {},
    };
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    const meta = this.__xfrGraphqlRequest;
    if (meta) meta.headers[String(name || '').toLowerCase()] = String(value || '');
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    const meta = this.__xfrGraphqlRequest;
    const endpoint = meta ? parseEndpoint(meta.url) : null;
    if (endpoint) {
      shared.queryIds?.set(endpoint.operation, endpoint.queryId);
      shared.queryTimes?.set(endpoint.operation, Date.now());
      if (usableHeaders(meta.headers)) shared.headers = meta.headers;
    }
    return originalSend.apply(this, arguments);
  };
})();
