import type { SentryIssue } from "./sentry-api";

/**
 * Tracks which Sentry issues have already been observed so that only genuinely
 * new issues trigger an alert.
 *
 * The first {@link observe} after construction or {@link reset} establishes a
 * baseline and reports no new issues — the existing backlog should not flash.
 * Subsequent observations report any issue id not seen before.
 */
export class NewIssueTracker {
	private readonly seenIssueIds = new Set<string>();
	private baselineEstablished = false;

	/**
	 * Records the current issues and returns the ones not seen since the last
	 * baseline. Returns an empty array on the first call after a reset.
	 */
	observe(issues: SentryIssue[]): SentryIssue[] {
		const newIssues = this.baselineEstablished
			? issues.filter((issue) => !this.seenIssueIds.has(issue.id))
			: [];

		for (const issue of issues) {
			this.seenIssueIds.add(issue.id);
		}
		this.baselineEstablished = true;

		return newIssues;
	}

	/** Clears all observed state so the next {@link observe} re-baselines. */
	reset(): void {
		this.seenIssueIds.clear();
		this.baselineEstablished = false;
	}
}
