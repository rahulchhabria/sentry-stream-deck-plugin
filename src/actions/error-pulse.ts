import streamDeck, {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issuePoller, type IssueSnapshot } from "../issue-poller";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { getProjectIssuesUrl, type SentryIssue } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";
import { LongPressAction } from "../long-press";
import { pulseMuteStore } from "../pulse-mute";

const FLASH_INTERVAL_MS = 600;
const ERROR_BRIGHT = createActionIcon("pulse", { color: "#ff375f", glow: true });
const ERROR_DIM = createActionIcon("pulse", { color: "#ff375f" });
// Steady (acknowledged) look: errors still present, but no longer flashing.
const ERROR_STEADY = ERROR_DIM;
const QUIET_IMAGE = createActionIcon("pulse", { color: "#34d399" });

@action({ UUID: "com.rahulchhabria.sentry-human-loop.error-pulse" })
export class ErrorPulse extends LongPressAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly flashTimers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly latestIssues = new Map<string, SentryIssue>();
	private readonly latestSnapshots = new Map<string, IssueSnapshot>();
	/** Key ids currently alerting on an unacknowledged new issue. */
	private readonly alerting = new Set<string>();
	/** Subscription to mute state changes per key id. */
	private readonly muteSubscriptions = new Map<string, () => void>();

	constructor() {
		super(700);
	}

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

		// Also re-render on mute toggles.
		this.stopMuteSubscription(key.id);
		const unsubMute = pulseMuteStore.subscribe(() => {
			if (this.latestSnapshots.has(key.id)) {
				void this.render(key, this.latestSnapshots.get(key.id)!);
			}
		});
		this.muteSubscriptions.set(key.id, unsubMute);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.stopFlashing(ev.action.id);
		this.latestIssues.delete(ev.action.id);
		this.alerting.delete(ev.action.id);
		this.stopMuteSubscription(ev.action.id);
		this.latestSnapshots.delete(ev.action.id);
	}

	protected override async onShortPress(action: KeyAction): Promise<void> {
		// Acknowledge: stop flashing and select the newest "new" issue if possible.
		if (this.alerting.delete(action.id)) {
			this.stopFlashing(action.id);
			await action.setImage(ERROR_STEADY);
		}

		const snapshot = this.latestSnapshots.get(action.id);
		const issue = pickNewestNewIssue(snapshot) ?? this.latestIssues.get(action.id);
		if (issue) {
			issueSelectionStore.select(issue.id);
			return;
		}

		// Fallback: open the project issues list if nothing is selected.
		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await action.showAlert();
			return;
		}
		await streamDeck.system.openUrl(getProjectIssuesUrl(settings));
	}

	protected override async onLongPress(): Promise<void> {
		// Toggle mute state for the session.
		pulseMuteStore.toggle();
	}

	private async render(key: KeyAction, snapshot: IssueSnapshot): Promise<void> {
		this.latestSnapshots.set(key.id, snapshot);

		if (snapshot.status === "unconfigured") {
			this.clearKeyState(key.id);
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("pulse", { color: "#8b6f73", dimmed: true, label: "SETUP" }))
			]);
			return;
		}

		if (snapshot.status === "error") {
			this.clearKeyState(key.id);
			const isAuth = snapshot.statusCode === 401 || snapshot.statusCode === 403;
			const isRate = snapshot.statusCode === 429;
			const label = isAuth ? "AUTH" : isRate ? "RATE" : "API ERR";
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("pulse", { color: "#f59e0b", glow: true, label }))
			]);
			return;
		}

		const issue = snapshot.issues[0];
		if (!issue) {
			this.clearKeyState(key.id);
			if (snapshot.status === "stale") {
				const label = snapshot.statusCode === 429 ? "RATE" : "STALE";
				await Promise.all([
					key.setTitle(""),
					key.setImage(createActionIcon("pulse", { color: "#f59e0b", dimmed: true, label }))
				]);
				return;
			}
			await Promise.all([key.setTitle(""), key.setImage(QUIET_IMAGE)]);
			return;
		}

		this.latestIssues.set(key.id, issue);
		if (snapshot.newIssues.length > 0) {
			this.alerting.add(key.id);
		}

		// While muted: never flash; show MUTE.
		if (pulseMuteStore.isMuted()) {
			this.stopFlashing(key.id);
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("pulse", { color: "#10b981", dimmed: true, label: "MUTE" }))
			]);
			return;
		}

		if (this.alerting.has(key.id)) {
			// Alerting: flash until the user acknowledges with a keypress. Do not
			// restart the timer on every poll, or the animation would stutter.
			this.ensureFlashing(key);
			await Promise.all([
				key.setTitle(""),
				key.setImage(ERROR_BRIGHT)
			]);
			return;
		}

		this.stopFlashing(key.id);
		const label = snapshot.status === "stale"
			? snapshot.statusCode === 429 ? "RATE" : "STALE"
			: undefined;
		await Promise.all([
			key.setTitle(""),
			key.setImage(label
				? createActionIcon("pulse", { color: "#ff375f", label })
				: ERROR_STEADY)
		]);
	}

	private ensureFlashing(key: KeyAction): void {
		if (this.flashTimers.has(key.id)) {
			return;
		}

		let bright = true;
		const timer = setInterval(() => {
			if (this.flashTimers.get(key.id) !== timer || !this.alerting.has(key.id)) {
				return;
			}
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

	private stopMuteSubscription(actionId: string): void {
		this.muteSubscriptions.get(actionId)?.();
		this.muteSubscriptions.delete(actionId);
	}
}

function pickNewestNewIssue(snapshot: IssueSnapshot | undefined): SentryIssue | undefined {
	if (!snapshot || snapshot.status === "unconfigured" || snapshot.status === "error") {
		return undefined;
	}
	// Choose the first issue in the current page that is marked new this cycle.
	const newSet = new Set(snapshot.newIssues.map((i) => i.id));
	return snapshot.issues.find((i) => newSet.has(i.id));
}
