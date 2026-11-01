import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Evaluate the shipped classic script in a fresh world; no browser or network.
const window = {};
runInNewContext(
	readFileSync(
		new URL("../src/main/graphql-response.js", import.meta.url),
		"utf8",
	),
	{ window, location: { origin: "https://fixture.invalid" } },
);
const parser = window.__xfrGraphqlResponse;
const user = {
	rest_id: "10",
	core: { screen_name: "Alice", name: "Alice Core" },
	legacy: { screen_name: "OldName", description: "legacy bio" },
	profile_bio: { description: "" },
	avatar: { image_url: "avatar.png" },
};
const tweet = {
	rest_id: "20",
	core: { user_results: { result: user } },
	legacy: { full_text: "short text" },
	note_tweet: { note_tweet_results: { result: { text: "long note" } } },
};
const list = {
	rest_id: "30",
	name: "Reading",
	member_count: "2",
	mode: "PRIVATE",
	is_member: false,
	owner_results: { result: user },
};

describe("User normalization", () => {
	test("core takes precedence; empty modern bio is preserved", () => {
		expect(parser.normalizeUser(user)).toEqual({
			id: "10",
			username: "Alice",
			handle: "@Alice",
			key: "@alice",
			name: "Alice Core",
			bio: "",
			avatarUrl: "avatar.png",
			profileUrl: "https://fixture.invalid/Alice",
		});
	});
	test("legacy and top-level fallbacks retain the saved shape", () => {
		expect(
			parser.normalizeUser({
				legacy: {
					id_str: "11",
					screen_name: "Bob",
					profile_image_url_https: "old.png",
				},
			}),
		).toEqual({
			id: "11",
			username: "Bob",
			handle: "@Bob",
			key: "@bob",
			name: "Bob",
			bio: "",
			avatarUrl: "old.png",
			profileUrl: "https://fixture.invalid/Bob",
		});
		expect(
			parser.normalizeUser({ id_str: "12", screen_name: "Carol" })?.key,
		).toBe("@carol");
	});
	test("unavailable, incomplete and non-object users are excluded", () => {
		for (const value of [
			null,
			"user",
			{},
			{ rest_id: "10" },
			{ ...user, __typename: "UserUnavailable" },
		])
			expect(parser.normalizeUser(value)).toBeNull();
	});
	test("nested duplicates keep the first result in traversal order", () => {
		expect(
			parser.collectUsers({
				entries: [
					user,
					{ nested: { ...user, core: { screen_name: "Changed" } } },
				],
			}),
		).toEqual([parser.normalizeUser(user)]);
	});
});

describe("Tweet normalization", () => {
	test("note text and author fields survive visibility wrappers", () => {
		const expected = {
			id: "20",
			authorKey: "@alice",
			username: "Alice",
			text: "long note",
			url: "https://fixture.invalid/Alice/status/20",
			media: [],
		};
		expect(
			parser.normalizeTweet({
				__typename: "TweetWithVisibilityResults",
				tweet,
			}),
		).toEqual(expected);
		expect(
			parser.normalizeTweet({
				__typename: "TweetWithVisibilityResults",
				tweet_results: { result: tweet },
			}),
		).toEqual(expected);
	});
	test("media-only posts keep types and drop missing URLs", () => {
		expect(
			parser.normalizeTweet({
				...tweet,
				note_tweet: null,
				legacy: {
					extended_entities: {
						media: [
							{ type: "photo", media_url_https: "image.png" },
							{ type: "video", media_url: "video.jpg" },
							{ type: "photo" },
						],
					},
				},
			})?.media,
		).toEqual([
			{ type: "image", url: "image.png" },
			{ type: "video", url: "video.jpg" },
		]);
	});
	test("rejects missing authors and empty posts; entities alone keep the existing exclusion", () => {
		expect(
			parser.normalizeTweet({ rest_id: "20", text: "no author" }),
		).toBeNull();
		expect(
			parser.normalizeTweet({
				...tweet,
				note_tweet: null,
				legacy: { entities: { media: [{ media_url: "image.png" }] } },
			}),
		).toBeNull();
		expect(parser.normalizeTweet(null)).toBeNull();
	});
	test("recursive collection keeps the first duplicate tweet", () => {
		expect(parser.collectTweets([tweet, { nested: tweet }])).toEqual([
			parser.normalizeTweet(tweet),
		]);
	});
});

describe("List normalization", () => {
	test("false membership remains distinct from a missing flag", () => {
		expect(parser.normalizeList(list)).toEqual({
			id: "30",
			name: "Reading",
			description: "",
			memberCount: 2,
			isPrivate: true,
			isMember: false,
			hasMembershipFlag: true,
			ownerId: "10",
		});
		const { is_member, ...withoutMembership } = list;
		expect(parser.normalizeList(withoutMembership)?.hasMembershipFlag).toBe(
			false,
		);
	});
	test("legacy list signals and owner fallbacks are preserved", () => {
		expect(
			parser.normalizeList({
				legacy: {
					id_str: "31",
					name: "Legacy",
					mode: "public",
					is_member: true,
					user_results: { result: { legacy: { id_str: "11" } } },
				},
			}),
		).toEqual({
			id: "31",
			name: "Legacy",
			description: "",
			memberCount: 0,
			isPrivate: false,
			isMember: true,
			hasMembershipFlag: true,
			ownerId: "11",
		});
		const inherited = Object.assign(Object.create({ is_member: true }), {
			rest_id: "32",
			name: "Inherited",
		});
		expect(parser.normalizeList(inherited)?.hasMembershipFlag).toBe(false);
		expect(parser.normalizeList(inherited)?.isMember).toBe(true);
	});
	test("rejects list-like objects without signals or a string name", () => {
		for (const value of [
			null,
			{},
			{ rest_id: "30", name: "No signal" },
			{ ...list, name: 42 },
		])
			expect(parser.normalizeList(value)).toBeNull();
		expect(
			parser.collectLists([list, { nested: { ...list, name: "Later" } }]),
		).toEqual([parser.normalizeList(list)]);
	});
});

describe("Traversal and cursors", () => {
	test("cycles and shared objects are visited once, depth first", () => {
		const leaf = { name: "leaf" };
		const root = { children: [leaf, leaf] };
		root.self = root;
		const visited = [];
		parser.walk(root, (value) => {
			visited.push(value);
		});
		expect(visited).toEqual([root, root.children, leaf]);
		expect(
			parser.walk(null, () => {
				throw new Error("must not visit null");
			}),
		).toBeUndefined();
	});
	test("all three cursor shapes are recognized", () => {
		for (const value of [
			{ cursorType: "Bottom", value: "next" },
			{ entryId: "cursor-bottom-1", content: { value: "next" } },
			{
				entryId: "CURSOR-BOTTOM-2",
				content: { itemContent: { value: "next" } },
			},
		])
			expect(parser.bottomCursor({ entries: [value] })).toBe("next");
	});
	test("first nonempty bottom cursor wins; top/non-string cursors are ignored", () => {
		expect(
			parser.bottomCursor([
				{ cursorType: "Top", value: "top" },
				{ cursorType: "Bottom", value: 5 },
				{ cursorType: "Bottom", value: "" },
				{ cursorType: "Bottom", value: "first" },
				{ cursorType: "Bottom", value: "second" },
			]),
		).toBe("first");
		expect(parser.bottomCursor({})).toBe("");
	});
});
