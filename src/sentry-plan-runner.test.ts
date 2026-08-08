import assert from "node:assert/strict";
import { test } from "node:test";

import { runSentryPlan, type ProcessExecutor } from "./sentry-plan-runner";

test("runs a read-only plan for the exact issue id without a shell", async () => {
	let invocation: Parameters<ProcessExecutor> | undefined;
	const execute: ProcessExecutor = async (...args) => {
		invocation = args;
		return { stdout: "Root cause\nFix plan\n", stderr: "" };
	};

	const output = await runSentryPlan({
		executable: "/opt/bin/sentry",
		repositoryPath: "/work/repo",
		organizationSlug: "acme",
		issueShortId: "WEB-ABC"
	}, execute);

	assert.equal(output, "Root cause\nFix plan");
	assert.deepEqual(invocation?.[0], "/opt/bin/sentry");
	assert.deepEqual(invocation?.[1], ["issue", "plan", "acme/WEB-ABC"]);
	assert.equal(invocation?.[2].cwd, "/work/repo");
});

test("removes terminal escape sequences from plan output", async () => {
	const output = await runSentryPlan({
		executable: "sentry",
		repositoryPath: "/work/repo",
		organizationSlug: "acme",
		issueShortId: "WEB-ABC"
	}, async () => ({ stdout: "\u001b[32mReady\u001b[0m", stderr: "" }));

	assert.equal(output, "Ready");
});

test("rejects empty output", async () => {
	await assert.rejects(
		runSentryPlan({
			executable: "sentry",
			repositoryPath: "/work/repo",
			organizationSlug: "acme",
			issueShortId: "WEB-ABC"
		}, async () => ({ stdout: "", stderr: "no plan" })),
		/no plan/
	);
});

test("requires an explicit repository path", async () => {
	await assert.rejects(
		runSentryPlan({
			executable: "sentry",
			repositoryPath: " ",
			organizationSlug: "acme",
			issueShortId: "WEB-ABC"
		}),
		/missing required configuration/
	);
});
