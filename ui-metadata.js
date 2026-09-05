(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  let currentShadow = null;
  let observer = null;

  function arrangeContainer(container) {
    if (!container) return;
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
  }

  function normalize(shadow) {
    for (const meta of shadow.querySelectorAll('.xfr-row-meta')) arrangeContainer(meta);
    for (const summary of shadow.querySelectorAll('.xfr-summary')) arrangeContainer(summary);
  }

  function attach() {
    const shadow = document.getElementById(HOST_ID)?.shadowRoot;
    if (!shadow || shadow === currentShadow) return;
    observer?.disconnect();
    currentShadow = shadow;
    normalize(shadow);
    observer = new MutationObserver(() => normalize(shadow));
    observer.observe(shadow, { childList: true, subtree: true });
  }

  const pageObserver = new MutationObserver(attach);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  attach();
})();
