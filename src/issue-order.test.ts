import assert from "node:assert/strict";
import { test } from "node:test";

import { sortIssuesByPain } from "./issue-order";
import type { SentryIssue } from "./sentry-api";

const mk = (id: string, fields: Partial<SentryIssue> = {}): SentryIssue => ({
	id,
	shortId: `WEB-${id}`,
	title: `Issue ${id}`,
	permalink: `https://sentry.io/issues/${id}/`,
	status: "unresolved",
	...fields
});

test("sorts by userCount, then count, then recency", () => {
	const issues: SentryIssue[] = [
		mk("1", { userCount: 5, count: 50, lastSeen: "2026-07-10T00:00:00Z" }),
		mk("2", { userCount: 10, count: 20, lastSeen: "2026-07-11T00:00:00Z" }),
		mk("3", { userCount: 5, count: 100, lastSeen: "2026-07-09T00:00:00Z" }),
		mk("4", { userCount: 5, count: 100, lastSeen: "2026-07-12T00:00:00Z" })
	];
	const sorted = sortIssuesByPain(issues);
	// Highest users first: 2
	// Then highest count among equal users: 4 (100, newer than 3), then 3, then 1
	assert.deepEqual(sorted.map((i) => i.id), ["2", "4", "3", "1"]);
});

