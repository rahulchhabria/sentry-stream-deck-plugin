import assert from "node:assert/strict";
import { test } from "node:test";

import { createActionIcon, createActionIconSvg, type ActionIconName } from "./key-visual";

const names: ActionIconName[] = ["pulse", "inspect", "next", "agent", "pr", "resolve"];

test("creates a distinct normal and glow SVG for every action icon", () => {
	for (const name of names) {
		const normal = createActionIconSvg(name, { color: "#ff375f" });
		const glow = createActionIconSvg(name, { color: "#ff375f", glow: true });

		assert.match(normal, /<rect width="288" height="288" fill="#000"\/>/);
		assert.match(normal, /<g fill="none" stroke="#fff"/);
		assert.match(normal, /transform="translate\(31 -16\) scale\(\.78\)"/);
		assert.match(normal, /<text[^>]*>[^<]+<\/text>/);
		assert.doesNotMatch(normal, /<use\b/);
		assert.doesNotMatch(normal, /filter="url\(#blur44\)" opacity="\.9"/);
		assert.match(glow, /filter="url\(#blur44\)" opacity="\.9"/);
		assert.doesNotMatch(glow, /<use\b/);
		assert.notEqual(normal, glow);
	}
});

test("renders labels and optional values inside the icon", () => {
	const svg = createActionIconSvg("inspect", { color: "#a78bfa", value: "3" });
	assert.match(svg, />INSPECT<\/text>/);
	assert.match(svg, />3<\/text>/);
	assert.match(svg, /y="237"/);
	assert.match(svg, /y="271"/);
});

test("encodes action icons as SVG data URIs", () => {
	const uri = createActionIcon("resolve", { color: "#34d399", glow: true });
	assert.match(uri, /^data:image\/svg\+xml;base64,/);
	const svg = Buffer.from(uri.split(",", 2)[1]!, "base64").toString("utf8");
	assert.match(svg, /<circle cx="144" cy="144" r="92"\/>/);
});
