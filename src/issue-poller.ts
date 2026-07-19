import streamDeck from "@elgato/streamdeck";

import { NewIssueTracker } from "./new-issue-tracker";
import { getUnresolvedIssues, SentryApiError, type SentryIssue } from "./sentry-api";
import { getSentryBaseUrl, getSentrySettings, hasRequiredSettings } from "./settings";

const POLL_INTERVAL_MS = 15_000;

export type IssueSnapshot =
	| { status: "unconfigured"; issues: [] }
	| {
		status: "ready";
		issues: SentryIssue[];
		/**
		 * Issues seen for the first time since the last snapshot. Empty on the
		 * first successful load so the existing backlog does not trigger an alert.
		 */
		newIssues: SentryIssue[];
		/** True when the project has more unresolved issues than were fetched. */
		hasMore: boolean;
	}
	| { status: "error"; issues: []; message: string; statusCode?: number };

type Subscriber = (snapshot: IssueSnapshot) => void | Promise<void>;

class IssuePoller {
	private readonly subscribers = new Set<Subscriber>();
	private snapshot: IssueSnapshot = { status: "unconfigured", issues: [] };
	private timer?: ReturnType<typeof setInterval>;
	private refreshPromise?: Promise<void>;
	private refreshRequested = false;

	/** Detects genuinely new issues rather than re-alerting on the whole backlog. */
	private readonly newIssueTracker = new NewIssueTracker();
	/** Identifies the current Sentry target; changing it re-baselines detection. */
	private connectionKey?: string;

	constructor() {
		// Fires only on property-inspector updates (see useExperimentalMessageIdentifiers
		// in plugin.ts), so requesting settings during a refresh does not loop.
		streamDeck.settings.onDidReceiveGlobalSettings(() => {
			if (this.subscribers.size > 0) {
				void this.refresh(true);
			}
		});
	}

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		this.notify(subscriber, this.snapshot);

		if (!this.timer) {
			this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
		}
		void this.refresh();

		return () => {
			this.subscribers.delete(subscriber);
			if (this.subscribers.size === 0 && this.timer) {
				clearInterval(this.timer);
				this.timer = undefined;
			}
		};
	}

	private refresh(queueIfBusy = false): Promise<void> {
		if (this.refreshPromise) {
			this.refreshRequested ||= queueIfBusy;
			return this.refreshPromise;
		}

		this.refreshPromise = this.performRefresh().finally(() => {
			this.refreshPromise = undefined;
			if (this.refreshRequested && this.subscribers.size > 0) {
				this.refreshRequested = false;
				void this.refresh();
			}
		});
		return this.refreshPromise;
	}

	private async performRefresh(): Promise<void> {
		try {
			const settings = await getSentrySettings();
			if (!hasRequiredSettings(settings)) {
				this.resetBaseline(undefined);
				this.publish({ status: "unconfigured", issues: [] });
				return;
			}

			// Re-baseline when the target instance/org/project changes so we do
			// not carry a previous project's "seen" ids into a new one.
			const connectionKey = [
				getSentryBaseUrl(settings),
				settings.organizationSlug.trim(),
				settings.projectSlug.trim()
			].join("|");
			if (connectionKey !== this.connectionKey) {
				this.resetBaseline(connectionKey);
			}

			const { issues, hasMore } = await getUnresolvedIssues(settings);
			const newIssues = this.newIssueTracker.observe(issues);

			this.publish({ status: "ready", issues, newIssues, hasMore });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			const statusCode = error instanceof SentryApiError ? error.status : undefined;
			streamDeck.logger.error(`Shared Sentry issue refresh failed: ${message}`);
			this.publish({ status: "error", issues: [], message, statusCode });
		}
	}

	private resetBaseline(connectionKey: string | undefined): void {
		this.connectionKey = connectionKey;
		this.newIssueTracker.reset();
	}

	private publish(snapshot: IssueSnapshot): void {
		this.snapshot = snapshot;
		for (const subscriber of this.subscribers) {
			this.notify(subscriber, snapshot);
		}
	}

	private notify(subscriber: Subscriber, snapshot: IssueSnapshot): void {
		Promise.resolve(subscriber(snapshot)).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Issue subscriber update failed: ${message}`);
		});
	}
}

export const issuePoller = new IssuePoller();
