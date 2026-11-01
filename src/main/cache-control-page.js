(() => {
  const MARKER = 'X_FOLLOW_REVIEW_CONTROL_V1';
  const QUERY_CACHE_KEY = 'xFollowReview.queryIds.v1';

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'request') return;
    if (message.action !== 'clear-query-cache') return;

    try { localStorage.removeItem(QUERY_CACHE_KEY); } catch {}
    try {
      const shared = window.__xfrGraphqlShared;
      shared?.queryIds?.clear?.();
      shared?.queryTimes?.clear?.();
      shared?.lookupCache?.clear?.();
    } catch {}

    window.postMessage({ marker: MARKER, type: 'response', id: message.id, ok: true }, '*');
  });
})();
