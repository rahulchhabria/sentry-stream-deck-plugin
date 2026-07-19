import { getSentryBaseUrl, type ConfiguredSentrySettings } from "./settings";

export type SentryIssue = {
	id: string;
	shortId: string;
	title: string;
	permalink: string;
	status: string;
	lastSeen?: string;
};

export type IssuePage = {
	issues: SentryIssue[];
	/** True when the project has more unresolved issues than the fetched page. */
	hasMore: boolean;
};

export class SentryApiError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
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
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${authToken.trim()}`
		},
		signal: AbortSignal.timeout(10_000)
	});

	if (!response.ok) {
		throw new SentryApiError(
			`Sentry Issues API returned HTTP ${response.status}`,
			response.status
		);
	}

	return response;
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

		return [{
			id,
			shortId,
			title,
			permalink,
			status,
			lastSeen: asString(value.lastSeen)
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
