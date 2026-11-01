const MARKER = 'X_FOLLOW_REVIEW_PROBE_V1';
let contextInvalidated = false;

function handleObservation(event) {
  if (contextInvalidated || event.source !== window) return;

  const data = event.data;
  if (!data || data.marker !== MARKER || data.type !== 'graphql-observation') return;

  try {
    // Reloading an unpacked extension invalidates content scripts that are already
    // running in open tabs. In that state even accessing the runtime for a message
    // can throw synchronously, so do not rely on Promise.catch() alone.
    if (!chrome.runtime?.id) {
      contextInvalidated = true;
      window.removeEventListener('message', handleObservation);
      return;
    }

    const pending = chrome.runtime.sendMessage({
      type: 'X_FOLLOW_REVIEW_PROBE_EVENT',
      payload: data.payload,
    });

    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => {
        // The diagnostic bridge is best-effort. A tab reload will install the new
        // extension context, so failed observations from an old context are ignored.
      });
    }
  } catch {
    contextInvalidated = true;
    window.removeEventListener('message', handleObservation);
  }
}

window.addEventListener('message', handleObservation);
