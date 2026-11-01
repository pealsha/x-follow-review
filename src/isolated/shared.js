(() => {
	const KEYS = {
		following: "xFollowReview.following.v1",
		bookmarks: "xFollowReview.bookmarksByAuthor.v1",
		bookmarkMeta: "xFollowReview.bookmarkMeta.v1",
		lists: "xFollowReview.lists.v1",
		memberships: "xFollowReview.listMemberships.v1",
		memberCache: "xFollowReview.listMembers.v1",
		indexMeta: "xFollowReview.listIndexMeta.v1",
		media: "xFollowReview.mediaByAuthor.v1",
		status: "xFollowReview.syncStatus.v1",
	};

	function canonicalUserKey(value) {
		const raw = String(value || "")
			.trim()
			.toLowerCase()
			.replace(/^@/, "");
		return raw ? `@${raw}` : "";
	}

	window.__xfrIsolatedShared = {
		HOST_ID: "x-follow-review-ui-host",
		KEYS,
		REOPEN_KEY: "xFollowReview.reopenAfterReload.v1",
		MARKERS: {
			gql: "X_FOLLOW_REVIEW_GQL_V1",
			action: "X_FOLLOW_REVIEW_ACTION_V1",
			control: "X_FOLLOW_REVIEW_CONTROL_V1",
			relation: "X_FOLLOW_REVIEW_RELATION_V1",
			probe: "X_FOLLOW_REVIEW_PROBE_V1",
			probeEvent: "X_FOLLOW_REVIEW_PROBE_EVENT",
		},
		canonicalUserKey,
	};
})();
