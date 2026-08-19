import {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { agentHandoffManager } from "../agent-handoff-manager";
import { getSentrySettings } from "../settings";
import { LongPressAction } from "../long-press";

const IMAGES = {
	setup: createActionIcon("agent", { color: "#8b7aa8", dimmed: true, label: "SETUP" }),
	none: createActionIcon("agent", { color: "#60646c", dimmed: true }),
	repository: createActionIcon("agent", { color: "#f59e0b", dimmed: true, label: "REPO" }),
	idle: createActionIcon("agent", { color: "#ff3d9a" }),
	running: createActionIcon("agent", { color: "#ff3d9a", glow: true, label: "RUN" }),
	sent: createActionIcon("agent", { color: "#34d399", glow: true, label: "SENT" }),
	paste: createActionIcon("agent", { color: "#a78bfa", glow: true, label: "PASTE" }),
	error: createActionIcon("agent", { color: "#f59e0b", glow: true, label: "FAIL" })
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.send-to-agent" })
export class SendToAgent extends LongPressAction {
	private readonly subscriptions = new Map<string, Array<() => void>>();

	constructor() {
		super(700);
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscriptions(ev.action.id);
		const render = () => this.render(ev.action as KeyAction);
		this.subscriptions.set(ev.action.id, [
			issueSelectionStore.subscribe(render),
			agentHandoffManager.subscribe(render)
		]);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscriptions(ev.action.id);
	}

	protected override async onShortPress(action: KeyAction): Promise<void> {
		await this.launch(action, { requestDraftPr: false });
	}

	protected override async onLongPress(action: KeyAction): Promise<void> {
		await this.launch(action, { requestDraftPr: true });
	}

	private async launch(action: KeyAction, opts: { requestDraftPr: boolean }): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await action.showAlert();
			return;
		}
		const status = agentHandoffManager.getStatus();
		if (status.status === "running") {
			await action.showAlert();
			return;
		}
		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await action.showAlert();
			return;
		}
		await agentHandoffManager.start(issue, settings, { requestDraftPr: opts.requestDraftPr });
		const nextStatus = agentHandoffManager.getStatus();
		if (nextStatus.status === "error" && nextStatus.issueId === issue.id) {
			await action.showAlert();
		}
	}

	private async render(key: KeyAction): Promise<void> {
		const selection = issueSelectionStore.getSnapshot();
		if (selection.source.status === "unconfigured") {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.setup)]);
			return;
		}
		if (selection.source.status === "error") {
			const isAuth = selection.source.statusCode === 401 || selection.source.statusCode === 403;
			const isRate = selection.source.statusCode === 429;
			const label = isAuth ? "AUTH" : isRate ? "RATE" : "API ERR";
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("agent", { color: "#f59e0b", glow: true, label }))
			]);
			return;
		}
		if (!selection.selectedIssue) {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.none)]);
			return;
		}

		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.repository)]);
			return;
		}

		const status = agentHandoffManager.getStatus();
		const isSelectedIssue = status.status !== "idle"
			&& status.issueId === selection.selectedIssue.id;
		if (status.status === "running") {
			await Promise.all([
				key.setTitle(""),
				key.setImage(isSelectedIssue
					? IMAGES.running
					: createActionIcon("agent", { color: "#ff3d9a", glow: true, label: "BUSY" }))
			]);
			return;
		}
		if (isSelectedIssue && status.status === "sent") {
			await Promise.all([
				key.setTitle(""),
				key.setImage(status.launch.requiresPromptPaste ? IMAGES.paste : IMAGES.sent)
			]);
			return;
		}
		if (isSelectedIssue && status.status === "error") {
			await Promise.all([key.setTitle(""), key.setImage(IMAGES.error)]);
			return;
		}

		const staleLabel = selection.source.status === "stale"
			? selection.source.statusCode === 429 ? "RATE" : "STALE"
			: undefined;
		await Promise.all([
			key.setTitle(""),
			key.setImage(staleLabel
				? createActionIcon("agent", { color: "#ff3d9a", label: staleLabel })
				: IMAGES.idle)
		]);
	}

	private stopSubscriptions(actionId: string): void {
		for (const unsubscribe of this.subscriptions.get(actionId) ?? []) {
			unsubscribe();
		}
		this.subscriptions.delete(actionId);
	}
}
