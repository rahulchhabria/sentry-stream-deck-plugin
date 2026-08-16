import {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { LongPressAction } from "../long-press";

abstract class IssueNavigationAction extends LongPressAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly feedback = new Map<string, "NEXT" | "PREV">();
	private readonly feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		private readonly direction: "previous" | "next"
	) {
		super(700);
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
		this.stopFeedback(ev.action.id);
	}

	protected override async onShortPress(action: KeyAction): Promise<void> {
		await this.move(action, this.direction);
	}

	protected override async onLongPress(action: KeyAction): Promise<void> {
		await this.move(action, this.direction === "next" ? "previous" : "next");
	}

	private async move(action: KeyAction, direction: "previous" | "next"): Promise<void> {
		const snapshot = issueSelectionStore.getSnapshot();
		if (!snapshot.selectedIssue || snapshot.issueCount < 2) {
			streamDeck.logger.info(`Issue navigation unavailable: ${snapshot.issueCount} issue(s)`);
			await action.showAlert();
			return;
		}

		this.feedback.set(action.id, direction === "next" ? "NEXT" : "PREV");
		const next = direction === "previous"
			? issueSelectionStore.previous()
			: issueSelectionStore.next();
		streamDeck.logger.info(`Issue navigation selected ${next.selectedIssue?.shortId ?? "none"}`);
		this.stopFeedbackTimer(action.id);
		this.feedbackTimers.set(action.id, setTimeout(() => {
			this.feedback.delete(action.id);
			void this.render(action, issueSelectionStore.getSnapshot());
		}, 650));
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		const hasIssue = Boolean(snapshot.selectedIssue);
		const feedback = this.feedback.get(key.id);
		const position = hasIssue
			? `${snapshot.selectedIndex + 1}/${snapshot.issueCount}${
				(snapshot.source.status === "ready" || snapshot.source.status === "stale")
					&& snapshot.source.hasMore ? "+" : ""
			}${snapshot.source.status === "stale" ? "!" : ""}`
			: snapshot.source.status === "stale" ? "STALE" : "NEXT";
		await Promise.all([
			key.setTitle(""),
			key.setImage(createActionIcon("next", {
				color: hasIssue ? "#60a5fa" : "#60646c",
				dimmed: !hasIssue,
				glow: Boolean(feedback),
				label: feedback ?? (!hasIssue && snapshot.source.status === "stale" ? "STALE" : undefined),
				value: hasIssue ? position : undefined
			}))
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}

	private stopFeedbackTimer(actionId: string): void {
		const timer = this.feedbackTimers.get(actionId);
		if (timer) {
			clearTimeout(timer);
			this.feedbackTimers.delete(actionId);
		}
	}

	private stopFeedback(actionId: string): void {
		this.stopFeedbackTimer(actionId);
		this.feedback.delete(actionId);
	}
}

@action({ UUID: "com.rahulchhabria.sentry-human-loop.next-issue" })
export class NextIssue extends IssueNavigationAction {
	constructor() {
		super("next");
	}
}
