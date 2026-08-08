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
import { sentryPlanManager, type SentryPlanStatus } from "../sentry-plan-manager";
import { getSentrySettings } from "../settings";

const IMAGES = {
	setup: createKeyImage({ background: "#201a2c", accent: "#8b7aa8", label: "CONFIG" }),
	none: createKeyImage({ background: "#17191d", accent: "#60646c", label: "NO ISSUE" }),
	repository: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "SET REPO" }),
	ready: createKeyImage({ background: "#20113a", accent: "#a78bfa", label: "PLAN" }),
	running: createKeyImage({ background: "#2b1b45", accent: "#c4b5fd", label: "SEER" }),
	complete: createKeyImage({ background: "#10241d", accent: "#34d399", label: "PLAN OK" }),
	error: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "CLI ERR" })
};

@action({ UUID: "com.rahulchhabria.sentry-human-loop.agent-plan" })
export class AgentPlan extends SingletonAction {
	private readonly subscriptions = new Map<string, Array<() => void>>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscriptions(ev.action.id);
		const render = () => this.render(ev.action as KeyAction);
		this.subscriptions.set(ev.action.id, [
			issueSelectionStore.subscribe(render),
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

		const status = sentryPlanManager.getStatus();
		if (status.status === "running") {
			await ev.action.showAlert();
			return;
		}
		if (status.status === "ready" && status.issueId === issue.id) {
			await streamDeck.system.openUrl(issue.permalink);
			return;
		}

		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await ev.action.showAlert();
			return;
		}
		await sentryPlanManager.start(issue, settings);
	}

	private async render(key: KeyAction): Promise<void> {
		const selection = issueSelectionStore.getSnapshot();
		if (selection.source.status === "unconfigured") {
			await Promise.all([key.setTitle("SETUP"), key.setImage(IMAGES.setup)]);
			return;
		}
		if (selection.source.status === "error") {
			await Promise.all([key.setTitle("API ERR"), key.setImage(IMAGES.error)]);
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

		const status = sentryPlanManager.getStatus();
		const isSelectedIssue = status.status !== "idle"
			&& status.issueId === selection.selectedIssue.id;
		if (status.status === "running") {
			await Promise.all([
				key.setTitle(isSelectedIssue ? "RUN" : "BUSY"),
				key.setImage(IMAGES.running)
			]);
			return;
		}
		if (isSelectedIssue && status.status === "ready") {
			await Promise.all([key.setTitle("READY"), key.setImage(IMAGES.complete)]);
			return;
		}
		if (isSelectedIssue && status.status === "error") {
			await Promise.all([key.setTitle("RETRY"), key.setImage(IMAGES.error)]);
			return;
		}

		await Promise.all([
			key.setTitle(
				selection.source.status === "stale"
					? selection.source.statusCode === 429 ? "RATE" : "STALE"
					: ""
			),
			key.setImage(IMAGES.ready)
		]);
	}

	private stopSubscriptions(actionId: string): void {
		for (const unsubscribe of this.subscriptions.get(actionId) ?? []) {
			unsubscribe();
		}
		this.subscriptions.delete(actionId);
	}
}
