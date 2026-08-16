import {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issueSelectionStore } from "../issue-selection-store";
import { issuePoller } from "../issue-poller";
import { createActionIcon } from "../key-visual";
import { updateIssueStatus } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";
import { LongPressAction } from "../long-press";

const IMAGES = {
	idle: createActionIcon("resolve", { color: "#34d399" }),
	resolved: createActionIcon("resolve", { color: "#34d399", glow: true, label: "RESOLVED" }),
	archived: createActionIcon("resolve", { color: "#34d399", glow: true, label: "ARCHIVED" }),
	armResolve: createActionIcon("resolve", { color: "#f59e0b", glow: true, label: "CONFIRM" }),
	armArchive: createActionIcon("resolve", { color: "#f59e0b", glow: true, label: "ARCHIVE?" }),
	fail: createActionIcon("resolve", { color: "#f59e0b", glow: true, label: "FAIL" }),
	auth: createActionIcon("resolve", { color: "#f59e0b", dimmed: true, label: "AUTH" }),
	none: createActionIcon("resolve", { color: "#60646c", dimmed: true })
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.done" })
export class DoneAction extends LongPressAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly confirmations = new Map<string, { issueId: string; status: "resolved" | "ignored" }>();
	private readonly confirmationTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor() {
		super(700);
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}
		this.stopSubscription(ev.action.id);
		const unsubscribe = issueSelectionStore.subscribe(
			() => this.render(ev.action as KeyAction)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.clearConfirmation(ev.action.id);
	}

	protected override async onShortPress(action: KeyAction): Promise<void> {
		await this.updateIssue(action, "resolved");
	}

	protected override async onLongPress(action: KeyAction): Promise<void> {
		await this.updateIssue(action, "ignored");
	}

	private async updateIssue(action: KeyAction, status: "resolved" | "ignored"): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await action.showAlert();
			return;
		}
		const pending = this.confirmations.get(action.id);
		if (!pending || pending.issueId !== issue.id || pending.status !== status) {
			this.clearConfirmation(action.id);
			this.confirmations.set(action.id, { issueId: issue.id, status });
			await action.setImage(status === "resolved" ? IMAGES.armResolve : IMAGES.armArchive);
			this.confirmationTimers.set(action.id, setTimeout(() => {
				this.confirmations.delete(action.id);
				this.confirmationTimers.delete(action.id);
				void this.render(action);
			}, 3_000));
			return;
		}
		this.clearConfirmation(action.id);
		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await action.setImage(IMAGES.auth);
			return;
		}
		try {
			await updateIssueStatus(settings, issue.id, status);
			await action.setImage(status === "resolved" ? IMAGES.resolved : IMAGES.archived);
			await issuePoller.refreshNow();
		} catch (error) {
			const statusCode = (error as { status?: number } | undefined)?.status;
			await action.setImage(statusCode === 401 || statusCode === 403 ? IMAGES.auth : IMAGES.fail);
		}
	}

	private async render(key: KeyAction): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.none)]);
			return;
		}
		await Promise.all([key.setTitle(""), key.setImage(IMAGES.idle)]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}

	private clearConfirmation(actionId: string): void {
		this.confirmations.delete(actionId);
		const timer = this.confirmationTimers.get(actionId);
		if (timer) {
			clearTimeout(timer);
			this.confirmationTimers.delete(actionId);
		}
	}
}
