import streamDeck from "@elgato/streamdeck";

import { issuePoller } from "./issue-poller";
import { IssueSelection, type IssueSelectionSnapshot } from "./issue-selection";

type Subscriber = (snapshot: IssueSelectionSnapshot) => void | Promise<void>;

class IssueSelectionStore {
	private readonly selection = new IssueSelection();
	private readonly subscribers = new Set<Subscriber>();
	private unsubscribeFromPoller?: () => void;

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		this.notify(subscriber, this.selection.snapshot());

		if (!this.unsubscribeFromPoller) {
			this.unsubscribeFromPoller = issuePoller.subscribe((snapshot) => {
				this.publish(this.selection.observe(snapshot));
			});
		}

		return () => {
			this.subscribers.delete(subscriber);
			if (this.subscribers.size === 0) {
				this.unsubscribeFromPoller?.();
				this.unsubscribeFromPoller = undefined;
			}
		};
	}

	select(issueId: string): void {
		this.publish(this.selection.select(issueId));
	}

	previous(): void {
		this.publish(this.selection.previous());
	}

	next(): void {
		this.publish(this.selection.next());
	}

	getSnapshot(): IssueSelectionSnapshot {
		return this.selection.snapshot();
	}

	private publish(snapshot: IssueSelectionSnapshot): void {
		for (const subscriber of this.subscribers) {
			this.notify(subscriber, snapshot);
		}
	}

	private notify(subscriber: Subscriber, snapshot: IssueSelectionSnapshot): void {
		Promise.resolve(subscriber(snapshot)).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Issue selection update failed: ${message}`);
		});
	}
}

export const issueSelectionStore = new IssueSelectionStore();
