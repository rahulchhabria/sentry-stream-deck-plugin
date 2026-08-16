import assert from "node:assert/strict";
import { test } from "node:test";

import { IssuePoller } from "./issue-poller";
import { SentryApiError, type SentryIssue } from "./sentry-api";
import type { SentrySettings } from "./settings";

const configured: SentrySettings = {
	authToken: "token",
	organizationSlug: "acme",
	projectSlug: "web"
};

const issue = (id: string): SentryIssue => ({
	id,
	shortId: `WEB-${id}`,
	title: `Issue ${id}`,
	permalink: `https://sentry.io/issues/${id}/`,
	status: "unresolved"
});

test("IssuePoller baselines the first page and reports later new issues", async () => {
	let page = [issue("1")];
	const poller = new IssuePoller({
		getSettings: async () => configured,
		getIssues: async () => ({ issues: page, hasMore: false }),
		onSettings: () => {},
		logError: () => {}
	});
	await poller.refreshNow();
	assert.deepEqual(poller.getSnapshot(), {
		status: "ready",
		issues: [issue("1")],
		newIssues: [],
		hasMore: false
	});
	page = [issue("2"), issue("1")];
	await poller.refreshNow();
	const snapshot = poller.getSnapshot();
	assert.equal(snapshot.status, "ready");
	assert.deepEqual(snapshot.status === "ready" ? snapshot.newIssues.map(({ id }) => id) : [], ["2"]);
});

test("IssuePoller retains a stale page for transient failures but not configuration errors", async () => {
	let settings: SentrySettings = configured;
	let fail = false;
	const poller = new IssuePoller({
		getSettings: async () => settings,
		getIssues: async () => {
			if (fail) throw new SentryApiError("temporary", 503);
			return { issues: [issue("1")], hasMore: true };
		},
		onSettings: () => {},
		logError: () => {}
	});
	await poller.refreshNow();
	fail = true;
	await poller.refreshNow();
	assert.equal(poller.getSnapshot().status, "stale");

	settings = { ...configured, sentryUrl: "not a url" };
	await poller.refreshNow();
	assert.equal(poller.getSnapshot().status, "unconfigured");
});

test("IssuePoller immediately hides the old target when global settings change", async () => {
	let settingsListener: ((settings: SentrySettings) => void) | undefined;
	const poller = new IssuePoller({
		getSettings: async () => configured,
		getIssues: async () => ({ issues: [issue("1")], hasMore: false }),
		onSettings: (listener) => { settingsListener = listener; },
		logError: () => {}
	});
	await poller.refreshNow();
	assert.equal(poller.getSnapshot().status, "ready");
	settingsListener?.({ ...configured, projectSlug: "other" });
	assert.deepEqual(poller.getSnapshot(), { status: "unconfigured", issues: [] });
});
