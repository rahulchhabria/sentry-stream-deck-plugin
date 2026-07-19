import streamDeck, {
	action,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issuePoller, type IssueSnapshot } from "../issue-poller";
import { createKeyImage } from "../key-visual";
import { getProjectIssuesUrl, type SentryIssue } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";

/**
 * Safe fallback for the human-in-the-loop action.
 *
 * The undocumented Autofix endpoint was not verifiable during the capability
 * probe, so this action intentionally uses only the documented Issues API and
 * opens the selected issue in Sentry for review.
 */
@action({ UUID: "com.rahulchhabria.sentry-human-loop.review-issue" })
export class HumanLoop extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly issues = new Map<string, SentryIssue>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscription(ev.action.id);
		const unsubscribe = issuePoller.subscribe(
			(snapshot) => this.render(ev.action as KeyAction, snapshot)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.issues.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const issue = this.issues.get(ev.action.id);
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

	private async render(key: KeyAction, snapshot: IssueSnapshot): Promise<void> {
		if (snapshot.status === "unconfigured") {
			this.issues.delete(key.id);
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

		if (snapshot.status === "error") {
			this.issues.delete(key.id);
			const isAuth = snapshot.statusCode === 401 || snapshot.statusCode === 403;
			const isRate = snapshot.statusCode === 429;
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

		const [issue] = snapshot.issues;
		if (!issue) {
			this.issues.delete(key.id);
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

		this.issues.set(key.id, issue);
		await Promise.all([
			key.setTitle(issue.shortId),
			key.setImage(createKeyImage({
				background: "#21113d",
				accent: "#a78bfa",
				label: "REVIEW"
			}))
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}
