(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  const STYLE_ID = 'xfr-ui-polish-style';
  let currentShadow = null;
  let observer = null;

  const css = `
    /* The workspace itself never scrolls the X page. Each review pane owns its
       own scroll area instead. */
    .xfr-workspace,
    .xfr-main,
    .xfr-list-pane,
    .xfr-detail-pane,
    .xfr-detail-grid,
    .xfr-primary-detail,
    .xfr-side-detail {
      min-height: 0;
    }

    .xfr-main {
      overflow: hidden;
    }

    /* Left side: search stays visible, the Following list alone scrolls. */
    .xfr-list-pane {
      overflow: hidden;
    }

    .xfr-user-list {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      touch-action: pan-y;
    }

    /* Right side: keep the profile and summary visible while the useful
       content below them scrolls. */
    .xfr-detail-pane {
      overflow: hidden;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
    }

    .xfr-profile {
      position: relative;
      z-index: 2;
      background: var(--xfr-bg);
    }

    .xfr-summary {
      position: relative;
      z-index: 2;
      background: var(--xfr-bg);
    }

    .xfr-detail-grid {
      min-height: 0;
      height: 100%;
      overflow: hidden;
      align-items: stretch;
    }

    .xfr-primary-detail,
    .xfr-side-detail {
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      touch-action: pan-y;
    }

    /* Bookmarks must be reachable even when the media grid is tall. */
    .xfr-bookmarks-placeholder {
      padding-bottom: 18px;
    }

    /* Sync internals are development information, not part of the review UX. */
    .xfr-status {
      display: none !important;
    }

    .xfr-topbar > button:last-child {
      margin-left: auto;
    }

    @media (max-width: 1050px) {
      .xfr-detail-pane {
        overflow-y: auto;
        display: block;
        overscroll-behavior: contain;
      }

      .xfr-primary-detail,
      .xfr-side-detail {
        overflow: visible;
        max-height: none;
      }

      .xfr-detail-grid {
        overflow: visible;
        height: auto;
      }
    }
  `;

  function removeSyncSection(shadow) {
    for (const section of shadow.querySelectorAll('.xfr-section')) {
      const title = section.querySelector('.xfr-section-title')?.textContent?.trim();
      if (title === '同期状態') section.remove();
    }
  }

  function install(shadow) {
    if (!shadow || shadow === currentShadow) {
      if (shadow) removeSyncSection(shadow);
      return;
    }

    observer?.disconnect();
    currentShadow = shadow;

    if (!shadow.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      shadow.append(style);
    }

    removeSyncSection(shadow);
    observer = new MutationObserver(() => removeSyncSection(shadow));
    observer.observe(shadow, { childList: true, subtree: true });
  }

  function findAndInstall() {
    const host = document.getElementById(HOST_ID);
    if (host?.shadowRoot) install(host.shadowRoot);
  }

  const pageObserver = new MutationObserver(findAndInstall);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', findAndInstall, { passive: true });
  findAndInstall();
})();
