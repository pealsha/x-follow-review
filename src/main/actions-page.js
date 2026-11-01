(() => {
  const MARKER = 'X_FOLLOW_REVIEW_ACTION_V1';
  const shared = window.__xfrGraphqlShared;

  function emit(type, payload = {}) {
    window.postMessage({ marker: MARKER, type, ...payload }, '*');
  }

  async function waitForHeaders(timeoutMs = 5000) {
    const started = Date.now();
    while (!shared?.headers && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!shared?.headers) throw new Error('Xの認証済みリクエスト情報を取得できませんでした。');
    return new Headers(shared.headers);
  }

  async function unfollow(userId) {
    if (!/^\d+$/.test(String(userId || ''))) throw new Error('userIdが不正です。');
    const headers = await waitForHeaders();
    headers.set('content-type', 'application/x-www-form-urlencoded');
    const response = await fetch(`${location.origin}/i/api/1.1/friendships/destroy.json`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: new URLSearchParams({ user_id: String(userId) }).toString(),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`フォロー解除に失敗しました: HTTP ${response.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
    return { ok: true };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.marker !== MARKER || message.type !== 'request') return;
    Promise.resolve()
      .then(() => {
        if (message.action === 'unfollow') return unfollow(message.payload?.userId);
        throw new Error(`Unknown action: ${message.action}`);
      })
      .then((result) => emit('response', { id: message.id, ok: true, result }))
      .catch((error) => emit('response', { id: message.id, ok: false, error: String(error?.message || error) }));
  });
})();
