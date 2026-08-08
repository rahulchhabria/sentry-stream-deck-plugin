import streamDeck from "@elgato/streamdeck";

import { runSentryPlan } from "./sentry-plan-runner";
import type { SentryIssue } from "./sentry-api";
import type { SentrySettings } from "./settings";

export type SentryPlanStatus =
	| { status: "idle" }
	| { status: "running"; issueId: string }
	| { status: "ready"; issueId: string; output: string }
	| { status: "error"; issueId: string; message: string };

type Subscriber = (status: SentryPlanStatus) => void | Promise<void>;

class SentryPlanManager {
	private readonly subscribers = new Set<Subscriber>();
	private current: SentryPlanStatus = { status: "idle" };

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		this.notify(subscriber, this.current);
		return () => this.subscribers.delete(subscriber);
	}

	getStatus(): SentryPlanStatus {
		return this.current;
	}

	async start(issue: SentryIssue, settings: SentrySettings): Promise<void> {
		if (this.current.status === "running") {
			return;
		}

		this.publish({ status: "running", issueId: issue.id });
		try {
			const output = await runSentryPlan({
				executable: settings.sentryCliPath?.trim() || "sentry",
				repositoryPath: settings.repositoryPath?.trim() || "",
				organizationSlug: settings.organizationSlug?.trim() || "",
				issueShortId: issue.shortId
			});
			this.publish({ status: "ready", issueId: issue.id, output });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Sentry plan failed: ${message}`);
			this.publish({ status: "error", issueId: issue.id, message });
		}
	}

	private publish(status: SentryPlanStatus): void {
		this.current = status;
		for (const subscriber of this.subscribers) {
			this.notify(subscriber, status);
		}
	}

	private notify(subscriber: Subscriber, status: SentryPlanStatus): void {
		Promise.resolve(subscriber(status)).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Sentry plan status update failed: ${message}`);
		});
	}
}

export const sentryPlanManager = new SentryPlanManager();
