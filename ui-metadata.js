(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const NORMALIZED = 'xfrMetaNormalized';
  let currentShadow = null;
  let observer = null;
  let frame = 0;

  function arrangeContainer(container) {
    if (!container || container.dataset[NORMALIZED] === 'true') return;
    const chips = Array.from(container.children);
    const bookmark = chips.find((node) => /^★|ブックマーク/.test((node.textContent || '').trim()));
    const list = chips.find((node) => /^リスト/.test((node.textContent || '').trim()));
    if (!bookmark || !list) return;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'max-content max-content';
    container.style.justifyContent = 'start';
    container.style.columnGap = '6px';
    container.style.direction = 'ltr';

    bookmark.style.gridColumn = '1';
    bookmark.style.gridRow = '1';
    list.style.gridColumn = '2';
    list.style.gridRow = '1';
    container.dataset[NORMALIZED] = 'true';
  }

  function normalizeNewContainers(shadow) {
    for (const meta of shadow.querySelectorAll(`.xfr-row-meta:not([data-${NORMALIZED.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="true"])`)) {
      arrangeContainer(meta);
    }
    for (const summary of shadow.querySelectorAll(`.xfr-summary:not([data-${NORMALIZED.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="true"])`)) {
      arrangeContainer(summary);
    }
  }

  function schedule() {
    if (!currentShadow || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      normalizeNewContainers(currentShadow);
    });
  }

  function attach() {
    const shadow = document.getElementById(HOST_ID)?.shadowRoot;
    if (!shadow || shadow === currentShadow) return;
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    currentShadow = shadow;
    observer = new MutationObserver(schedule);
    observer.observe(shadow, { childList: true, subtree: true });
    schedule();
  }

  const pageObserver = new MutationObserver(attach);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  attach();
})();
