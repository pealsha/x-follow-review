(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const NORMALIZED = 'xfrMetaNormalized';
  const SCROLL_PRESERVE_MS = 45_000;
  let currentShadow = null;
  let observer = null;
  let frame = 0;
  let preservedScrollTop = null;
  let preserveScrollUntil = 0;

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
    const dataAttr = NORMALIZED.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    for (const meta of shadow.querySelectorAll(`.xfr-row-meta:not([data-${dataAttr}="true"])`)) {
      arrangeContainer(meta);
    }
    for (const summary of shadow.querySelectorAll(`.xfr-summary:not([data-${dataAttr}="true"])`)) {
      arrangeContainer(summary);
    }
  }

  function preserveCurrentListScroll() {
    const list = currentShadow?.querySelector('.xfr-user-list');
    if (!list) return;
    preservedScrollTop = list.scrollTop;
    preserveScrollUntil = Date.now() + SCROLL_PRESERVE_MS;
  }

  function restorePreservedListScroll() {
    if (preservedScrollTop === null || Date.now() > preserveScrollUntil) {
      preservedScrollTop = null;
      preserveScrollUntil = 0;
      return;
    }
    const list = currentShadow?.querySelector('.xfr-user-list');
    if (!list) return;
    const max = Math.max(0, list.scrollHeight - list.clientHeight);
    const target = Math.min(preservedScrollTop, max);
    if (Math.abs(list.scrollTop - target) > 1) list.scrollTop = target;
  }

  function schedule() {
    if (!currentShadow || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      normalizeNewContainers(currentShadow);
      restorePreservedListScroll();
    });
  }

  function attach() {
    const shadow = document.getElementById(HOST_ID)?.shadowRoot;
    if (!shadow || shadow === currentShadow) return;
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    currentShadow = shadow;

    shadow.addEventListener('click', (event) => {
      if (event.target?.closest?.('.xfr-danger')) preserveCurrentListScroll();
    }, true);

    shadow.addEventListener('scroll', (event) => {
      if (Date.now() > preserveScrollUntil) return;
      if (event.target?.classList?.contains('xfr-user-list')) {
        preservedScrollTop = event.target.scrollTop;
      }
    }, true);

    observer = new MutationObserver(schedule);
    observer.observe(shadow, { childList: true, subtree: true });
    schedule();
  }

  const pageObserver = new MutationObserver(attach);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  attach();
})();
