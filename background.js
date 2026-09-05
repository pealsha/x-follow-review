const STORAGE_KEY = 'xFollowReviewProbe.events';
const MAX_EVENTS = 400;
const BOOKMARKS_KEY = 'xFollowReview.bookmarksByAuthor.v1';
const LISTS_KEY = 'xFollowReview.lists.v1';
const LIST_MEMBERSHIP_KEY = 'xFollowReview.listMemberships.v1';
const MEDIA_KEY = 'xFollowReview.mediaByAuthor.v1';
const SYNC_STATUS_KEY = 'xFollowReview.syncStatus.v1';

let writeQueue = Promise.resolve();
const workerJobs = new Map();
let listMemberQueue = [];
let listMemberActive = false;
let mediaQueue = [];
let mediaActive = 0;
const queuedMedia = new Set();

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

async function setSyncStatus(message, extra = {}) {
  await chrome.storage.local.set({
    [SYNC_STATUS_KEY]: {
      message,
      updatedAt: Date.now(),
      ...extra,
    },
  });
}

function normalizeOrigin(raw) {
  try {
    const url = new URL(raw || 'https://x.com');
    if (url.hostname === 'x.com' || url.hostname === 'twitter.com') return url.origin;
  } catch {}
  return 'https://x.com';
}

function hasWorkerKind(kind) {
  return Array.from(workerJobs.values()).some((job) => job.kind === kind);
}

async function openWorker(url, kind, meta = {}) {
  const tab = await chrome.tabs.create({ url, active: false });
  workerJobs.set(tab.id, { kind, meta, started: false, createdAt: Date.now() });
  return tab.id;
}

async function startWorker(tabId) {
  const job = workerJobs.get(tabId);
  if (!job || job.started) return;
  job.started = true;
  workerJobs.set(tabId, job);

  const send = async () => {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'XFR_SYNC_WORKER_START',
        kind: job.kind,
        meta: job.meta,
      });
    } catch {
      job.started = false;
      workerJobs.set(tabId, job);
      setTimeout(() => void startWorker(tabId), 600);
    }
  };
  await send();
}

async function closeWorker(tabId) {
  const job = workerJobs.get(tabId);
  workerJobs.delete(tabId);
  try { await chrome.tabs.remove(tabId); } catch {}
  return job;
}

async function startBaseSync(origin) {
  const base = normalizeOrigin(origin);
  if (!hasWorkerKind('bookmarks')) {
    await setSyncStatus('ブックマークを自動同期中…', { stage: 'bookmarks' });
    await openWorker(`${base}/i/bookmarks`, 'bookmarks', { origin: base });
  }
  if (!hasWorkerKind('lists')) {
    await openWorker(`${base}/i/lists`, 'lists', { origin: base });
  }
}

function enqueueListMembers(lists, origin) {
  listMemberQueue = (lists || []).slice(0, 80).map((list) => ({ list, origin }));
  void pumpListMembers();
}

async function pumpListMembers() {
  if (listMemberActive || !listMemberQueue.length) return;
  listMemberActive = true;
  const next = listMemberQueue.shift();
  const base = normalizeOrigin(next.origin);
  await setSyncStatus(`リスト「${next.list.name}」のメンバーを同期中…`, { stage: 'list-members' });
  await openWorker(`${base}/i/lists/${next.list.id}/members`, 'list-members', {
    origin: base,
    id: next.list.id,
    name: next.list.name,
  });
}

function enqueueMedia(usernames, origin) {
  const base = normalizeOrigin(origin);
  for (const usernameRaw of usernames || []) {
    const username = String(usernameRaw || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) continue;
    const key = username.toLowerCase();
    if (queuedMedia.has(key)) continue;
    queuedMedia.add(key);
    mediaQueue.push({ username, origin: base, key });
  }
  void pumpMedia();
}

async function pumpMedia() {
  while (mediaActive < 2 && mediaQueue.length) {
    const next = mediaQueue.shift();
    mediaActive += 1;
    try {
      await openWorker(`${next.origin}/${next.username}/media`, 'media', next);
    } catch {
      mediaActive -= 1;
      queuedMedia.delete(next.key);
    }
  }
}

async function storeBookmarks(posts) {
  const byAuthor = {};
  for (const post of posts || []) {
    const key = String(post.authorKey || '').toLowerCase();
    if (!key) continue;
    (byAuthor[key] ||= []).push(post);
  }
  await chrome.storage.local.set({ [BOOKMARKS_KEY]: byAuthor });
  await setSyncStatus(`ブックマーク同期完了: ${posts?.length || 0}件`, { stage: 'bookmarks-done' });
}

async function storeLists(lists, origin) {
  await chrome.storage.local.set({
    [LISTS_KEY]: lists || [],
    [LIST_MEMBERSHIP_KEY]: {},
  });
  if (lists?.length) enqueueListMembers(lists, origin);
  else await setSyncStatus('リスト同期完了: 0件', { stage: 'lists-done' });
}

