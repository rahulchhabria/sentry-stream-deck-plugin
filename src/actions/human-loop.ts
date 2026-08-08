import streamDeck, {
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
import { getProjectIssuesUrl } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";

/**
 * Safe fallback for the human-in-the-loop action.
 *
 * The undocumented Autofix endpoint was not verifiable during the capability
 * probe, so this action intentionally uses only the documented Issues API and
 * opens the selected issue in Sentry for review.
 */
@action({ UUID: "com.rahulchhabria.sentry-human-loop.review-issue" })
export class SelectedIssue extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();

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
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (issue) {
			await streamDeck.system.openUrl(issue.permalink);
			return;
		}

		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await ev.action.showAlert();
			return;
		}

		await streamDeck.system.openUrl(getProjectIssuesUrl(settings));
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		if (snapshot.source.status === "unconfigured") {
			await Promise.all([
				key.setTitle("SETUP"),
				key.setImage(createKeyImage({
					background: "#201a2c",
					accent: "#8b7aa8",
					label: "CONFIG"
				}))
			]);
			return;
		}

		if (snapshot.source.status === "error") {
			const isAuth = snapshot.source.statusCode === 401 || snapshot.source.statusCode === 403;
			const isRate = snapshot.source.statusCode === 429;
			await Promise.all([
				key.setTitle(isAuth ? "AUTH" : isRate ? "RATE" : "API ERR"),
				key.setImage(createKeyImage({
					background: "#2c1d08",
					accent: "#f59e0b",
					label: isAuth ? "CHECK KEY" : isRate ? "SLOW DOWN" : "RETRY"
				}))
			]);
			return;
		}

		const issue = snapshot.selectedIssue;
		if (!issue) {
			await Promise.all([
				key.setTitle("NONE"),
				key.setImage(createKeyImage({
					background: "#101d2b",
					accent: "#60a5fa",
					label: "NO REVIEW"
				}))
			]);
			return;
		}

		await Promise.all([
			key.setTitle(
				snapshot.source.status === "stale"
					? snapshot.source.statusCode === 429 ? "RATE" : "STALE"
					: ""
			),
			key.setImage(createKeyImage({
				background: "#21113d",
				accent: "#a78bfa",
				label: issue.shortId
			}))
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}
