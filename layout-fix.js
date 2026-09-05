(() => {
  const HOST_ID = 'x-follow-review-ui-host';
  let raf = 0;
  let observedRoot = null;
  let rootObserver = null;

  function primaryRect() {
    const direct = document.querySelector('[data-testid="primaryColumn"]');
    if (direct) {
      const rect = direct.getBoundingClientRect();
      if (rect.width >= 480 && rect.width <= 760 && rect.height > 300) return rect;
    }

    const cell = document.querySelector('[data-testid="UserCell"]');
    let node = cell;
    while (node && node !== document.documentElement) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 480 && rect.width <= 760 && rect.height > 400) return rect;
      node = node.parentElement;
    }
    return null;
  }

  function navigationRight() {
    const home = document.querySelector('[data-testid="AppTabBar_Home_Link"]');
    if (!home) return 0;

    let right = home.getBoundingClientRect().right;
    let node = home;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if ((style.position === 'fixed' || style.position === 'sticky') && rect.width > 80 && rect.width < 460) {
        right = Math.max(right, rect.right);
      }
    }
    return right;
  }

  function workspaceLeft() {
    const navRight = navigationRight();
    const primary = primaryRect();

    if (primary && primary.left > Math.max(120, navRight - 12) && primary.left < window.innerWidth * 0.45) {
      return Math.round(primary.left);
    }

    const fallback = Math.max(navRight + 18, window.innerWidth * 0.235);
    return Math.round(Math.min(fallback, window.innerWidth * 0.34));
  }

  function connectRootObserver(root) {
    if (!root || root === observedRoot) return;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(schedule);
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-open'],
      childList: true,
      subtree: false,
    });
  }

  function apply() {
    raf = 0;
    const host = document.getElementById(HOST_ID);
    const root = host?.shadowRoot?.querySelector('.xfr-shell');
    if (!root) return;
    connectRootObserver(root);

    const left = workspaceLeft();
    const primary = primaryRect();
    const open = root.dataset.open === 'true';
    const closedWidth = Math.max(500, Math.round(primary?.width || 600));

    root.style.left = `${left}px`;
    root.style.right = 'auto';
    root.style.width = open
      ? `${Math.max(560, window.innerWidth - left)}px`
      : `${Math.min(closedWidth, window.innerWidth - left)}px`;
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  const pageObserver = new MutationObserver(schedule);
  pageObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
})();
