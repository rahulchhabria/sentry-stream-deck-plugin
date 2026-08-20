import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const path = "com.rc.sentry-alerts.sdPlugin/ui/sentry-settings.html";

test("Property Inspector provides validation, progressive disclosure, and public help", async () => {
	const html = await readFile(path, "utf8");
	assert.match(html, /id="validation-summary"/);
	assert.match(html, /aria-live="polite"/);
	assert.match(html, /function validate\(\)/);
	assert.match(html, /Repository must be an absolute macOS or Windows path/);
	assert.match(html, /<details open>/);
	assert.match(html, /id="terminal-app-row"[^>]*hidden/);
	assert.match(html, /id="editor-args-row"[^>]*hidden/);
	assert.match(html, /sentry-stream-deck-plugin#configure/);
	assert.match(html, /sentry-stream-deck-plugin\/issues/);
	assert.match(html, /blob\/main\/PRIVACY\.md/);
});
