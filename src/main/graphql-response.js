(() => {
	function walk(value, fn, seen = new Set()) {
		if (!value || typeof value !== "object" || seen.has(value)) return;
		seen.add(value);
		fn(value);
		if (Array.isArray(value))
			value.forEach((item) => {
				walk(item, fn, seen);
			});
		else
			Object.values(value).forEach((item) => {
				walk(item, fn, seen);
			});
	}

	function normalizeUser(result) {
		if (
			!result ||
			typeof result !== "object" ||
			result.__typename === "UserUnavailable"
		)
			return null;
		const legacy = result.legacy || {};
		const core = result.core || {};
		const username =
			core.screen_name || legacy.screen_name || result.screen_name || "";
		const id = String(result.rest_id || result.id_str || legacy.id_str || "");
		if (!id || !username) return null;
		return {
			id,
			username,
			handle: `@${username}`,
			key: `@${username}`.toLowerCase(),
			name: core.name || legacy.name || username,
			bio: result.profile_bio?.description ?? legacy.description ?? "",
			avatarUrl:
				result.avatar?.image_url || legacy.profile_image_url_https || "",
			profileUrl: `${location.origin}/${username}`,
		};
	}

	function collectUsers(data) {
		const map = new Map();
		walk(data, (obj) => {
			const user = normalizeUser(obj);
			if (user && !map.has(user.id)) map.set(user.id, user);
		});
		return Array.from(map.values());
	}

	function normalizeTweet(tweet) {
		if (!tweet || typeof tweet !== "object") return null;
		if (tweet.__typename === "TweetWithVisibilityResults")
			tweet = tweet.tweet || tweet.tweet_results?.result || tweet;
		const id = String(
			tweet.rest_id || tweet.id_str || tweet.legacy?.id_str || "",
		);
		const text =
			tweet.note_tweet?.note_tweet_results?.result?.text ||
			tweet.legacy?.full_text ||
			tweet.full_text ||
			tweet.text ||
			"";
		if (!id || (!text && !tweet.legacy?.extended_entities?.media)) return null;
		const author = normalizeUser(
			tweet.core?.user_results?.result || tweet.user_results?.result,
		);
		if (!author) return null;
		const rawMedia =
			tweet.legacy?.extended_entities?.media ||
			tweet.legacy?.entities?.media ||
			[];
		const media = rawMedia
			.map((item) => ({
				type: item.type === "photo" ? "image" : item.type || "media",
				url: item.media_url_https || item.media_url || "",
			}))
			.filter((item) => item.url);
		return {
			id,
			authorKey: author.key,
			username: author.username,
			text,
			url: `${location.origin}/${author.username}/status/${id}`,
			media,
		};
	}

	function collectTweets(data) {
		const map = new Map();
		walk(data, (obj) => {
			const tweet = normalizeTweet(obj);
			if (tweet && !map.has(tweet.id)) map.set(tweet.id, tweet);
		});
		return Array.from(map.values());
	}

	function normalizeList(obj) {
		if (!obj || typeof obj !== "object") return null;
		const legacy = obj.legacy || {};
		const id = String(obj.rest_id || obj.id_str || legacy.id_str || "");
		const name = obj.name || legacy.name || "";
		const hasSignals =
			"member_count" in obj ||
			"member_count" in legacy ||
			"mode" in obj ||
			"mode" in legacy ||
			"is_member" in obj ||
			"is_member" in legacy;
		if (!id || typeof name !== "string" || !name || !hasSignals) return null;
		const ownerResult =
			obj.user_results?.result ||
			obj.owner_results?.result ||
			obj.user?.result ||
			legacy.user_results?.result ||
			null;
		const hasMembershipFlag =
			Object.hasOwn(obj, "is_member") || Object.hasOwn(legacy, "is_member");
		return {
			id,
			name,
			description: obj.description || legacy.description || "",
			memberCount: Number(obj.member_count ?? legacy.member_count ?? 0),
			isPrivate:
				String(obj.mode || legacy.mode || "").toLowerCase() === "private",
			isMember: (obj.is_member ?? legacy.is_member) === true,
			hasMembershipFlag,
			ownerId: String(
				ownerResult?.rest_id ||
					ownerResult?.id_str ||
					ownerResult?.legacy?.id_str ||
					"",
			),
		};
	}

	function collectLists(data) {
		const map = new Map();
		walk(data, (obj) => {
			const list = normalizeList(obj);
			if (list && !map.has(list.id)) map.set(list.id, list);
		});
		return Array.from(map.values());
	}

	function bottomCursor(data) {
		let cursor = "";
		walk(data, (obj) => {
			if (cursor) return;
			if (obj.cursorType === "Bottom" && typeof obj.value === "string")
				cursor = obj.value;
			else if (
				typeof obj.entryId === "string" &&
				/cursor-bottom/i.test(obj.entryId) &&
				typeof obj.content?.value === "string"
			)
				cursor = obj.content.value;
			else if (
				typeof obj.entryId === "string" &&
				/cursor-bottom/i.test(obj.entryId) &&
				typeof obj.content?.itemContent?.value === "string"
			)
				cursor = obj.content.itemContent.value;
		});
		return cursor;
	}

	window.__xfrGraphqlResponse = {
		walk,
		normalizeUser,
		collectUsers,
		normalizeTweet,
		collectTweets,
		normalizeList,
		collectLists,
		bottomCursor,
	};
})();
