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

test("detectPrStatus returns sent when no PR found", async () => {
	const status = await detectPrStatus(repo, "WEB-123", runnerSequence(["[]"]));
	assert.equal(status.state, "sent");
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

