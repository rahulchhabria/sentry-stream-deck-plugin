import {
	action,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createKeyImage } from "../key-visual";

const NEXT_IMAGE = createKeyImage({
	background: "#151b2d",
	accent: "#60a5fa",
	label: "NEXT"
});
const EMPTY_IMAGE = createKeyImage({
	background: "#17191d",
	accent: "#60646c",
	label: "NO ISSUE"
});

abstract class IssueNavigationAction extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();

	constructor(
		private readonly direction: "previous" | "next",
		private readonly image: string
	) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscription(ev.action.id);
		const unsubscribe = issueSelectionStore.subscribe(
			(snapshot) => this.render(ev.action as KeyAction, snapshot)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const snapshot = issueSelectionStore.getSnapshot();
		if (!snapshot.selectedIssue || snapshot.issueCount < 2) {
			await ev.action.showAlert();
			return;
		}

		if (this.direction === "previous") {
			issueSelectionStore.previous();
		} else {
			issueSelectionStore.next();
		}
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		const hasIssue = Boolean(snapshot.selectedIssue);
		const position = hasIssue
			? `${snapshot.selectedIndex + 1}/${snapshot.issueCount}${
				(snapshot.source.status === "ready" || snapshot.source.status === "stale")
					&& snapshot.source.hasMore ? "+" : ""
			}${snapshot.source.status === "stale" ? "!" : ""}`
			: snapshot.source.status === "stale" ? "STALE" : "";
		await Promise.all([
			key.setTitle(position),
			key.setImage(hasIssue ? this.image : EMPTY_IMAGE)
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}

@action({ UUID: "com.rahulchhabria.sentry-human-loop.next-issue" })
export class NextIssue extends IssueNavigationAction {
	constructor() {
		super("next", NEXT_IMAGE);
	}
}
