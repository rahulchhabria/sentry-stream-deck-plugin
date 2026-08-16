import assert from "node:assert/strict";
import { test } from "node:test";

import type { IssueSnapshot } from "./issue-poller";
import type { SentryIssue } from "./sentry-api";
import { pulseMuteStore } from "./pulse-mute";
import { mergePendingIssues, takePendingIssue } from "./actions/error-pulse";

const mk = (id: string): SentryIssue => ({
	id,
	shortId: `WEB-${id}`,
	title: `Issue ${id}`,
	permalink: `https://sentry.io/issues/${id}/`,
	status: "unresolved"
});

function pickNewestNewIssue(snapshot: IssueSnapshot | undefined): SentryIssue | undefined {
	if (!snapshot || snapshot.status === "unconfigured" || snapshot.status === "error") {
		return undefined;
	}
	const newSet = new Set(snapshot.newIssues.map((i) => i.id));
	return snapshot.issues.find((i) => newSet.has(i.id));
}

test("Pulse selects the newest of the new issues instead of issues[0]", () => {
	const issues = [mk("3"), mk("2"), mk("1")];
	const snapshot: IssueSnapshot = {
		status: "ready",
		issues,
		newIssues: [mk("1")], // only 1 is newly arrived this poll
		hasMore: false
	};
	assert.equal(pickNewestNewIssue(snapshot)?.id, "1");
});

test("Pulse retains the exact alert-causing issue across later polls", () => {
	const alertSnapshot: IssueSnapshot = {
		status: "ready",
		issues: [mk("3"), mk("2"), mk("1")],
		newIssues: [mk("1")],
		hasMore: false
	};
	const laterSnapshot: IssueSnapshot = {
		status: "ready",
		issues: [mk("4"), mk("3"), mk("2"), mk("1")],
		newIssues: [],
		hasMore: false
	};
	const pending = mergePendingIssues([], alertSnapshot);
	assert.equal(pending[0]?.id, "1");
	assert.equal(mergePendingIssues(pending, laterSnapshot)[0]?.id, "1");
});

test("Pulse consumes one pending issue at a time and keeps the rest alerting", () => {
	const pending = [mk("3"), mk("2"), mk("1")];
	const first = takePendingIssue(pending);
	assert.equal(first.issue?.id, "3");
	assert.deepEqual(first.remaining.map((issue) => issue.id), ["2", "1"]);
	const second = takePendingIssue(first.remaining);
	assert.equal(second.issue?.id, "2");
	assert.deepEqual(second.remaining.map((issue) => issue.id), ["1"]);
});

test("Pulse drops pending issues that are no longer unresolved", () => {
	const pending = [mk("2"), mk("1")];
	const snapshot: IssueSnapshot = {
		status: "ready",
		issues: [mk("1")],
		newIssues: [],
		hasMore: false
	};
	assert.deepEqual(mergePendingIssues(pending, snapshot).map((issue) => issue.id), ["1"]);
});

test("mute store toggles and notifies", async () => {
	const state = pulseMuteStore.isMuted();
	let notified: boolean | undefined;
	const unsub = pulseMuteStore.subscribe((m) => { notified = m; });
	try {
		pulseMuteStore.toggle();
		assert.equal(pulseMuteStore.isMuted(), !state);
		// Give the async notify a turn
		await new Promise((r) => setTimeout(r, 0));
		assert.equal(notified, pulseMuteStore.isMuted());
	} finally {
		unsub();
		// Reset
		pulseMuteStore.set(false);
	}
});
