(() => {
  const MARKER = 'X_FOLLOW_REVIEW_PROBE_V1';
  const MAX_DEPTH = 12;
  const STRUCTURAL_KEYS = new Set(['__typename','cursorType','type','displayType','resultType','entryId','entryType','moduleDisplayType']);

  function parseGraphqlUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      const match = url.pathname.match(/\/(?:i\/api\/)?graphql\/([^/]+)\/([^/?#]+)/);
      if (!match) return null;
      return {
        queryId: decodeURIComponent(match[1]),
        operation: decodeURIComponent(match[2]),
        endpoint: `${url.origin}${url.pathname}`,
        query: Object.fromEntries(url.searchParams.entries()),
      };
    } catch {
      return null;
    }
  }

  function summarize(value, depth = 0, key = '') {
    if (depth >= MAX_DEPTH) return '<max-depth>';
    if (value === null) return null;
    if (Array.isArray(value)) {
      return { $type: 'array', length: value.length, samples: value.slice(0, 3).map((v, i) => ({ index: i, value: summarize(v, depth + 1, key) })) };
    }
    const type = typeof value;
    if (type === 'string') {
      if (!STRUCTURAL_KEYS.has(key)) return 'string';
      return value.slice(0, 120).replace(/\d{5,}/g, '<id>');
    }
    if (type !== 'object') return type;
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 100)) out[k] = summarize(v, depth + 1, k);
    return out;
  }

  const safeJsonParse = (text) => { try { return JSON.parse(text); } catch { return null; } };
  const parseMaybeJson = (value) => typeof value === 'string' ? (safeJsonParse(value) ?? value) : value;

  function requestDetails(rawUrl, method, body) {
    const parsed = parseGraphqlUrl(rawUrl);
    if (!parsed) return null;
    const query = { ...parsed.query };
    if ('variables' in query) query.variables = summarize(parseMaybeJson(query.variables));
    if ('features' in query) {
      const features = parseMaybeJson(query.features);
      query.features = features && typeof features === 'object' ? { $featureKeys: Object.keys(features).sort() } : summarize(features);
    }
    const parsedBody = typeof body === 'string' && body.length < 2000000 ? safeJsonParse(body) : null;
    return {
      operation: parsed.operation,
      queryId: parsed.queryId,
      endpoint: parsed.endpoint,
      method: (method || 'GET').toUpperCase(),
      request: { query, body: parsedBody ? summarize(parsedBody) : (body ? typeof body : null) },
    };
  }

  function emit(payload) {
    window.postMessage({ marker: MARKER, type: 'graphql-observation', payload }, '*');
  }

  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init.method || input?.method || 'GET';
    const body = init.body;
    const req = requestDetails(url, method, body);
    const response = await originalFetch.apply(this, arguments);
    if (req) {
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const json = await response.clone().json();
          emit({ kind: 'response-shape', source: 'fetch-hook', ...req, status: response.status, response: { contentType, shape: summarize(json) } });
        } else {
          emit({ kind: 'response-shape', source: 'fetch-hook', ...req, status: response.status, response: { contentType } });
        }
      } catch (error) {
        emit({ kind: 'response-shape', source: 'fetch-hook', ...req, status: response.status, response: { error: String(error) } });
      }
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__xFollowReviewProbe = { method, url };
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    const meta = this.__xFollowReviewProbe;
    const req = meta ? requestDetails(meta.url, meta.method, body) : null;
    if (req) {
      this.addEventListener('loadend', () => {
        try {
          let json = null;
          if (this.responseType === 'json') json = this.response;
          else if (!this.responseType || this.responseType === 'text') json = safeJsonParse(this.responseText);
          emit({
            kind: 'response-shape',
            source: 'xhr-hook',
            ...req,
            status: this.status,
            response: json ? { shape: summarize(json) } : { responseType: this.responseType || 'text' },
          });
        } catch (error) {
          emit({ kind: 'response-shape', source: 'xhr-hook', ...req, status: this.status, response: { error: String(error) } });
        }
      }, { once: true });
    }
    return originalSend.apply(this, arguments);
  };

  emit({ kind: 'hook-ready', source: 'page-hook' });
})();
