import type { IssueSnapshot } from "./issue-poller";
import type { SentryIssue } from "./sentry-api";
import { sortIssuesByPain } from "./issue-order";

export type IssueSelectionSnapshot = {
	source: IssueSnapshot;
	selectedIssue?: SentryIssue;
	selectedIndex: number;
	issueCount: number;
};

/** Keeps one stable selection as refreshed issue snapshots change underneath it. */
export class IssueSelection {
	private source: IssueSnapshot = { status: "unconfigured", issues: [] };
	private selectedIssueId?: string;
	/** Cached, pain-ordered view of the current source issues. */
	private orderedIssues: SentryIssue[] = [];

	observe(source: IssueSnapshot): IssueSelectionSnapshot {
		this.source = source;
		// A stale snapshot contains the last successful queue, so navigation and
		// exact-issue actions remain usable during a transient refresh failure.
		// Unconfigured and hard-error snapshots do not expose an old selection.
		if (source.status !== "ready" && source.status !== "stale") {
			return this.snapshot();
		}
		if (source.status === "ready" && source.issues.length === 0) {
			this.selectedIssueId = undefined;
			this.orderedIssues = [];
			return this.snapshot();
		}

		// Recompute pain-ordered view each time the source changes.
		this.orderedIssues = sortIssuesByPain(source.issues);

		const selectionStillExists = this.orderedIssues.some(
			(issue) => issue.id === this.selectedIssueId
		);
		if (!selectionStillExists) {
			this.selectedIssueId = this.orderedIssues[0].id;
		}
		return this.snapshot();
	}

	select(issueId: string): IssueSelectionSnapshot {
		if ((this.source.status === "ready" || this.source.status === "stale")
			&& this.source.issues.some((issue) => issue.id === issueId)) {
			this.selectedIssueId = issueId;
		}
		return this.snapshot();
	}

	previous(): IssueSelectionSnapshot {
		return this.move(-1);
	}

	next(): IssueSelectionSnapshot {
		return this.move(1);
	}

	snapshot(): IssueSelectionSnapshot {
		const issues = (this.source.status === "ready" || this.source.status === "stale")
			? this.orderedIssues
			: [];
		const selectedIndex = issues.findIndex((issue) => issue.id === this.selectedIssueId);
		return {
			source: this.source,
			selectedIssue: selectedIndex >= 0 ? issues[selectedIndex] : undefined,
			selectedIndex,
			issueCount: issues.length
		};
	}

	private move(delta: -1 | 1): IssueSelectionSnapshot {
		if ((this.source.status !== "ready" && this.source.status !== "stale")
			|| this.orderedIssues.length === 0) {
			return this.snapshot();
		}

		const currentIndex = this.orderedIssues.findIndex(
			(issue) => issue.id === this.selectedIssueId
		);
		const startIndex = currentIndex >= 0 ? currentIndex : 0;
		const nextIndex = (
			startIndex + delta + this.orderedIssues.length
		) % this.orderedIssues.length;
		this.selectedIssueId = this.orderedIssues[nextIndex].id;
		return this.snapshot();
	}
}
