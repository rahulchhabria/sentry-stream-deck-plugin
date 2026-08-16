import { getSentryBaseUrl, type ConfiguredSentrySettings } from "./settings";

const MAX_FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

export type SentryIssue = {
	id: string;
	shortId: string;
	title: string;
	permalink: string;
	status: string;
	lastSeen?: string;
	firstSeen?: string;
	/** Number of unique users affected (when available). */
	userCount?: number;
	/** Total event count as a number (when available). */
	count?: number;
	/** Best-effort unhandled/regression hint (when available). */
	isUnhandled?: boolean;
};

export type IssuePage = {
	issues: SentryIssue[];
	/** True when the project has more unresolved issues than the fetched page. */
	hasMore: boolean;
};

/**
 * Minimal shape of a Sentry event body for stack parsing.
 * Only the fields needed to locate a likely culprit file are included.
 */
export type SentryEventFrame = {
	filename?: string;
	absPath?: string;
	lineno?: number;
	inApp?: boolean;
};

type RawSentryEventFrame = {
	filename?: string;
	abs_path?: string;
	absPath?: string;
	in_app?: boolean;
	inApp?: boolean;
	lineno?: number;
	lineNo?: number;
};

type RawExceptionValue = {
	stacktrace?: { frames?: RawSentryEventFrame[] };
};

export type SentryEvent = {
	id?: string;
	title?: string;
	platform?: string;
	logentry?: { formatted?: string };
	exception?: {
		values?: RawExceptionValue[];
	};
	/** Sentry's issue-event API returns exception data in this entry list. */
	entries?: Array<{
		type?: string;
		data?: { values?: RawExceptionValue[] };
	}>;
};

/** Normalizes envelope-style and issue-event API stack frame field names. */
export function getEventFrames(event: SentryEvent | undefined): SentryEventFrame[] {
	if (!event) {
		return [];
	}
	const values = [
		...(event.exception?.values ?? []),
		...(event.entries ?? [])
			.filter((entry) => entry.type?.toLowerCase() === "exception")
			.flatMap((entry) => entry.data?.values ?? [])
	];
	return values.flatMap((value) => value.stacktrace?.frames ?? []).map((frame) => ({
		filename: frame.filename,
		absPath: frame.absPath ?? frame.abs_path,
		lineno: frame.lineNo ?? frame.lineno,
		inApp: frame.inApp ?? frame.in_app
	}));
}

export class SentryApiError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		options?: ErrorOptions
	) {
		super(message, options);
		this.name = "SentryApiError";
	}
}

/**
 * Fetches the first page of unresolved issues (most recent first). Only a single
 * page is requested — the poller needs the latest issues and a count, not the
 * entire backlog, so walking every page on each 15s poll is avoided.
 */
export async function getUnresolvedIssues(
	settings: ConfiguredSentrySettings
): Promise<IssuePage> {
	const base = getSentryBaseUrl(settings);
	const organization = encodeURIComponent(settings.organizationSlug.trim());
	const project = encodeURIComponent(settings.projectSlug.trim());
	const query = new URLSearchParams({
		query: "is:unresolved",
		// Sort by last seen; actions may reorder for pain-based navigation.
		sort: "date",
		limit: "100"
	});
	const url = `${base}/api/0/projects/${organization}/${project}/issues/?${query}`;

	const response = await fetchIssuePage(url, settings.authToken);
	const data: unknown = await response.json();
	if (!Array.isArray(data)) {
		throw new SentryApiError("Sentry Issues API returned an unexpected response");
	}

	return {
		issues: parseIssues(data),
		hasMore: hasNextPage(response.headers.get("link"))
	};
}

