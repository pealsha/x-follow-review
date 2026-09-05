const MARKER = 'X_FOLLOW_REVIEW_PROBE_V1';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.marker !== MARKER || data.type !== 'graphql-observation') return;

  chrome.runtime.sendMessage({
    type: 'X_FOLLOW_REVIEW_PROBE_EVENT',
    payload: data.payload,
  }).catch(() => {});
});
