import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildAgentCommand, buildAgentPrompt, writeHandoffFile } from "./agent-handoff";
import type { SentryIssue } from "./sentry-api";

const issue: SentryIssue = {
	id: "123",
	shortId: "WEB-123",
	title: "Service crashed on startup",
	permalink: "https://sentry.io/issues/123/",
	status: "unresolved"
};

const settings = {
	sentryUrl: "https://sentry.io",
	organizationSlug: "acme",
	projectSlug: "web",
	repositoryPath: "/work/repo"
};

test("buildAgentCommand places the prompt last and respects extra args", () => {
	const cmd1 = buildAgentCommand("agent", "agent", undefined, "hello");
	assert.equal(cmd1.executable, "agent");
	assert.deepEqual(cmd1.args, ["hello"]);

	const cmd2 = buildAgentCommand("claude", "/opt/bin/claude", "--plan --foo bar", "do it");
	assert.equal(cmd2.executable, "/opt/bin/claude");
	assert.deepEqual(cmd2.args, ["--plan", "--foo", "bar", "do it"]);

	const cmd3 = buildAgentCommand("codex", "/usr/local/bin/codex", "", "prompt");
	assert.deepEqual(cmd3.args.at(-1), "prompt");

	const cmd4 = buildAgentCommand("unknown", "/custom/agent", "--alpha \"two words\"", "go");
	assert.deepEqual(cmd4.args, ["--alpha", "two words", "go"]);
});

test("buildAgentPrompt includes shortId and permalink but not token", () => {
	const prompt = buildAgentPrompt(issue, {
		...settings,
		authToken: "shhh"
	}, { planText: "Root cause\nFix plan", handoffPath: ".sentry-deck/handoff.json" });
	assert.match(prompt, /WEB-123/);
	assert.match(prompt, /https:\/\/sentry\.io\/issues\/123\//);
	assert.ok(!/shhh/.test(prompt), "should not include auth token");
	assert.match(prompt, /Seer plan:/);
	assert.match(prompt, /\.sentry-deck\/handoff\.json/);
});

test("writeHandoffFile writes expected shape without secrets and updates gitignore best-effort", async () => {
	const repo = await mkdtemp(join(tmpdir(), "repo-"));
	try {
		const path = await writeHandoffFile(repo, issue, {
			...settings,
			authToken: "topsecret"
		}, "Plan text");
		const json = JSON.parse(await readFile(path, "utf8"));
		assert.equal(json.organizationSlug, "acme");
		assert.equal(json.projectSlug, "web");
		assert.equal(json.issue.shortId, "WEB-123");
		assert.equal(json.issue.permalink, "https://sentry.io/issues/123/");
		assert.equal(json.planText, "Plan text");
		// No token should be present.
		assert.ok(!JSON.stringify(json).includes("topsecret"));
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});

