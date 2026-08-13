import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { updateIssueStatus, SentryApiError } from "./sentry-api";
import type { ConfiguredSentrySettings } from "./settings";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(response: Response): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return response;
	}) as typeof fetch;
	return { calls };
}

function settings(): ConfiguredSentrySettings {
	return {
		authToken: "token",
		organizationSlug: "acme",
		projectSlug: "web"
	};
}

test("updateIssueStatus PUTs the status to the group endpoint", async () => {
	const { calls } = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
	await updateIssueStatus(settings(), "123", "resolved");
	assert.equal(calls.length, 1);
	assert.match(calls[0].url, /\/api\/0\/issues\/123\/$/);
	const init = calls[0].init!;
	assert.equal(init.method, "PUT");
	const body = JSON.parse(String(init.body || "{}"));
	assert.equal(body.status, "resolved");
});

test("updateIssueStatus throws SentryApiError on failure", async () => {
	stubFetch(new Response("nope", { status: 403 }));
	await assert.rejects(updateIssueStatus(settings(), "123", "ignored"), (e) => {
		assert.ok(e instanceof SentryApiError);
		assert.equal(e.status, 403);
		return true;
	});
});

