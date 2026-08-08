import assert from "node:assert/strict";
import { test } from "node:test";

import { IssueSelection } from "./issue-selection";
import type { SentryIssue } from "./sentry-api";

function issue(id: string): SentryIssue {
	return {
		id,
		shortId: `WEB-${id}`,
		title: `Issue ${id}`,
		permalink: `https://sentry.io/issues/${id}/`,
		status: "unresolved"
	};
}

function ready(ids: string[]) {
	return {
		status: "ready" as const,
		issues: ids.map(issue),
		newIssues: [],
		hasMore: false
	};
}

test("selects the newest issue on the first ready snapshot", () => {
	const selection = new IssueSelection();
	const snapshot = selection.observe(ready(["3", "2", "1"]));
	assert.equal(snapshot.selectedIssue?.id, "3");
	assert.equal(snapshot.selectedIndex, 0);
});

test("retains the selected issue when refreshed ordering changes", () => {
	const selection = new IssueSelection();
	selection.observe(ready(["3", "2", "1"]));
	selection.next();

	const snapshot = selection.observe(ready(["4", "3", "2", "1"]));
	assert.equal(snapshot.selectedIssue?.id, "2");
	assert.equal(snapshot.selectedIndex, 2);
});

test("navigation wraps in both directions", () => {
	const selection = new IssueSelection();
	selection.observe(ready(["3", "2", "1"]));

	assert.equal(selection.previous().selectedIssue?.id, "1");
	assert.equal(selection.next().selectedIssue?.id, "3");
});

test("falls back to the newest issue when the selection disappears", () => {
	const selection = new IssueSelection();
	selection.observe(ready(["3", "2", "1"]));
	selection.select("2");

	assert.equal(selection.observe(ready(["4", "3", "1"])).selectedIssue?.id, "4");
});

test("keeps the selection navigable during a stale refresh and restores it after recovery", () => {
	const selection = new IssueSelection();
	selection.observe(ready(["2", "1"]));
	selection.select("1");

	const stale = selection.observe({
		status: "stale",
		issues: [issue("2"), issue("1")],
		newIssues: [],
		hasMore: false,
		message: "offline"
	});
	assert.equal(stale.selectedIssue?.id, "1");
	assert.equal(selection.previous().selectedIssue?.id, "2");
	assert.equal(selection.next().selectedIssue?.id, "1");
	assert.equal(selection.observe(ready(["3", "2", "1"])).selectedIssue?.id, "1");
});

test("does not expose an old selection during a hard API error", () => {
	const selection = new IssueSelection();
	selection.observe(ready(["2", "1"]));

	assert.equal(
		selection.observe({ status: "error", issues: [], message: "unauthorized", statusCode: 401 })
			.selectedIssue,
		undefined
	);
});
