(() => {
	const css = `
    :host { all: initial; color-scheme: var(--xfr-scheme, dark); }
    * { box-sizing: border-box; }
    button, input { font: inherit; }

    .xfr-shell {
      position: fixed;
      top: 0;
      bottom: 0;
      width: 600px;
      z-index: 2147483000;
      pointer-events: none;
      color: var(--xfr-fg);
      font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    }

    .xfr-toggle {
      position: absolute;
      top: 10px;
      right: 12px;
      pointer-events: auto;
      border: 1px solid var(--xfr-border-strong);
      border-radius: 999px;
      background: var(--xfr-elevated);
      color: var(--xfr-fg);
      padding: 7px 13px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(12px);
    }

    .xfr-workspace {
      position: absolute;
      inset: 0;
      display: none;
      grid-template-rows: 56px minmax(0,1fr);
      pointer-events: auto;
      overflow: hidden;
      background: var(--xfr-bg);
      border-left: 1px solid var(--xfr-border);
    }

    .xfr-shell[data-open="true"] .xfr-workspace { display: grid; }
    .xfr-shell[data-open="true"] .xfr-toggle { display: none; }

    .xfr-topbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      border-bottom: 1px solid var(--xfr-border);
      background: var(--xfr-elevated);
      backdrop-filter: blur(14px);
    }

    .xfr-title { font-size: 19px; font-weight: 800; }

    button {
      appearance: none;
      border: 1px solid var(--xfr-border-strong);
      background: transparent;
      color: var(--xfr-fg);
      border-radius: 999px;
      padding: 7px 12px;
      cursor: pointer;
      font-weight: 700;
    }

    button:hover { background: var(--xfr-hover); }
    button:disabled { opacity: .5; cursor: default; }

    .xfr-main {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px,340px) minmax(0,1fr);
      overflow: hidden;
    }

    .xfr-list-pane {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0,1fr);
      overflow: hidden;
      border-right: 1px solid var(--xfr-border);
      background: var(--xfr-bg);
    }

    .xfr-search-wrap {
      padding: 12px;
      border-bottom: 1px solid var(--xfr-border);
    }

    .xfr-search {
      width: 100%;
      border: 1px solid var(--xfr-border-strong);
      border-radius: 999px;
      background: var(--xfr-subtle);
      color: var(--xfr-fg);
      padding: 9px 13px;
      outline: none;
    }

    .xfr-search:focus { border-color: #1d9bf0; }

    .xfr-user-list {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      scrollbar-color: var(--xfr-scroll) transparent;
      touch-action: pan-y;
    }

    .xfr-user-row {
      display: grid;
      grid-template-columns: 44px minmax(0,1fr);
      gap: 10px;
      width: 100%;
      padding: 11px 12px;
      border: 0;
      border-bottom: 1px solid var(--xfr-border);
      border-radius: 0;
      text-align: left;
      font-weight: 400;
      background: transparent;
    }

    .xfr-user-row:hover { background: var(--xfr-hover); }
    .xfr-user-row[data-selected="true"] { background: var(--xfr-selected); }
    .xfr-list-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: var(--xfr-subtle); }
    .xfr-user-main { min-width: 0; }
    .xfr-list-name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xfr-list-handle { color: var(--xfr-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xfr-row-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
    .xfr-mini-chip { color: var(--xfr-muted); font-size: 11px; padding: 2px 6px; border-radius: 999px; background: var(--xfr-subtle); }
    .xfr-empty { padding: 24px 16px; color: var(--xfr-muted); text-align: center; }

    .xfr-detail-pane {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto auto minmax(0,1fr);
      background: var(--xfr-bg);
    }

    .xfr-profile {
      display: grid;
      grid-template-columns: 64px minmax(0,1fr) auto;
      gap: 14px;
      align-items: start;
      padding: 18px 22px;
      border-bottom: 1px solid var(--xfr-border);
      background: var(--xfr-bg);
    }

    .xfr-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--xfr-subtle); }
    .xfr-name-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .xfr-name { font-size: 19px; font-weight: 800; color: var(--xfr-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
    .xfr-handle { color: var(--xfr-muted); white-space: nowrap; text-decoration: none; }
    .xfr-name:hover, .xfr-handle:hover { text-decoration: underline; }
    .xfr-bio { margin-top: 5px; white-space: pre-wrap; max-width: 820px; }
    .xfr-profile-actions { display: flex; gap: 8px; }
    .xfr-danger { border-color: #f4212e; color: #f4212e; }

    .xfr-summary {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      padding: 12px 18px;
      border-bottom: 1px solid var(--xfr-border);
      background: var(--xfr-bg);
    }

    .xfr-chip { font-size: 12px; padding: 4px 8px; border-radius: 999px; background: var(--xfr-subtle); color: var(--xfr-muted); }

    .xfr-detail-grid {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0,1.7fr) minmax(260px,.8fr);
      overflow: hidden;
      align-items: stretch;
    }

    .xfr-primary-detail,
    .xfr-side-detail {
      min-width: 0;
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      scrollbar-color: var(--xfr-scroll) transparent;
      touch-action: pan-y;
    }

    .xfr-primary-detail { border-right: 1px solid var(--xfr-border); }
    .xfr-section { padding: 16px 18px 20px; border-bottom: 1px solid var(--xfr-border); }
    .xfr-section-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
    .xfr-section-title { font-size: 16px; font-weight: 800; }
    .xfr-section-note { font-size: 12px; color: var(--xfr-muted); }

    .xfr-media-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 3px; border-radius: 14px; overflow: hidden; }
    .xfr-media-placeholder { aspect-ratio: 1; display: grid; place-items: center; background: var(--xfr-subtle); color: var(--xfr-muted); }
    .xfr-media-grid a { display: block; aspect-ratio: 1; overflow: hidden; }
    .xfr-media-grid img { width: 100%; height: 100%; object-fit: cover; }

    .xfr-bookmarks-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; padding-bottom: 18px; }
    .xfr-bookmark-tile { aspect-ratio: 4/3; border-radius: 10px; background: var(--xfr-subtle); color: var(--xfr-fg); text-decoration: none; overflow: hidden; border: 1px solid var(--xfr-border); }
    .xfr-bookmark-tile img { width: 100%; height: 100%; object-fit: cover; }

    .xfr-list-options { display: grid; gap: 6px; }
    .xfr-list-option { display: flex; align-items: center; gap: 9px; padding: 8px 9px; border-radius: 10px; cursor: pointer; }
    .xfr-list-option:hover { background: var(--xfr-hover); }
    .xfr-list-option input { width: 17px; height: 17px; accent-color: #1d9bf0; }

    @media (max-width: 1050px) {
      .xfr-main { grid-template-columns: 280px minmax(0,1fr); }
      .xfr-detail-pane { overflow-y: auto; display: block; overscroll-behavior: contain; }
      .xfr-detail-grid { grid-template-columns: 1fr; overflow: visible; height: auto; }
      .xfr-primary-detail, .xfr-side-detail { overflow: visible; max-height: none; }
      .xfr-primary-detail { border-right: 0; }
      .xfr-media-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
    }
  `;
	window.__xfrIsolatedShared.reviewCss = css;
})();
