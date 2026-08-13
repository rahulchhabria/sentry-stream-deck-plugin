import streamDeck, {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent,
	SingletonAction,
	type KeyDownEvent
} from "@elgato/streamdeck";

import { agentHandoffManager } from "../agent-handoff-manager";
import { issueSelectionStore } from "../issue-selection-store";
import { createKeyImage } from "../key-visual";
import { detectPrStatus, type LoopStatus } from "../pr-status";
import { getSentrySettings, hasRequiredSettings } from "../settings";

const IMAGES = {
	idle: createKeyImage({ background: "#0f1f1b", accent: "#60a5fa", label: "LOOP" }),
	sent: createKeyImage({ background: "#10241d", accent: "#34d399", label: "SENT" }),
	draft: createKeyImage({ background: "#1b1730", accent: "#a78bfa", label: "DRAFT" }),
	ci: createKeyImage({ background: "#162b3b", accent: "#93c5fd", label: "CI" }),
	fail: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "FAIL" }),
	merged: createKeyImage({ background: "#0f2a1f", accent: "#34d399", label: "MERGED" }),
	error: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "CONFIG" })
};

type LastHandoff = {
	issueId: string;
	shortId: string;
	permalink: string;
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.loop" })
export class LoopStatusAction extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly lastHandoff = new Map<string, LastHandoff>();
	private readonly prStatusCache = new Map<string, LoopStatus>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}
		const key = ev.action;
		this.stopSubscription(key.id);
		const unsubscribe = agentHandoffManager.subscribe(async (status) => {
			if (status.status === "sent") {
				const sel = issueSelectionStore.getSnapshot().selectedIssue;
				if (sel && sel.id === status.issueId) {
					this.lastHandoff.set(key.id, {
						issueId: sel.id,
						shortId: sel.shortId,
						permalink: sel.permalink
					});
				}
			}
			await this.render(key);
		});
		this.subscriptions.set(key.id, unsubscribe);

		// Start slow polling.
		this.stopTimer(key.id);
		const timer = setInterval(() => void this.render(key), 30_000);
		this.timers.set(key.id, timer);
		void this.render(key);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.stopTimer(ev.action.id);
		this.lastHandoff.delete(ev.action.id);
		this.prStatusCache.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const key = ev.action as KeyAction;
		const last = this.lastHandoff.get(key.id);
		if (!last) {
			await key.showAlert();
			return;
		}
		const repo = (await getSentrySettings()).repositoryPath?.trim();
		const status = this.prStatusCache.get(key.id);
		if (repo && status?.url) {
			await streamDeck.system.openUrl(status.url);
			return;
		}
		await streamDeck.system.openUrl(last.permalink);
	}

	private async render(key: KeyAction): Promise<void> {
		const settings = await getSentrySettings();
		const last = this.lastHandoff.get(key.id);
		if (!last) {
			await Promise.all([key.setTitle("—"), key.setImage(IMAGES.idle)]);
			return;
		}
		if (!hasRequiredSettings(settings) || !settings.repositoryPath?.trim()) {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.error)]);
			return;
		}
		// Throttle: only check when needed or timer ticked.
		const status = await detectPrStatus(settings.repositoryPath.trim(), last.shortId);
		this.prStatusCache.set(key.id, status);
		switch (status.state) {
			case "draft":
				await Promise.all([key.setTitle(""), key.setImage(IMAGES.draft)]);
				return;
			case "ci":
				await Promise.all([key.setTitle(""), key.setImage(IMAGES.ci)]);
				return;
			case "fail":
				await Promise.all([key.setTitle(""), key.setImage(IMAGES.fail)]);
				return;
			case "merged":
				await Promise.all([key.setTitle(""), key.setImage(IMAGES.merged)]);
				return;
			case "sent":
			default:
				await Promise.all([key.setTitle(""), key.setImage(IMAGES.sent)]);
				return;
		}
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}

	private stopTimer(actionId: string): void {
		const t = this.timers.get(actionId);
		if (t) {
			clearInterval(t);
			this.timers.delete(actionId);
		}
	}
}

