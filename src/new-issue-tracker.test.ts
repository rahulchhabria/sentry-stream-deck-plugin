import assert from "node:assert/strict";
import { test } from "node:test";

import { NewIssueTracker } from "./new-issue-tracker";
import type { SentryIssue } from "./sentry-api";

function issue(id: string): SentryIssue {
	return {
		id,
		shortId: `SHORT-${id}`,
		title: `Issue ${id}`,
		permalink: `https://sentry.io/issues/${id}/`,
		status: "unresolved"
	};
}

test("first observation establishes a baseline and reports no new issues", () => {
	const tracker = new NewIssueTracker();
	assert.deepEqual(tracker.observe([issue("1"), issue("2")]), []);
});

test("reports only issues not seen since the baseline", () => {
	const tracker = new NewIssueTracker();
	tracker.observe([issue("1"), issue("2")]);

	const fresh = tracker.observe([issue("3"), issue("2"), issue("1")]);
	assert.deepEqual(fresh.map((i) => i.id), ["3"]);
});

test("does not re-report an issue once it has been observed", () => {
	const tracker = new NewIssueTracker();
	tracker.observe([issue("1")]);
	tracker.observe([issue("2")]); // 2 is new here

	// 2 is no longer new even though it is still present.
	assert.deepEqual(tracker.observe([issue("2")]), []);
});

test("an empty poll does not forget previously seen issues", () => {
	const tracker = new NewIssueTracker();
	tracker.observe([issue("1")]);
	tracker.observe([]);

	assert.deepEqual(tracker.observe([issue("1")]), []);
});

test("reset re-baselines so the existing backlog does not alert", () => {
	const tracker = new NewIssueTracker();
	tracker.observe([issue("1")]);

	tracker.reset();
	// First observation after reset is a fresh baseline.
	assert.deepEqual(tracker.observe([issue("1"), issue("2")]), []);
	// New arrivals after the new baseline are reported again.
	assert.deepEqual(tracker.observe([issue("3"), issue("1")]).map((i) => i.id), ["3"]);
});
