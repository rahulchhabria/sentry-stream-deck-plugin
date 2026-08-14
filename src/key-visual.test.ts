import assert from "node:assert/strict";
import { test } from "node:test";

import { createActionIcon, createActionIconSvg, type ActionIconName } from "./key-visual";

const names: ActionIconName[] = ["pulse", "this", "next", "send", "loop", "done"];

test("creates a distinct normal and glow SVG for every action icon", () => {
	for (const name of names) {
		const normal = createActionIconSvg(name, { color: "#ff375f" });
		const glow = createActionIconSvg(name, { color: "#ff375f", glow: true });

		assert.match(normal, /<rect width="288" height="288" fill="#000"\/>/);
		assert.match(normal, /<use href="#glyph" color="#fff"/);
		assert.doesNotMatch(normal, /filter="url\(#blur44\)" opacity="\.9"/);
		assert.match(glow, /filter="url\(#blur44\)" opacity="\.9"/);
		assert.notEqual(normal, glow);
	}
});

test("encodes action icons as SVG data URIs", () => {
	const uri = createActionIcon("done", { color: "#34d399", glow: true });
	assert.match(uri, /^data:image\/svg\+xml;base64,/);
	const svg = Buffer.from(uri.split(",", 2)[1]!, "base64").toString("utf8");
	assert.match(svg, /<circle cx="144" cy="144" r="92"\/>/);
});
