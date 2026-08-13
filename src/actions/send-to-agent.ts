import streamDeck, {
	action,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { issueSelectionStore } from "../issue-selection-store";
import { createKeyImage } from "../key-visual";
import { agentHandoffManager } from "../agent-handoff-manager";
import { sentryPlanManager } from "../sentry-plan-manager";
import { getSentrySettings } from "../settings";

const IMAGES = {
	setup: createKeyImage({ background: "#201a2c", accent: "#8b7aa8", label: "CONFIG" }),
	none: createKeyImage({ background: "#17191d", accent: "#60646c", label: "NO ISSUE" }),
	repository: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "SET REPO" }),
	idle: createKeyImage({ background: "#12222e", accent: "#60a5fa", label: "SEND" }),
	running: createKeyImage({ background: "#162b3b", accent: "#93c5fd", label: "RUN" }),
	sent: createKeyImage({ background: "#10241d", accent: "#34d399", label: "SENT" }),
	error: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "FAIL" })
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.send-to-agent" })
export class SendToAgent extends SingletonAction {
	private readonly subscriptions = new Map<string, Array<() => void>>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscriptions(ev.action.id);
		const render = () => this.render(ev.action as KeyAction);
		this.subscriptions.set(ev.action.id, [
			issueSelectionStore.subscribe(render),
			agentHandoffManager.subscribe(render),
			sentryPlanManager.subscribe(render)
		]);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscriptions(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await ev.action.showAlert();
			return;
		}

		const status = agentHandoffManager.getStatus();
		if (status.status === "running") {
			await ev.action.showAlert();
			return;
		}
		if (status.status === "sent" && status.issueId === issue.id) {
			// No-op on a second press while SENT for this issue.
			return;
		}

		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await ev.action.showAlert();
			return;
		}

		const plan = sentryPlanManager.getStatus();
		const planText = plan.status === "ready" && plan.issueId === issue.id
			? plan.output
			: undefined;
		await agentHandoffManager.start(issue, settings, { planText });
	}

	private async render(key: KeyAction): Promise<void> {
		const selection = issueSelectionStore.getSnapshot();
		if (selection.source.status === "unconfigured") {
			await Promise.all([key.setTitle("SETUP"), key.setImage(IMAGES.setup)]);
			return;
		}
		if (selection.source.status === "error") {
			const isAuth = selection.source.statusCode === 401 || selection.source.statusCode === 403;
			const isRate = selection.source.statusCode === 429;
			await Promise.all([
				key.setTitle(isAuth ? "AUTH" : isRate ? "RATE" : "API ERR"),
				key.setImage(IMAGES.error)
			]);
			return;
		}
		if (!selection.selectedIssue) {
			await Promise.all([key.setTitle("NONE"), key.setImage(IMAGES.none)]);
			return;
		}

		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await Promise.all([key.setTitle("REPO"), key.setImage(IMAGES.repository)]);
			return;
		}

		const status = agentHandoffManager.getStatus();
		const isSelectedIssue = status.status !== "idle"
			&& status.issueId === selection.selectedIssue.id;
		if (status.status === "running") {
			await Promise.all([
				key.setTitle(isSelectedIssue ? "RUN" : "BUSY"),
				key.setImage(IMAGES.running)
			]);
			return;
		}
		if (isSelectedIssue && status.status === "sent") {
			await Promise.all([key.setTitle("SENT"), key.setImage(IMAGES.sent)]);
			return;
		}
		if (isSelectedIssue && status.status === "error") {
			await Promise.all([key.setTitle("FAIL"), key.setImage(IMAGES.error)]);
			return;
		}

		await Promise.all([
			key.setTitle(
				selection.source.status === "stale"
					? selection.source.statusCode === 429 ? "RATE" : "STALE"
					: ""
			),
			key.setImage(IMAGES.idle)
		]);
	}

	private stopSubscriptions(actionId: string): void {
		for (const unsubscribe of this.subscriptions.get(actionId) ?? []) {
			unsubscribe();
		}
		this.subscriptions.delete(actionId);
	}
}

