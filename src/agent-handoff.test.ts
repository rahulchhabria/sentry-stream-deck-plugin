import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildAgentCommand,
	buildAgentPrompt,
	launchAgent,
	launchInTerminal,
	writeHandoffFile,
	type ProcessLauncher
} from "./agent-handoff";
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

test("buildAgentPrompt (short press) includes shortId and permalink but not token, and no draft PR ask", () => {
	const prompt = buildAgentPrompt(issue, {
		...settings,
		authToken: "shhh"
	}, { planText: "Root cause\nFix plan", handoffPath: ".sentry-deck/handoff.json", requestDraftPr: false });
	assert.match(prompt, /WEB-123/);
	assert.match(prompt, /https:\/\/sentry\.io\/issues\/123\//);
	assert.ok(!/shhh/.test(prompt), "should not include auth token");
	assert.match(prompt, /Seer plan:/);
	assert.match(prompt, /\.sentry-deck\/handoff\.json/);
	assert.ok(!/draft PR/i.test(prompt), "short press should not ask for draft PR");
});

test("buildAgentPrompt (long press) explicitly asks for a draft PR", () => {
	const prompt = buildAgentPrompt(issue, {
		...settings,
		authToken: "shhh"
	}, { requestDraftPr: true });
	assert.match(prompt, /draft PR/i);
});

test("writeHandoffFile writes expected shape without secrets outside the worktree", async () => {
	const repo = await mkdtemp(join(tmpdir(), "repo-"));
	try {
		await mkdir(join(repo, ".git"));
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
		assert.ok(path.startsWith(join(repo, ".git")));
		// No token should be present.
		assert.ok(!JSON.stringify(json).includes("topsecret"));
		await assert.rejects(access(join(repo, ".gitignore")));
	} finally {
		await rm(repo, { recursive: true, force: true });
	}
});

test("launchInTerminal targets Ghostty with a working directory and command", {
	skip: process.platform !== "darwin"
}, async () => {
	const calls: Array<{ executable: string; args: string[] }> = [];
	const launcher: ProcessLauncher = async (executable, args) => {
		calls.push({ executable, args });
	};
	await launchInTerminal(
		{ executable: "/opt/homebrew/bin/codex", args: ["fix WEB-123"] },
		"/work/repo",
		{ terminalKind: "ghostty" },
		launcher
	);
	assert.equal(calls[0]?.executable, "osascript");
	assert.match(calls[0]?.args.join(" ") ?? "", /Ghostty/);
	assert.match(calls[0]?.args.join(" ") ?? "", /\/work\/repo/);
	assert.match(calls[0]?.args.join(" ") ?? "", /codex/);
});

test("Codex Desktop launch copies the prompt and opens the repository", async () => {
	const calls: Array<{ executable: string; args: string[] }> = [];
	let clipboard = "";
	const result = await launchAgent(
		{ executable: "/opt/homebrew/bin/codex", args: ["fix WEB-123"] },
		"/work/repo",
		{ agentKind: "codex", agentLaunchMode: "codex-desktop" },
		async (executable, args) => { calls.push({ executable, args }); },
		async (text) => { clipboard = text; }
	);
	assert.equal(clipboard, "fix WEB-123");
	assert.deepEqual(calls[0], {
		executable: "/opt/homebrew/bin/codex",
		args: ["app", "/work/repo"]
	});
	assert.equal(result.requiresPromptPaste, true);
});

test("Codex Desktop infers Codex from an absolute CLI path", async () => {
	const launches: Array<{ executable: string; args: string[] }> = [];
	await launchAgent(
		{ executable: "/opt/homebrew/bin/codex", args: ["prompt"] },
		process.cwd(),
		{ agentLaunchMode: "codex-desktop" },
		async (executable, args) => { launches.push({ executable, args }); },
		async () => {}
	);
	assert.deepEqual(launches, [{
		executable: "/opt/homebrew/bin/codex",
		args: ["app", process.cwd()]
	}]);
});