async function fetchIssuePage(url: string, authToken: string): Promise<Response> {
	for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(url, {
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${authToken.trim()}`
				},
				signal: AbortSignal.timeout(10_000)
			});
		} catch (error) {
			if (attempt < MAX_FETCH_ATTEMPTS) {
				await delay(RETRY_DELAY_MS);
				continue;
			}
			throw new SentryApiError(
				describeRequestFailure(error),
				undefined,
				{ cause: error }
			);
		}

		if (response.ok) {
			return response;
		}

		if (response.status >= 500 && attempt < MAX_FETCH_ATTEMPTS) {
			await delay(RETRY_DELAY_MS);
			continue;
		}

		throw new SentryApiError(
			`Sentry Issues API returned HTTP ${response.status}`,
			response.status
		);
	}

	throw new SentryApiError("Sentry Issues API retry limit reached");
}

function describeRequestFailure(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const cause = error instanceof Error ? error.cause : undefined;
	if (!isRecord(cause)) {
		return `Sentry Issues API request failed: ${message}`;
	}

	const causeMessage = asString(cause.message);
	const causeCode = asString(cause.code);
	const details = [causeCode, causeMessage]
		.filter((value): value is string => Boolean(value))
		.join(": ");
	return `Sentry Issues API request failed: ${message}${details ? ` (${details})` : ""}`;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseIssues(data: unknown[]): SentryIssue[] {
	return data.flatMap((value): SentryIssue[] => {
		if (!isRecord(value)) {
			return [];
		}

		const id = asString(value.id);
		const shortId = asString(value.shortId);
		const title = asString(value.title);
		const permalink = asString(value.permalink);
		const status = asString(value.status);
		if (!id || !shortId || !title || !permalink || !status) {
			return [];
		}

		// Keep only finite numerics for stability.
		const userCount = typeof value.userCount === "number" && Number.isFinite(value.userCount)
			? value.userCount : undefined;
		// API returns count as a string; coerce and keep only finite values.
		const rawCount = typeof value.count === "string" ? Number(value.count) : undefined;
		const count = typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : undefined;
		const isUnhandled = typeof value.isUnhandled === "boolean" ? value.isUnhandled : undefined;
		const firstSeen = asString(value.firstSeen);

		return [{
			id,
			shortId,
			title,
			permalink,
			status,
			lastSeen: asString(value.lastSeen),
			firstSeen,
			userCount,
			count,
			isUnhandled
		}];
	});
}

/** Detects whether Sentry's `Link` header advertises a further page of results. */
function hasNextPage(linkHeader: string | null): boolean {
	if (!linkHeader) {
		return false;
	}

	return linkHeader
		.split(",")
		.some((link) => /\brel="next"/.test(link) && /\bresults="true"/.test(link));
}

export function getProjectIssuesUrl(settings: ConfiguredSentrySettings): string {
	const base = getSentryBaseUrl(settings);
	const organization = encodeURIComponent(settings.organizationSlug.trim());
	const query = encodeURIComponent(
		`is:unresolved project:${settings.projectSlug.trim()}`
	);
	return `${base}/organizations/${organization}/issues/?query=${query}`;
}

/**
 * Retrieves the latest event for an issue, including (when available) full
 * stacktrace frames. Best-effort: callers should gracefully handle missing data.
 */
export async function getLatestIssueEvent(
	settings: ConfiguredSentrySettings,
	issueId: string
): Promise<SentryEvent | undefined> {
	const base = getSentryBaseUrl(settings);
	const organization = encodeURIComponent(settings.organizationSlug.trim());
	const url = `${base}/api/0/organizations/${organization}/issues/${encodeURIComponent(issueId)}/events/latest/`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${settings.authToken.trim()}`
		},
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		throw new SentryApiError(`Sentry Issue Event API returned HTTP ${response.status}`, response.status);
	}
	const body: unknown = await response.json();
	if (!isRecord(body)) {
		return undefined;
	}
	return body as SentryEvent;
}

/**
 * Updates the status of an issue (resolve/archive). Requires an auth token with
 * event:write (or stronger). Uses the group id from SentryIssue.id.
 */
export async function updateIssueStatus(
	settings: ConfiguredSentrySettings,
	issueId: string,
	status: "resolved" | "ignored"
): Promise<void> {
	const base = getSentryBaseUrl(settings);
	const url = `${base}/api/0/issues/${encodeURIComponent(issueId)}/`;
	const response = await fetch(url, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			Authorization: `Bearer ${settings.authToken.trim()}`
		},
		body: JSON.stringify({ status }),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		throw new SentryApiError(`Sentry Update Issue API returned HTTP ${response.status}`, response.status);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
