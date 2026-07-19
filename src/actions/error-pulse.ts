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

const FLASH_INTERVAL_MS = 600;
const ERROR_BRIGHT = createKeyImage({
	background: "#500918",
	accent: "#ff375f",
	label: "ERRORS"
});
const ERROR_DIM = createKeyImage({
	background: "#19080d",
	accent: "#7f1d35",
	label: "ERRORS"
});
// Steady (acknowledged) look: errors still present, but no longer flashing.
const ERROR_STEADY = createKeyImage({
	background: "#2a0c14",
	accent: "#b52c48",
	label: "ERRORS"
});

@action({ UUID: "com.rahulchhabria.sentry-human-loop.error-pulse" })
export class ErrorPulse extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly flashTimers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly latestIssues = new Map<string, SentryIssue>();
	/** Key ids currently alerting on an unacknowledged new issue. */
	private readonly alerting = new Set<string>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		const key = ev.action;
		this.stopSubscription(key.id);
		const unsubscribe = issuePoller.subscribe(
			(snapshot) => this.render(key, snapshot)
		);
		this.subscriptions.set(key.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.stopFlashing(ev.action.id);
		this.latestIssues.delete(ev.action.id);
		this.alerting.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		// Pressing the key acknowledges an active alert: stop flashing and settle
		// to the steady state before opening the issue.
		if (this.alerting.delete(ev.action.id)) {
			this.stopFlashing(ev.action.id);
			if (ev.action.isKey()) {
				await ev.action.setImage(ERROR_STEADY);
			}
		}

		const issue = this.latestIssues.get(ev.action.id);
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
			this.clearKeyState(key.id);
			await Promise.all([
				key.setTitle("SETUP"),
				key.setImage(createKeyImage({
					background: "#271a1c",
					accent: "#8b6f73",
					label: "CONFIG"
				}))
			]);
			return;
		}

		if (snapshot.status === "error") {
			this.clearKeyState(key.id);
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

		const issue = snapshot.issues[0];
		if (!issue) {
			this.clearKeyState(key.id);
			await Promise.all([
				key.setTitle("CLEAR"),
				key.setImage(createKeyImage({
					background: "#10241d",
					accent: "#34d399",
					label: "QUIET"
				}))
			]);
			return;
		}

		this.latestIssues.set(key.id, issue);
		if (snapshot.newIssues.length > 0) {
			this.alerting.add(key.id);
		}

		if (this.alerting.has(key.id)) {
			// Alerting: flash until the user acknowledges with a keypress. Do not
			// restart the timer on every poll, or the animation would stutter.
			this.ensureFlashing(key);
			await Promise.all([key.setTitle(""), key.setImage(ERROR_BRIGHT)]);
			return;
		}

		this.stopFlashing(key.id);
		await Promise.all([key.setTitle(""), key.setImage(ERROR_STEADY)]);
	}

	private ensureFlashing(key: KeyAction): void {
		if (this.flashTimers.has(key.id)) {
			return;
		}

		let bright = true;
		const timer = setInterval(() => {
			bright = !bright;
			void key.setImage(bright ? ERROR_BRIGHT : ERROR_DIM).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : "Unknown error";
				streamDeck.logger.error(`Error Pulse flash failed: ${message}`);
			});
		}, FLASH_INTERVAL_MS);
		this.flashTimers.set(key.id, timer);
	}

	private stopFlashing(actionId: string): void {
		const timer = this.flashTimers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.flashTimers.delete(actionId);
		}
	}

	private clearKeyState(actionId: string): void {
		this.stopFlashing(actionId);
		this.latestIssues.delete(actionId);
		this.alerting.delete(actionId);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}
