import streamDeck, {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issueSelectionStore } from "../issue-selection-store";
import { createKeyImage } from "../key-visual";
import { updateIssueStatus } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";
import { LongPressAction } from "../long-press";

const IMAGES = {
	idle: createKeyImage({ background: "#10211a", accent: "#34d399", label: "DONE" }),
	ok: createKeyImage({ background: "#0f2a1f", accent: "#34d399", label: "OK" }),
	fail: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "FAIL" }),
	auth: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "AUTH" }),
	none: createKeyImage({ background: "#17191d", accent: "#60646c", label: "NO ISSUE" })
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.done" })
export class DoneAction extends LongPressAction {
	private readonly subscriptions = new Map<string, () => void>();

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
		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await action.setImage(IMAGES.auth);
			return;
		}
		try {
			await updateIssueStatus(settings, issue.id, status);
			// Brief OK flash, then idle re-render on next poll.
			await action.setImage(IMAGES.ok);
			setTimeout(() => void this.render(action).catch(() => {}), 600);
		} catch (error) {
			const statusCode = (error as { status?: number } | undefined)?.status;
			await action.setImage(statusCode === 401 || statusCode === 403 ? IMAGES.auth : IMAGES.fail);
		}
	}

	private async render(key: KeyAction): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await Promise.all([key.setTitle("NONE"), key.setImage(IMAGES.none)]);
			return;
		}
		await Promise.all([key.setTitle(""), key.setImage(IMAGES.idle)]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}

