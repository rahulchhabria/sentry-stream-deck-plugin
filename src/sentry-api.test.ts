import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getProjectIssuesUrl, getUnresolvedIssues, SentryApiError } from "./sentry-api";
import type { ConfiguredSentrySettings } from "./settings";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = { url: string; init?: RequestInit };

/** Replaces global fetch with a stub and records the request it received. */
function stubFetch(response: Response): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return response;
	}) as typeof fetch;
	return { calls };
}

function stubFetchSequence(results: Array<Response | Error>): { calls: FetchCall[] } {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		const result = results.shift();
		if (!result) {
			throw new Error("Unexpected fetch call");
		}
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}) as typeof fetch;
	return { calls };
}

function settings(overrides: Partial<ConfiguredSentrySettings> = {}): ConfiguredSentrySettings {
	return {
		authToken: "sntrys_token",
		organizationSlug: "acme",
		projectSlug: "web",
		...overrides
	};
}

const rawIssue = {
	id: "1",
	shortId: "WEB-1",
	title: "Boom",
	permalink: "https://sentry.io/issues/1/",
	status: "unresolved",
	lastSeen: "2026-07-18T00:00:00Z"
};

test("requests the region-aware endpoint with a bearer token", async () => {
	const { calls } = stubFetch(new Response(JSON.stringify([rawIssue])));

	await getUnresolvedIssues(settings({ sentryUrl: "https://de.sentry.io" }));

	assert.equal(calls.length, 1);
	assert.ok(calls[0].url.startsWith("https://de.sentry.io/api/0/projects/acme/web/issues/"));
	assert.match(calls[0].url, /query=is%3Aunresolved/);
	const headers = new Headers(calls[0].init?.headers);
	assert.equal(headers.get("authorization"), "Bearer sntrys_token");
});

test("parses issues and drops malformed entries", async () => {
	stubFetch(new Response(JSON.stringify([rawIssue, { id: "2" }, "nope", null])));

	const { issues } = await getUnresolvedIssues(settings());

	assert.equal(issues.length, 1);
	assert.deepEqual(issues[0], {
		id: "1",
		shortId: "WEB-1",
		title: "Boom",
		permalink: "https://sentry.io/issues/1/",
		status: "unresolved",
		lastSeen: "2026-07-18T00:00:00Z",
		firstSeen: undefined,
		userCount: undefined,
		count: undefined,
		isUnhandled: undefined
	});
});

test("parseIssues keeps only finite userCount and count", async () => {
	const raw = {
		...rawIssue,
		userCount: Infinity,
		count: "NaN"
	};
	stubFetch(new Response(JSON.stringify([raw])));
	const { issues } = await getUnresolvedIssues(settings());
	assert.equal(issues[0]?.userCount, undefined);
	assert.equal(issues[0]?.count, undefined);
});

test("hasMore is true when the Link header advertises a next page", async () => {
	stubFetch(new Response(JSON.stringify([rawIssue]), {
		headers: {
			link: '<https://sentry.io/a>; rel="previous"; results="false", <https://sentry.io/b>; rel="next"; results="true"; cursor="x"'
		}
	}));

	assert.equal((await getUnresolvedIssues(settings())).hasMore, true);
});

test("hasMore is false when the next page has no results", async () => {
	stubFetch(new Response(JSON.stringify([rawIssue]), {
		headers: { link: '<https://sentry.io/b>; rel="next"; results="false"' }
	}));

	assert.equal((await getUnresolvedIssues(settings())).hasMore, false);
});

test("throws SentryApiError with the status on a failed response", async () => {
	const { calls } = stubFetch(new Response("nope", { status: 401 }));

	await assert.rejects(getUnresolvedIssues(settings()), (error: unknown) => {
		assert.ok(error instanceof SentryApiError);
		assert.equal(error.status, 401);
		return true;
	});
	assert.equal(calls.length, 1);
});

test("retries one transient server failure", async () => {
	const { calls } = stubFetchSequence([
		new Response("nope", { status: 502 }),
		new Response(JSON.stringify([rawIssue]))
	]);

	const { issues } = await getUnresolvedIssues(settings());
	assert.equal(issues[0]?.id, "1");
	assert.equal(calls.length, 2);
});

test("retries one network failure", async () => {
	const { calls } = stubFetchSequence([
		new TypeError("fetch failed"),
		new Response(JSON.stringify([rawIssue]))
	]);

	const { issues } = await getUnresolvedIssues(settings());
	assert.equal(issues[0]?.id, "1");
	assert.equal(calls.length, 2);
});

test("stops after the bounded retry limit", async () => {
	const { calls } = stubFetchSequence([
		new Response("nope", { status: 500 }),
		new Response("still nope", { status: 502 })
	]);

	await assert.rejects(getUnresolvedIssues(settings()), (error: unknown) => {
		assert.ok(error instanceof SentryApiError);
		assert.equal(error.status, 502);
		return true;
	});
	assert.equal(calls.length, 2);
});

test("throws when the body is not an array", async () => {
	stubFetch(new Response(JSON.stringify({ detail: "unexpected" })));

	await assert.rejects(getUnresolvedIssues(settings()), SentryApiError);
});

test("getProjectIssuesUrl builds a region-aware, project-filtered link", () => {
	assert.equal(
		getProjectIssuesUrl(settings({ sentryUrl: "https://de.sentry.io" })),
		"https://de.sentry.io/organizations/acme/issues/?query=is%3Aunresolved%20project%3Aweb"
	);
});
