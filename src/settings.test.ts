import assert from "node:assert/strict";
import { test } from "node:test";

import {
	DEFAULT_SENTRY_URL,
	getSentryBaseUrl,
	hasRequiredSettings,
	SentrySettingsError
} from "./settings";

test("getSentryBaseUrl defaults to sentry.io when unset or blank", () => {
	assert.equal(getSentryBaseUrl({}), DEFAULT_SENTRY_URL);
	assert.equal(getSentryBaseUrl({ sentryUrl: "   " }), DEFAULT_SENTRY_URL);
});

test("getSentryBaseUrl supports EU and self-hosted hosts", () => {
	assert.equal(getSentryBaseUrl({ sentryUrl: "https://de.sentry.io" }), "https://de.sentry.io");
	assert.equal(getSentryBaseUrl({ sentryUrl: "https://sentry.acme.internal" }), "https://sentry.acme.internal");
});

test("getSentryBaseUrl normalises to the origin, dropping paths and trailing slashes", () => {
	assert.equal(getSentryBaseUrl({ sentryUrl: "https://sentry.io/" }), "https://sentry.io");
	assert.equal(getSentryBaseUrl({ sentryUrl: "https://sentry.io/some/path" }), "https://sentry.io");
});

test("getSentryBaseUrl fails closed for invalid, insecure, or non-http(s) URLs", () => {
	for (const sentryUrl of ["not a url", "ftp://sentry.io", "javascript:alert(1)", "http://sentry.example.com"]) {
		assert.throws(() => getSentryBaseUrl({ sentryUrl }), SentrySettingsError);
	}
	assert.equal(getSentryBaseUrl({ sentryUrl: "http://localhost:9000" }), "http://localhost:9000");
	assert.equal(getSentryBaseUrl({ sentryUrl: "http://127.0.0.1:9000" }), "http://127.0.0.1:9000");
});

test("hasRequiredSettings requires token, org and project (whitespace ignored)", () => {
	assert.equal(hasRequiredSettings({}), false);
	assert.equal(hasRequiredSettings({ authToken: "t", organizationSlug: "o" }), false);
	assert.equal(
		hasRequiredSettings({ authToken: " ", organizationSlug: "o", projectSlug: "p" }),
		false
	);
	assert.equal(
		hasRequiredSettings({ authToken: "t", organizationSlug: "o", projectSlug: "p" }),
		true
	);
});
