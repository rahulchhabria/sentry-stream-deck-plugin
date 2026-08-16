import assert from "node:assert/strict";
import { test } from "node:test";

import { detectPrStatus, type GhRunner } from "./pr-status";

const repo = "/work/repo";

function runnerSequence(responses: string[]): GhRunner {
	const seq = [...responses];
	return async (_exe, args) => {
		const sub = args.slice(0, 3).join(" ");
		if (sub.includes("pr list")) {
			return { stdout: seq.shift() ?? "[]" };
		}
		if (sub.includes("pr view")) {
			return { stdout: seq.shift() ?? "{}" };
		}
		return { stdout: "" };
	};
}

test("detectPrStatus returns none when no PR found", async () => {
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence(["[]"]));
	assert.equal(status.state, "none");
});

test("detectPrStatus returns draft when isDraft", async () => {
	const list = JSON.stringify([{ number: 5, title: "Fix WEB-123", url: "https://x/p/5", isDraft: true }]);
	const view = JSON.stringify({ isDraft: true, url: "https://x/p/5" });
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "draft");
	assert.equal(status.url, "https://x/p/5");
});

test("detectPrStatus returns merged when mergedAt set", async () => {
	const list = JSON.stringify([{ number: 7, title: "WEB-9 + WEB-123", url: "https://x/p/7", isDraft: false }]);
	const view = JSON.stringify({ mergedAt: "2026-01-01T00:00:00Z", url: "https://x/p/7" });
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "merged");
});

test("detectPrStatus returns fail when a check failed", async () => {
	const list = JSON.stringify([{ number: 9, title: "Fix: WEB-123", url: "https://x/p/9" }]);
	const view = JSON.stringify({ statusCheckRollup: [{ conclusion: "FAILURE" }], url: "https://x/p/9" });
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "fail");
});

test("detectPrStatus returns ci when checks pending", async () => {
	const list = JSON.stringify([{ number: 3, title: "Fix: WEB-123", url: "https://x/p/3" }]);
	const view = JSON.stringify({ statusCheckRollup: [{ state: "PENDING" }], url: "https://x/p/3" });
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "ci");
});

test("detectPrStatus returns ready when checks pass", async () => {
	const list = JSON.stringify([{ number: 4, title: "Fix WEB-123", url: "https://x/p/4" }]);
	const view = JSON.stringify({
		state: "OPEN",
		statusCheckRollup: [{ conclusion: "SUCCESS" }],
		url: "https://x/p/4"
	});
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "ready");
});

test("matches the exact issue id in title, body, or branch", async () => {
	const list = JSON.stringify([
		{ number: 1, title: "Fix WEB-1234", url: "https://x/p/1" },
		{ number: 2, title: "Fix crash", body: "Closes WEB-123.", url: "https://x/p/2" }
	]);
	const view = JSON.stringify({ isDraft: true, url: "https://x/p/2" });
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence([list, view]));
	assert.equal(status.state, "draft");
	assert.equal(status.url, "https://x/p/2");
});

test("reports GitHub CLI failures separately from no PR", async () => {
	const status = await detectPrStatus(repo, "WEB-123", async () => {
		throw new Error("gh auth required");
	});
	assert.equal(status.state, "error");
	assert.match(status.message ?? "", /auth required/);
});

test("uses the configured GitHub CLI path", async () => {
	let executable = "";
	const status = await detectPrStatus(repo, "WEB-123", async (received) => {
		executable = received;
		return { stdout: "[]" };
	}, "/custom/bin/gh");
	assert.equal(status.state, "none");
	assert.equal(executable, "/custom/bin/gh");
});
