(() => {
	const HOST_ID = window.__xfrIsolatedShared.HOST_ID;
	const ROUTE_RE = /^\/[A-Za-z0-9_]+\/following\/?$/;
	const GQL_MARKER = window.__xfrIsolatedShared.MARKERS.gql;
	const ACTION_MARKER = window.__xfrIsolatedShared.MARKERS.action;

	const KEYS = {
		following: window.__xfrIsolatedShared.KEYS.following,
		bookmarks: window.__xfrIsolatedShared.KEYS.bookmarks,
		lists: window.__xfrIsolatedShared.KEYS.lists,
		memberships: window.__xfrIsolatedShared.KEYS.memberships,
		media: window.__xfrIsolatedShared.KEYS.media,
	};

	let host = null;
	let shadow = null;
	let root = null;
	let lastPath = location.pathname;
	let layoutTimer = null;
	let seq = 0;
	const pending = new Map();

	const state = {
		open: false,
		users: [],
		selectedKey: "",
		search: "",
		bookmarks: {},
		lists: [],
		memberships: {},
		media: {},
		busy: false,
		listScrollTop: 0,
	};

	const css = window.__xfrIsolatedShared.reviewCss;

	function isRoute() {
		return ROUTE_RE.test(location.pathname);
	}

	function primaryRect() {
		const direct = document.querySelector('[data-testid="primaryColumn"]');
		if (direct) {
			const rect = direct.getBoundingClientRect();
			if (rect.width >= 480 && rect.width <= 760 && rect.height > 300)
				return rect;
		}

		const cell = document.querySelector('[data-testid="UserCell"]');
		let node = cell;
		while (node && node !== document.documentElement) {
			const rect = node.getBoundingClientRect();
			if (rect.width >= 480 && rect.width <= 760 && rect.height > 400)
				return rect;
			node = node.parentElement;
		}
		return null;
	}

	function navigationRight() {
		const home = document.querySelector('[data-testid="AppTabBar_Home_Link"]');
		if (!home) return 0;
		let right = home.getBoundingClientRect().right;
		let node = home;
		for (
			let depth = 0;
			node && depth < 10;
			depth += 1, node = node.parentElement
		) {
			const rect = node.getBoundingClientRect();
			const style = getComputedStyle(node);
			if (
				(style.position === "fixed" || style.position === "sticky") &&
				rect.width > 80 &&
				rect.width < 460
			) {
				right = Math.max(right, rect.right);
			}
		}
		return right;
	}

	function workspaceLeft() {
		const navRight = navigationRight();
		const primary = primaryRect();
		if (
			primary &&
			primary.left > Math.max(120, navRight - 12) &&
			primary.left < window.innerWidth * 0.45
		) {
			return Math.round(primary.left);
		}
		const fallback = Math.max(navRight + 18, window.innerWidth * 0.235);
		return Math.round(Math.min(fallback, window.innerWidth * 0.34));
	}

	function applyGeometry() {
		if (!root) return;
		const left = workspaceLeft();
		const primary = primaryRect();
		const closedWidth = Math.max(500, Math.round(primary?.width || 600));
		root.style.left = `${left}px`;
		root.style.right = "auto";
		root.style.width = state.open
			? `${Math.max(560, window.innerWidth - left)}px`
			: `${Math.min(closedWidth, window.innerWidth - left)}px`;
	}

	function applyTheme() {
		// On a full reload this runs at document_start, before <body> exists; scheduleLayout retries later.
		if (!host || !document.body) return;
		const bg = getComputedStyle(document.body).backgroundColor || "rgb(0,0,0)";
		const match = bg.match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
		const lum = match
			? (Number(match[1]) * 299 +
					Number(match[2]) * 587 +
					Number(match[3]) * 114) /
				1000
			: 0;
		const dark = lum < 128;
		const dim = dark && lum > 12;
		const vars = dark
			? {
					"--xfr-scheme": "dark",
					"--xfr-bg": dim ? "#15202b" : "#000",
					"--xfr-elevated": dim ? "rgba(21,32,43,.96)" : "rgba(0,0,0,.96)",
					"--xfr-fg": "#e7e9ea",
					"--xfr-muted": dim ? "#8899a6" : "#71767b",
					"--xfr-border": dim ? "#38444d" : "#2f3336",
					"--xfr-border-strong": "#536471",
					"--xfr-subtle": dim ? "rgba(255,255,255,.06)" : "#16181c",
					"--xfr-hover": "rgba(239,243,244,.10)",
					"--xfr-selected": "rgba(29,155,240,.14)",
					"--xfr-scroll": "#536471",
				}
			: {
					"--xfr-scheme": "light",
					"--xfr-bg": "#fff",
					"--xfr-elevated": "rgba(255,255,255,.96)",
					"--xfr-fg": "#0f1419",
					"--xfr-muted": "#536471",
					"--xfr-border": "#eff3f4",
					"--xfr-border-strong": "#cfd9de",
					"--xfr-subtle": "#f7f9f9",
					"--xfr-hover": "#f7f9f9",
					"--xfr-selected": "rgba(29,155,240,.10)",
					"--xfr-scroll": "#cfd9de",
				};
		Object.entries(vars).forEach(([key, value]) => {
			host.style.setProperty(key, value);
		});
	}

	function scheduleLayout() {
		clearTimeout(layoutTimer);
		layoutTimer = setTimeout(() => {
			applyTheme();
			applyGeometry();
		}, 60);
	}

	function el(tag, className = "", text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function button(text, onClick, className = "") {
		const node = el("button", className, text);
		node.type = "button";
		node.addEventListener("click", onClick);
		return node;
	}

	function profileLink(user, className, text) {
		const link = el("a", className, text);
		link.href = user.profileUrl || `${location.origin}/${user.username}`;
		link.target = "_blank";
		link.rel = "noopener";
		return link;
	}

	function seedFromDom() {
		const map = new Map(state.users.map((user) => [user.key, user]));
		document.querySelectorAll('[data-testid="UserCell"]').forEach((cell) => {
			const handle = Array.from(cell.querySelectorAll("span"))
				.map((span) => (span.textContent || "").trim())
				.find((value) => /^@[A-Za-z0-9_]{1,15}$/.test(value));
			if (!handle) return;
			const username = handle.slice(1);
			// biome-ignore lint/performance/useDomNodeTextContent: Rendered line breaks separate the name and bio; textContent would change extraction.
			const lines = (cell.innerText || "")
				.split("\n")
				.map((value) => value.trim())
				.filter(Boolean);
			const hi = lines.indexOf(handle);
			const key = handle.toLowerCase();
			if (map.has(key)) return;
			map.set(key, {
				id: "",
				key,
				handle,
				username,
				name: hi > 0 ? lines[hi - 1] : username,
				bio: lines
					.slice(hi + 1)
					.filter((value) => !["Following", "フォロー中"].includes(value))
					.slice(0, 3)
					.join("\n"),
				avatarUrl: cell.querySelector("img")?.src || "",
				profileUrl: `${location.origin}/${username}`,
			});
		});
		state.users = Array.from(map.values());
	}

	async function loadState() {
		seedFromDom();
		try {
			const stored = await chrome.storage.local.get(Object.values(KEYS));
			if (
				Array.isArray(stored[KEYS.following]) &&
				stored[KEYS.following].length
			)
				state.users = stored[KEYS.following];
			state.bookmarks = stored[KEYS.bookmarks] || {};
			state.lists = Array.isArray(stored[KEYS.lists]) ? stored[KEYS.lists] : [];
			state.memberships = stored[KEYS.memberships] || {};
			state.media = stored[KEYS.media] || {};
		} catch {}
		if (
			!state.selectedKey ||
			!state.users.some((user) => user.key === state.selectedKey)
		) {
			state.selectedKey = state.users[0]?.key || "";
		}
	}

	function selectedUser() {
		return state.users.find((user) => user.key === state.selectedKey) || null;
	}

	function filteredUsers() {
		const q = state.search.trim().toLowerCase();
		if (!q) return state.users;
		return state.users.filter((user) =>
			`${user.name} ${user.handle} ${user.bio}`.toLowerCase().includes(q),
		);
	}

	function renderMedia(items) {
		const grid = el("div", "xfr-media-grid");
		if (!items.length) {
			grid.append(el("div", "xfr-media-placeholder", "取得中 / なし"));
			return grid;
		}
		items.slice(0, 18).forEach((item) => {
			const link = el("a");
			link.href = item.postUrl || item.url;
			link.target = "_blank";
			link.rel = "noopener";
			const img = el("img");
			img.src = item.url;
			img.alt = item.type === "video" ? "動画" : "画像";
			img.loading = "lazy";
			link.append(img);
			grid.append(link);
		});
		return grid;
	}

	function renderBookmarks(posts) {
		const grid = el("div", "xfr-bookmarks-grid");
		if (!posts.length) {
			const empty = el("div", "xfr-bookmark-tile", "なし");
			empty.style.display = "grid";
			empty.style.placeItems = "center";
			grid.append(empty);
			return grid;
		}
		posts.slice(0, 18).forEach((post) => {
			const link = el("a", "xfr-bookmark-tile");
			link.href = post.url;
			link.target = "_blank";
			link.rel = "noopener";
			link.title = post.text || "";
			const media = post.media?.[0];
			if (media?.url) {
				const img = el("img");
				img.src = media.url;
				img.alt = "";
				img.loading = "lazy";
				link.append(img);
			} else {
				const text = el("div", "", post.text || "投稿を開く");
				text.style.padding = "9px";
				text.style.fontSize = "11px";
				link.append(text);
			}
			grid.append(link);
		});
		return grid;
	}

	function postRequest(marker, action, payload = {}, timeout = 30000) {
		seq += 1;
		const id = `xfr-ui-${Date.now()}-${seq}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`${action} timed out`));
			}, timeout);
			pending.set(id, { resolve, reject, timer });
			window.postMessage({ marker, type: "request", id, action, payload }, "*");
		});
	}

	async function toggleMembership(list, checked) {
		const user = selectedUser();
		if (!user || !list) return;
		state.busy = true;
		render();
		try {
			await postRequest(
				GQL_MARKER,
				"toggle-list",
				{
					username: user.username,
					listId: list.id,
					add: checked,
				},
				45000,
			);
			const current = Array.isArray(state.memberships[user.key])
				? state.memberships[user.key].slice()
				: [];
			state.memberships[user.key] = checked
				? [
						...current.filter((value) => String(value.id) !== String(list.id)),
						{ id: list.id, name: list.name },
					]
				: current.filter((value) => String(value.id) !== String(list.id));
			await chrome.storage.local.set({ [KEYS.memberships]: state.memberships });
		} catch (error) {
			window.alert(`リスト更新に失敗しました: ${error.message}`);
		} finally {
			state.busy = false;
			render();
		}
	}

	async function unfollowSelected() {
		const user = selectedUser();
		if (!user?.id) return;
		if (!window.confirm(`@${user.username} のフォローを解除しますか？`)) return;
		state.busy = true;
		render();
		try {
			await postRequest(ACTION_MARKER, "unfollow", { userId: user.id }, 30000);
			const index = state.users.findIndex((value) => value.key === user.key);
			state.users = state.users.filter((value) => value.key !== user.key);
			state.selectedKey =
				state.users[Math.min(index, state.users.length - 1)]?.key || "";
			await chrome.storage.local.set({ [KEYS.following]: state.users });
		} catch (error) {
			window.alert(`フォロー解除に失敗しました: ${error.message}`);
		} finally {
			state.busy = false;
			render();
		}
	}

	function renderListPane() {
		const pane = el("aside", "xfr-list-pane");
		const searchWrap = el("div", "xfr-search-wrap");
		const input = el("input", "xfr-search");
		input.type = "search";
		input.placeholder = `フォロー中を検索 (${state.users.length})`;
		input.value = state.search;
		input.addEventListener("input", () => {
			state.search = input.value;
			state.listScrollTop = 0;
			render();
			requestAnimationFrame(() => {
				const next = shadow?.querySelector(".xfr-search");
				next?.focus();
				if (next) next.setSelectionRange(next.value.length, next.value.length);
			});
		});
		searchWrap.append(input);
		pane.append(searchWrap);

		const list = el("div", "xfr-user-list");
		list.addEventListener(
			"scroll",
			() => {
				state.listScrollTop = list.scrollTop;
			},
			{ passive: true },
		);

		const users = filteredUsers();
		if (!users.length) {
			list.append(
				el(
					"div",
					"xfr-empty",
					state.users.length
						? "該当するユーザーはいません"
						: "Followingを取得中…",
				),
			);
		}

		users.forEach((user) => {
			const row = button(
				"",
				() => {
					state.listScrollTop = list.scrollTop;
					state.selectedKey = user.key;
					render();
				},
				"xfr-user-row",
			);
			row.dataset.selected = user.key === state.selectedKey ? "true" : "false";

			const avatar = el("img", "xfr-list-avatar");
			avatar.src = user.avatarUrl || "";
			avatar.alt = "";

			const main = el("div", "xfr-user-main");
			main.append(el("div", "xfr-list-name", user.name || user.username));
			main.append(
				el("div", "xfr-list-handle", user.handle || `@${user.username}`),
			);
			const meta = el("div", "xfr-row-meta");
			meta.append(
				el(
					"span",
					"xfr-mini-chip",
					`★ ${state.bookmarks[user.key]?.length || 0}`,
				),
			);
			meta.append(
				el(
					"span",
					"xfr-mini-chip",
					`リスト ${state.memberships[user.key]?.length || 0}`,
				),
			);
			main.append(meta);
			row.append(avatar, main);
			list.append(row);
		});

		pane.append(list);
		requestAnimationFrame(() => {
			if (!list.isConnected) return;
			const max = Math.max(0, list.scrollHeight - list.clientHeight);
			list.scrollTop = Math.min(state.listScrollTop, max);
		});
		return pane;
	}

	function renderDetailPane() {
		const pane = el("section", "xfr-detail-pane");
		const user = selectedUser();
		if (!user) {
			pane.append(
				el("div", "xfr-empty", "左の一覧からユーザーを選択してください"),
			);
			return pane;
		}

		const profile = el("section", "xfr-profile");
		const avatar = el("img", "xfr-avatar");
		avatar.src = user.avatarUrl || "";
		avatar.alt = "";

		const identity = el("div");
		const nameRow = el("div", "xfr-name-row");
		nameRow.append(
			profileLink(user, "xfr-name", user.name || user.username),
			profileLink(user, "xfr-handle", user.handle || `@${user.username}`),
		);
		identity.append(nameRow);
		if ((user.bio || "").trim())
			identity.append(el("div", "xfr-bio", user.bio));

		const actions = el("div", "xfr-profile-actions");
		const unfollow = button(
			"フォロー解除",
			() => void unfollowSelected(),
			"xfr-danger",
		);
		unfollow.disabled = state.busy || !user.id;
		actions.append(unfollow);
		profile.append(avatar, identity, actions);
		pane.append(profile);

		const summary = el("div", "xfr-summary");
		summary.append(
			el(
				"span",
				"xfr-chip",
				`リスト ${state.memberships[user.key]?.length || 0}`,
			),
		);
		summary.append(
			el(
				"span",
				"xfr-chip",
				`★ ブックマーク ${state.bookmarks[user.key]?.length || 0}`,
			),
		);
		pane.append(summary);

		const grid = el("div", "xfr-detail-grid");
		const primary = el("div", "xfr-primary-detail");

		const mediaSection = el("section", "xfr-section");
		const mediaHead = el("div", "xfr-section-head");
		mediaHead.append(
			el("div", "xfr-section-title", "最近の画像・動画"),
			el(
				"div",
				"xfr-section-note",
				state.media[user.key]?.updatedAt
					? `${state.media[user.key]?.items?.length || 0}件`
					: "取得中",
			),
		);
		mediaSection.append(
			mediaHead,
			renderMedia(state.media[user.key]?.items || []),
		);
		primary.append(mediaSection);

		const bookmarkSection = el("section", "xfr-section");
		const bookmarkHead = el("div", "xfr-section-head");
		bookmarkHead.append(
			el("div", "xfr-section-title", "自分がブックマークした投稿"),
			el(
				"div",
				"xfr-section-note",
				`${state.bookmarks[user.key]?.length || 0}件`,
			),
		);
		bookmarkSection.append(
			bookmarkHead,
			renderBookmarks(state.bookmarks[user.key] || []),
		);
		primary.append(bookmarkSection);

		const side = el("aside", "xfr-side-detail");
		const listSection = el("section", "xfr-section");
		const listHead = el("div", "xfr-section-head");
		listHead.append(
			el("div", "xfr-section-title", "リスト"),
			el("div", "xfr-section-note", `${state.lists.length}件`),
		);
		listSection.append(listHead);

		const options = el("div", "xfr-list-options");
		if (!state.lists.length)
			options.append(el("div", "xfr-empty", "リストを取得中…"));
		const memberIds = new Set(
			(state.memberships[user.key] || []).map((value) => String(value.id)),
		);
		state.lists.forEach((list) => {
			const label = el("label", "xfr-list-option");
			const checkbox = el("input");
			checkbox.type = "checkbox";
			checkbox.checked = memberIds.has(String(list.id));
			checkbox.disabled = state.busy;
			checkbox.addEventListener(
				"change",
				() => void toggleMembership(list, checkbox.checked),
			);
			label.append(checkbox, el("span", "", list.name));
			options.append(label);
		});
		listSection.append(options);
		side.append(listSection);

		grid.append(primary, side);
		pane.append(grid);
		return pane;
	}

	function render() {
		if (!root) return;
		root.replaceChildren();
		root.dataset.open = state.open ? "true" : "false";
		applyGeometry();

		root.append(
			button(
				"Review Mode",
				async () => {
					state.open = true;
					await loadState();
					render();
				},
				"xfr-toggle",
			),
		);

		const workspace = el("div", "xfr-workspace");
		const top = el("header", "xfr-topbar");
		top.append(el("div", "xfr-title", "Follow Review"));
		const close = button("通常表示", () => {
			state.open = false;
			render();
		});
		close.style.marginLeft = "auto";
		top.append(close);
		workspace.append(top);

		const main = el("main", "xfr-main");
		main.append(renderListPane(), renderDetailPane());
		workspace.append(main);
		root.append(workspace);
	}

	async function refreshFromStorage() {
		await loadState();
		render();
	}

	function mount() {
		if (host || !isRoute()) return;
		host = document.createElement("div");
		host.id = HOST_ID;
		shadow = host.attachShadow({ mode: "open" });
		const style = el("style");
		style.textContent = css;
		shadow.append(style);
		root = el("div", "xfr-shell");
		root.dataset.open = "false";
		shadow.append(root);
		document.documentElement.append(host);
		applyTheme();
		applyGeometry();
		void loadState().then(render);
	}

	function unmount() {
		host?.remove();
		host = null;
		shadow = null;
		root = null;
		state.open = false;
	}

	window.addEventListener("resize", scheduleLayout, { passive: true });
	document.addEventListener(
		"keydown",
		(event) => {
			if (state.open && event.key === "Escape") {
				state.open = false;
				render();
			}
		},
		true,
	);

	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		const message = event.data;
		if (
			!message ||
			(message.marker !== GQL_MARKER && message.marker !== ACTION_MARKER) ||
			message.type !== "response"
		)
			return;
		const job = pending.get(message.id);
		if (!job) return;
		clearTimeout(job.timer);
		pending.delete(message.id);
		if (message.ok) job.resolve(message.result);
		else job.reject(new Error(message.error || "request failed"));
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== "local") return;
		if (Object.values(KEYS).some((key) => key in changes))
			void refreshFromStorage();
	});

	const observer = new MutationObserver(() => {
		if (location.pathname !== lastPath) {
			lastPath = location.pathname;
			if (isRoute()) setTimeout(mount, 80);
			else unmount();
			return;
		}
		if (isRoute() && !host) mount();
		scheduleLayout();
	});
	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	if (isRoute()) mount();
})();
