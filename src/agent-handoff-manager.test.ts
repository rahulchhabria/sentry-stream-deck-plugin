import assert from "node:assert/strict";
import { test } from "node:test";

import { agentHandoffManager } from "./agent-handoff-manager";
import type { SentryIssue } from "./sentry-api";

const issue: SentryIssue = {
	id: "1",
	shortId: "WEB-1",
	title: "Boom",
	permalink: "https://sentry.io/issues/1/",
	status: "unresolved"
};

test("reports error when repository path is missing", async () => {
	const statusChanges: string[] = [];
	const unsubscribe = agentHandoffManager.subscribe((s) => { statusChanges.push(s.status); });
	try {
		await agentHandoffManager.start(issue, {
			organizationSlug: "acme",
			projectSlug: "web",
			repositoryPath: " "
		});
		assert.equal(agentHandoffManager.getStatus().status, "error");
		// Should go straight to error; must not report a successful send.
		assert.ok(!statusChanges.includes("sent"));
		assert.ok(!statusChanges.includes("running"));
	} finally {
		unsubscribe();
	}
});

test("second start while running is a no-op (busy)", async () => {
	let launches = 0;
	let releaseLauncher = () => {};
	let reportLaunchStarted = () => {};
	const launcherBlocked = new Promise<void>((resolve) => { releaseLauncher = resolve; });
	const launchStarted = new Promise<void>((resolve) => { reportLaunchStarted = resolve; });
	const slowLauncher = async () => {
		launches += 1;
		reportLaunchStarted();
		await launcherBlocked;
	};
	const unsubscribe = agentHandoffManager.subscribe(() => {});
	let firstStart: Promise<void> | undefined;
	try {
		firstStart = agentHandoffManager.start(issue, {
			organizationSlug: "acme",
			projectSlug: "web",
			repositoryPath: "/repo",
			agentCliPath: "agent"
		}, undefined, slowLauncher);
		await launchStarted;
		await agentHandoffManager.start(issue, {
			organizationSlug: "acme",
			projectSlug: "web",
			repositoryPath: "/repo",
			agentCliPath: "agent"
		}, undefined, slowLauncher);
		assert.equal(launches, 1, "should not start a second launch while running");
	} finally {
		releaseLauncher();
		await firstStart;
		unsubscribe();
	}
});
