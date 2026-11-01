const STORAGE_KEY = 'xFollowReviewProbe.events';
const MAX_EVENTS = 400;
let writeQueue = Promise.resolve();

function parseGraphqlUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/\/(?:i\/api\/)?graphql\/([^/]+)\/([^/?#]+)/);
    if (!match) return null;
    return {
      queryId: decodeURIComponent(match[1]),
      operation: decodeURIComponent(match[2]),
      url: `${url.origin}${url.pathname}`,
    };
  } catch {
    return null;
  }
}

function appendEvent(event) {
  writeQueue = writeQueue.then(async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const events = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    events.push(event);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    await chrome.storage.local.set({ [STORAGE_KEY]: events });
  }).catch((error) => console.warn('X Follow Review Probe storage error', error));
  return writeQueue;
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'X_FOLLOW_REVIEW_PROBE_EVENT') return;
  const tabUrl = sender?.tab?.url || '';
  if (!tabUrl.startsWith('https://x.com/') && !tabUrl.startsWith('https://twitter.com/')) return;

  const event = {
    ...message.payload,
    capturedAt: Date.now(),
    tabUrl,
    source: message.payload?.source || 'page-hook',
  };
  void appendEvent(event);
});

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const gql = parseGraphqlUrl(details.url);
    if (!gql) return;

    const headerNames = (details.requestHeaders || [])
      .map((h) => (h.name || '').toLowerCase())
      .filter(Boolean);

    void appendEvent({
      kind: 'request-meta',
      source: 'webRequest',
      capturedAt: Date.now(),
      requestId: details.requestId,
      method: details.method,
      ...gql,
      headerPresence: {
        authorization: headerNames.includes('authorization'),
        csrf: headerNames.includes('x-csrf-token'),
        transactionId: headerNames.includes('x-client-transaction-id'),
        clientUuid: headerNames.includes('x-client-uuid'),
        cookie: headerNames.includes('cookie'),
      },
    });
  },
  { urls: ['https://x.com/i/api/graphql/*', 'https://twitter.com/i/api/graphql/*', 'https://api.x.com/graphql/*'] },
  ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const gql = parseGraphqlUrl(details.url);
    if (!gql) return;
    void appendEvent({
      kind: 'response-meta',
      source: 'webRequest',
      capturedAt: Date.now(),
      requestId: details.requestId,
      method: details.method,
      status: details.statusCode,
      ...gql,
    });
  },
  { urls: ['https://x.com/i/api/graphql/*', 'https://twitter.com/i/api/graphql/*', 'https://api.x.com/graphql/*'] }
);
