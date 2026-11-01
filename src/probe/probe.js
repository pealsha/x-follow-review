const STORAGE_KEY = "xFollowReviewProbe.events";
let currentEvents = [];
const getElement = (id) => document.getElementById(id);
function latestByOperation(events) {
	const map = new Map();
	for (const event of events) {
		if (!event.operation) continue;
		const group = map.get(event.operation) || {
			operation: event.operation,
			events: [],
		};
		group.events.push(event);
		map.set(event.operation, group);
	}
	return [...map.values()]
		.map((group) => {
			const sorted = group.events.sort(
				(a, b) => (b.capturedAt || 0) - (a.capturedAt || 0),
			);
			const shapeEvent = sorted.find(
				(e) => e.kind === "response-shape" && e.response?.shape,
			);
			const responseMeta = sorted.find((e) => e.status != null);
			return {
				operation: group.operation,
				queryId: sorted.find((e) => e.queryId)?.queryId || "",
				method: sorted.find((e) => e.method)?.method || "",
				status: responseMeta?.status ?? "",
				hasShape: Boolean(shapeEvent),
				lastAt: sorted[0]?.capturedAt || 0,
				representative: shapeEvent || sorted[0],
				events: sorted,
			};
		})
		.sort((a, b) => b.lastAt - a.lastAt);
}
function formatTime(timestampMs) {
	return timestampMs
		? new Intl.DateTimeFormat("ja-JP", {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			}).format(new Date(timestampMs))
		: "";
}
function setStatus(id, names) {
	const element = getElement(id);
	element.textContent = names.length
		? `観測済み: ${names.slice(0, 3).join(", ")}`
		: "未観測";
	element.classList.toggle("ok", names.length > 0);
}
function render(events) {
	currentEvents = events;
	const groups = latestByOperation(events);
	getElement("count").textContent =
		`${groups.length} operations / ${events.length} events`;
	const rows = getElement("rows");
	rows.textContent = "";
	for (const group of groups) {
		const row = document.createElement("tr");
		for (const value of [
			group.operation,
			group.queryId,
			group.method,
			String(group.status),
			group.hasShape ? "yes" : "no",
			formatTime(group.lastAt),
		]) {
			const cell = document.createElement("td");
			cell.textContent = value;
			row.appendChild(cell);
		}
		row.addEventListener("click", () => {
			getElement("detail-help").style.display = "none";
			getElement("detail").textContent = JSON.stringify(
				{
					operation: group.operation,
					latestUsefulEvent: group.representative,
					recentEvents: group.events.slice(0, 5),
				},
				null,
				2,
			);
		});
		rows.appendChild(row);
	}
	const names = groups.map((group) => group.operation);
	setStatus(
		"status-following",
		names.filter((operationName) =>
			operationName.toLowerCase().includes("following"),
		),
	);
	setStatus(
		"status-bookmarks",
		names.filter((operationName) =>
			operationName.toLowerCase().includes("bookmark"),
		),
	);
	setStatus(
		"status-media",
		names.filter((operationName) => /usermedia|media/i.test(operationName)),
	);
	setStatus(
		"status-lists",
		names.filter((operationName) =>
			/listmanagement|listmembers|listownership|listmembership/i.test(
				operationName,
			),
		),
	);
}
async function load() {
	const stored = await chrome.storage.local.get(STORAGE_KEY);
	render(Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : []);
}
getElement("refresh").addEventListener("click", load);
getElement("clear").addEventListener("click", async () => {
	await chrome.storage.local.remove(STORAGE_KEY);
	getElement("detail").textContent = "";
	getElement("detail-help").style.display = "";
	render([]);
});
getElement("copy").addEventListener("click", async () => {
	const useful = latestByOperation(currentEvents).map((group) => ({
		operation: group.operation,
		queryId: group.queryId,
		method: group.method,
		status: group.status,
		responseShapeCaptured: group.hasShape,
		event: (() => {
			const { tabUrl, requestId, capturedAt, ...safe } =
				group.representative || {};
			return safe;
		})(),
	}));
	await navigator.clipboard.writeText(
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				note: "No Authorization/Cookie/CSRF values are intentionally stored by this probe.",
				operations: useful,
			},
			null,
			2,
		),
	);
	const button = getElement("copy");
	const previousText = button.textContent;
	button.textContent = "コピーしました";
	setTimeout(() => (button.textContent = previousText), 1200);
});
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes[STORAGE_KEY])
		render(
			Array.isArray(changes[STORAGE_KEY].newValue)
				? changes[STORAGE_KEY].newValue
				: [],
		);
});
load();
