import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Glob } from "bun";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const files = new Set();
const add = (file) => {
	if (file) files.add(file);
};
const addIcons = (icons) => {
	if (typeof icons === "string") add(icons);
	else if (icons) Object.values(icons).forEach(add);
};

add(manifest.background?.service_worker);
manifest.background?.scripts?.forEach(add);
add(manifest.options_page);
add(manifest.options_ui?.page);
add(manifest.devtools_page);
addIcons(manifest.icons);
for (const action of [
	manifest.action,
	manifest.browser_action,
	manifest.page_action,
]) {
	add(action?.default_popup);
	addIcons(action?.default_icon);
}
for (const content of manifest.content_scripts || []) {
	content.js?.forEach(add);
	content.css?.forEach(add);
}
for (const page of manifest.sandbox?.pages || []) add(page);
for (const page of Object.values(manifest.chrome_url_overrides || {}))
	add(page);
for (const group of manifest.web_accessible_resources || []) {
	for (const resource of group.resources) {
		if (resource.includes("*")) {
			if (![...new Glob(resource).scanSync({ cwd: root })].length)
				throw new Error(
					`manifest.json: ${resource} に一致するファイルがありません。ファイルを追加するか resources のパスを直してください。`,
				);
		} else add(resource);
	}
}

let failures = 0;
for (const file of files) {
	try {
		if (!statSync(join(root, file)).isFile()) throw new Error("not a file");
	} catch {
		console.error(
			`manifest.json: ${file} が存在しません。ファイルを戻すか、manifest.json のパスを実際のファイル名に直してください。`,
		);
		failures += 1;
	}
}

function javascriptFiles(directory) {
	return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
		(entry) => {
			const file = join(directory, entry.name);
			if (entry.isDirectory()) return javascriptFiles(file);
			return entry.isFile() && file.endsWith(".js") ? [file] : [];
		},
	);
}

const sources = javascriptFiles("src");
for (const file of sources) {
	try {
		// Node's Script eagerly parses classic scripts without executing their hooks.
		const result = spawnSync(
			"node",
			[
				"--input-type=commonjs",
				"--eval",
				'new (require("node:vm").Script)(require("node:fs").readFileSync(0, "utf8"));',
			],
			{
				input: readFileSync(join(root, file), "utf8"),
				encoding: "utf8",
			},
		);
		if (result.error || result.status !== 0)
			throw new Error(result.error?.message || result.stderr);
	} catch (error) {
		console.error(
			`${file}: JavaScript の構文エラー: ${error.message}\n該当ファイルの括弧・引用符・宣言を直し、bun run check を再実行してください。`,
		);
		failures += 1;
	}
}

if (failures) process.exitCode = 1;
else
	console.log(
		`Project check: ${files.size} manifest files exist; ${sources.length} src JavaScript files parse as classic scripts.`,
	);
