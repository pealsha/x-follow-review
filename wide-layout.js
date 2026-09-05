(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  let attachedShadow = null;
  let shadowObserver = null;
  let resizeTimer = null;

  const css = `
    .xfr-shell {
      left: var(--xfr-workspace-left, 0px) !important;
      width: var(--xfr-primary-width, 600px) !important;
      max-width: none !important;
    }

    .xfr-shell[data-open="true"] {
      width: calc(100vw - var(--xfr-workspace-left, 0px)) !important;
    }

    .xfr-shell[data-open="true"] .xfr-body {
      display: grid !important;
      grid-template-columns: minmax(300px, 34%) minmax(0, 1fr);
      min-height: 0;
      overflow: hidden !important;
      background: var(--xfr-bg, #fff);
    }

    .xfr-wide-left,
    .xfr-wide-right {
      min-width: 0;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: var(--xfr-scroll-thumb, #cfd9de) transparent;
    }

    .xfr-wide-left {
      border-right: 1px solid var(--xfr-border, #eff3f4);
      background: var(--xfr-bg, #fff);
    }

    .xfr-wide-right {
      background: var(--xfr-bg, #fff);
    }

    .xfr-wide-left > .xfr-profile,
    .xfr-wide-left > .xfr-summary,
    .xfr-wide-left > .xfr-utils {
      width: 100%;
    }

    .xfr-wide-left .xfr-profile {
      grid-template-columns: 56px minmax(0, 1fr) auto;
      padding: 18px 18px 14px;
    }

    .xfr-wide-left .xfr-avatar {
      width: 56px;
      height: 56px;
    }

    .xfr-wide-left .xfr-summary {
      padding: 12px 18px;
    }

    .xfr-wide-left .xfr-utils {
      padding: 16px 18px 22px;
    }

    .xfr-wide-right > .xfr-section {
      padding: 18px 20px 22px;
      border-bottom: 1px solid var(--xfr-border, #eff3f4);
    }

    .xfr-wide-right .xfr-section-title {
      font-size: 17px;
    }

    .xfr-wide-right .xfr-media-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      border-radius: 16px;
    }

    .xfr-wide-right .xfr-bookmarks-placeholder {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 9px;
    }

    .xfr-shell[data-open="true"] .xfr-header {
      padding-inline: 18px;
    }

    .xfr-shell[data-open="true"] .xfr-title::after {
      content: '  ·  Review workspace';
      color: var(--xfr-muted, #536471);
      font-size: 12px;
      font-weight: 500;
    }

    .xfr-shell[data-open="true"] .xfr-footer {
      padding-inline: 18px;
      grid-template-columns: 48px minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) 48px;
    }

    @media (max-width: 1120px) {
      .xfr-shell[data-open="true"] .xfr-body {
        grid-template-columns: minmax(270px, 38%) minmax(0, 1fr);
      }
      .xfr-wide-right .xfr-media-grid,
      .xfr-wide-right .xfr-bookmarks-placeholder {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 860px) {
      .xfr-shell[data-open="true"] .xfr-body {
        display: block !important;
        overflow-y: auto !important;
      }
      .xfr-wide-left,
      .xfr-wide-right {
        overflow: visible;
      }
      .xfr-wide-left {
        border-right: 0;
      }
      .xfr-wide-right .xfr-media-grid,
      .xfr-wide-right .xfr-bookmarks-placeholder {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .xfr-shell[data-open="true"] .xfr-title::after {
        content: '';
      }
    }
  `;

  function usableRect(node) {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 480 || rect.width > 780) return null;
    if (rect.left < 0 || rect.left >= window.innerWidth) return null;
    return rect;
  }

  function findPrimaryRect() {
    const direct = document.querySelector('[data-testid="primaryColumn"]');
    const directRect = usableRect(direct);
    if (directRect) return directRect;

    const seed = document.querySelector('[data-testid="UserCell"]') || document.querySelector('[role="tablist"]');
    if (seed) {
      let node = seed;
      let best = null;
      for (let depth = 0; node && node !== document.documentElement && depth < 15; depth += 1, node = node.parentElement) {
        const rect = usableRect(node);
        if (!rect) continue;
        if (rect.height < Math.min(450, window.innerHeight * 0.5)) continue;
        best = rect;
      }
      if (best) return best;
    }

    const main = document.querySelector('main[role="main"]');
    if (main) {
      const candidates = [main, ...main.querySelectorAll(':scope > div, :scope > div > div')];
      for (const candidate of candidates) {
        const rect = usableRect(candidate);
        if (rect) return rect;
      }
    }

    return null;
  }

  function updateGeometry(host) {
    const rect = findPrimaryRect();
    if (!rect) return;
    host.style.setProperty('--xfr-workspace-left', `${Math.max(0, Math.round(rect.left))}px`);
    host.style.setProperty('--xfr-primary-width', `${Math.round(rect.width)}px`);
  }

  function classifySections(body) {
    const sections = Array.from(body.querySelectorAll(':scope > .xfr-section'));
    let media = null;
    let bookmarks = null;

    for (const section of sections) {
      const title = section.querySelector('.xfr-section-title')?.textContent || '';
      if (!media && title.includes('最近の画像')) media = section;
      else if (!bookmarks && title.includes('ブックマーク')) bookmarks = section;
    }

    return { media, bookmarks };
  }

  function arrangeWorkspace(shadow) {
    const body = shadow.querySelector('.xfr-body');
    if (!body || body.querySelector(':scope > .xfr-wide-left')) return;

    const profile = body.querySelector(':scope > .xfr-profile');
    const summary = body.querySelector(':scope > .xfr-summary');
    const utils = body.querySelector(':scope > .xfr-utils');
    const { media, bookmarks } = classifySections(body);

    if (!profile || (!media && !bookmarks)) return;

    const left = document.createElement('div');
    left.className = 'xfr-wide-left';
    const right = document.createElement('div');
    right.className = 'xfr-wide-right';

    if (profile) left.append(profile);
    if (summary) left.append(summary);
    if (utils) left.append(utils);
    if (media) right.append(media);
    if (bookmarks) right.append(bookmarks);

    body.prepend(left, right);
  }

  function enhance(shadow, host) {
    updateGeometry(host);
    arrangeWorkspace(shadow);
  }

  function attach(host) {
    const shadow = host.shadowRoot;
    if (!shadow || shadow === attachedShadow) return;

    attachedShadow = shadow;
    shadowObserver?.disconnect();

    const style = document.createElement('style');
    style.dataset.xfrWideLayout = 'true';
    style.textContent = css;
    shadow.append(style);

    shadowObserver = new MutationObserver(() => enhance(shadow, host));
    shadowObserver.observe(shadow, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-open'] });

    enhance(shadow, host);
  }

  function scanForHost() {
    const host = document.getElementById(HOST_ID);
    if (host) attach(host);
  }

  const pageObserver = new MutationObserver(scanForHost);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const host = document.getElementById(HOST_ID);
      if (host) updateGeometry(host);
    }, 80);
  }, { passive: true });

  scanForHost();
})();