async function storeListMembers(data) {
  const list = data?.list || {};
  const stored = await chrome.storage.local.get(LIST_MEMBERSHIP_KEY);
  const memberships = stored[LIST_MEMBERSHIP_KEY] && typeof stored[LIST_MEMBERSHIP_KEY] === 'object'
    ? stored[LIST_MEMBERSHIP_KEY]
    : {};

  for (const member of data?.members || []) {
    const key = String(member.key || member.handle || '').toLowerCase();
    if (!key) continue;
    const current = Array.isArray(memberships[key]) ? memberships[key] : [];
    if (!current.some((entry) => String(entry.id) === String(list.id))) {
      current.push({ id: list.id, name: list.name });
    }
    memberships[key] = current;
  }
  await chrome.storage.local.set({ [LIST_MEMBERSHIP_KEY]: memberships });
}

async function storeMedia(data) {
  const username = String(data?.username || '').replace(/^@/, '').toLowerCase();
  if (!username) return;
  const key = `@${username}`;
  const stored = await chrome.storage.local.get(MEDIA_KEY);
  const cache = stored[MEDIA_KEY] && typeof stored[MEDIA_KEY] === 'object' ? stored[MEDIA_KEY] : {};
  cache[key] = { items: data.items || [], updatedAt: Date.now() };
  await chrome.storage.local.set({ [MEDIA_KEY]: cache });
}

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && workerJobs.has(tabId)) void startWorker(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const job = workerJobs.get(tabId);
  if (!job) return;
  workerJobs.delete(tabId);
  if (job.kind === 'list-members') {
    listMemberActive = false;
    void pumpListMembers();
  }
  if (job.kind === 'media') {
    mediaActive = Math.max(0, mediaActive - 1);
    queuedMedia.delete(job.meta?.key);
    void pumpMedia();
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message) return;

  if (message.type === 'X_FOLLOW_REVIEW_PROBE_EVENT') {
    const tabUrl = sender?.tab?.url || '';
    if (!tabUrl.startsWith('https://x.com/') && !tabUrl.startsWith('https://twitter.com/')) return;
    const event = {
      ...message.payload,
      capturedAt: Date.now(),
      tabUrl,
      source: message.payload?.source || 'page-hook',
    };
    void appendEvent(event);
    return;
  }

  if (message.type === 'XFR_AUTO_SYNC_START') {
    void startBaseSync(message.origin);
    return;
  }

  if (message.type === 'XFR_MEDIA_PREFETCH') {
    enqueueMedia(message.usernames, message.origin);
    return;
  }

  if (message.type === 'XFR_SYNC_WORKER_PROGRESS') {
    const label = message.kind === 'bookmarks' ? 'ブックマーク' :
      message.kind === 'lists' ? 'リスト' :
      message.kind === 'list-members' ? 'リストメンバー' : 'メディア';
    void setSyncStatus(`${label}を自動同期中: ${message.count || 0}件`, { stage: message.kind });
    return;
  }

  if (message.type === 'XFR_SYNC_WORKER_ERROR') {
    const tabId = sender?.tab?.id;
    void setSyncStatus(`自動同期エラー (${message.kind}): ${message.error || 'unknown'}`, { stage: 'error' });
    if (tabId != null) void closeWorker(tabId).then((job) => {
      if (job?.kind === 'list-members') {
        listMemberActive = false;
        void pumpListMembers();
      }
      if (job?.kind === 'media') {
        mediaActive = Math.max(0, mediaActive - 1);
        queuedMedia.delete(job.meta?.key);
        void pumpMedia();
      }
    });
    return;
  }

  if (message.type === 'XFR_SYNC_WORKER_RESULT') {
    const tabId = sender?.tab?.id;
    const job = tabId != null ? workerJobs.get(tabId) : null;
    const kind = message.kind || job?.kind;
    const meta = message.meta || job?.meta || {};

    void (async () => {
      if (kind === 'bookmarks') await storeBookmarks(message.data?.posts || []);
      else if (kind === 'lists') await storeLists(message.data?.lists || [], meta.origin);
      else if (kind === 'list-members') await storeListMembers(message.data);
      else if (kind === 'media') await storeMedia(message.data);

      if (tabId != null) await closeWorker(tabId);

      if (kind === 'list-members') {
        listMemberActive = false;
        if (listMemberQueue.length) void pumpListMembers();
        else await setSyncStatus('リスト同期完了', { stage: 'lists-done' });
      }
      if (kind === 'media') {
        mediaActive = Math.max(0, mediaActive - 1);
        queuedMedia.delete(meta.key);
        void pumpMedia();
      }
    })();
  }
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
