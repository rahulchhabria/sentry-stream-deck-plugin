import streamDeck, {
	action,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { agentHandoffManager } from "../agent-handoff-manager";
import { launchInTerminal } from "../agent-handoff";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { detectPrStatus, type LoopStatus } from "../pr-status";
import { getSentrySettings } from "../settings";

const IMAGES = {
	idle: createActionIcon("pr", { color: "#60646c", dimmed: true }),
	looking: createActionIcon("pr", { color: "#38bdf8", glow: true, label: "LOOKING" }),
	none: createActionIcon("pr", { color: "#38bdf8", label: "NO PR" }),
	agent: createActionIcon("pr", { color: "#ff3d9a", glow: true, label: "AGENT" }),
	paste: createActionIcon("pr", { color: "#ff3d9a", glow: true, label: "PASTE" }),
	draft: createActionIcon("pr", { color: "#a78bfa", glow: true, label: "DRAFT" }),
	ci: createActionIcon("pr", { color: "#38bdf8", glow: true, label: "CI" }),
	ready: createActionIcon("pr", { color: "#34d399", glow: true, label: "READY" }),
	fail: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "FAIL" }),
	merged: createActionIcon("pr", { color: "#34d399", glow: true, label: "MERGED" }),
	closed: createActionIcon("pr", { color: "#60646c", dimmed: true, label: "CLOSED" }),
	error: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "PR ERR" }),
	auth: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "GH AUTH" }),
	login: createActionIcon("pr", { color: "#38bdf8", glow: true, label: "LOGIN" }),
	missingCli: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "GH CLI" }),
	network: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "NET ERR" }),
	setup: createActionIcon("pr", { color: "#f59e0b", dimmed: true, label: "SETUP" })
};

@action({ UUID: "com.rc.sentry-alerts.loop" })
export class LoopStatusAction extends SingletonAction {
	private readonly subscriptions = new Map<string, Array<() => void>>();
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly renderVersions = new Map<string, number>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}
		const key = ev.action;
		this.stopSubscriptions(key.id);
		const render = () => this.requestRender(key);
		this.subscriptions.set(key.id, [
			issueSelectionStore.subscribe(render),
			agentHandoffManager.subscribe(render)
		]);

		this.stopTimer(key.id);
		this.timers.set(key.id, setInterval(render, 30_000));
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscriptions(ev.action.id);
		this.stopTimer(ev.action.id);
		this.renderVersions.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const key = ev.action as KeyAction;
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await key.showAlert();
			return;
		}

		const settings = await getSentrySettings();
		if (!settings.repositoryPath?.trim()) {
			await key.setImage(IMAGES.setup);
			await key.showAlert();
			return;
		}

		await key.setImage(IMAGES.looking);
		const status = await detectPrStatus(
			settings.repositoryPath.trim(),
			issue.shortId,
			undefined,
			settings.githubCliPath
		);
		if (status.url && status.state !== "none" && status.state !== "error") {
			await streamDeck.system.openUrl(status.url);
			await this.requestRender(key);
			return;
		}
		if (status.state === "error") {
			streamDeck.logger.error(`View PR lookup failed for ${issue.shortId}: ${status.message ?? "Unknown error"}`);
			await this.handlePrError(key, status, settings.repositoryPath.trim(), settings);
			return;
		}

		const agentStatus = agentHandoffManager.getStatus();
		if (agentStatus.status === "running") {
			await key.showAlert();
			return;
		}
		await key.setImage(IMAGES.agent);
		await agentHandoffManager.start(issue, settings, { requestDraftPr: true });
		const nextAgentStatus = agentHandoffManager.getStatus();
		if (nextAgentStatus.status === "error" && nextAgentStatus.issueId === issue.id) {
			await key.showAlert();
		}
		await this.requestRender(key);
	}

	private async handlePrError(
		key: KeyAction,
		status: LoopStatus,
		repositoryPath: string,
		settings: Awaited<ReturnType<typeof getSentrySettings>>
	): Promise<void> {
		await key.showAlert();
		switch (status.errorKind) {
			case "auth":
				await key.setImage(IMAGES.login);
				await launchInTerminal(
					{ executable: status.executable || "/opt/homebrew/bin/gh", args: ["auth", "login", "-h", "github.com"] },
					repositoryPath,
					settings
				);
				return;
			case "missing-cli":
				await key.setImage(IMAGES.missingCli);
				await streamDeck.system.openUrl("https://cli.github.com/");
				return;
			case "network":
				await key.setImage(IMAGES.network);
				await streamDeck.system.openUrl("https://www.githubstatus.com/");
				return;
			case "command":
			default:
				await key.setImage(IMAGES.error);
		}
	}

	private async render(key: KeyAction, version: number): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		if (!issue) {
			await key.setImage(IMAGES.idle);
			return;
		}
		const settings = await getSentrySettings();
		if (this.renderVersions.get(key.id) !== version) {
			return;
		}
		if (!settings.repositoryPath?.trim()) {
			await key.setImage(IMAGES.setup);
			return;
		}

		const agentStatus = agentHandoffManager.getStatus();
		if (agentStatus.status === "running" && agentStatus.issueId === issue.id) {
			await key.setImage(IMAGES.agent);
			return;
		}

		const status = await detectPrStatus(
			settings.repositoryPath.trim(),
			issue.shortId,
			undefined,
			settings.githubCliPath
		);
		if (this.renderVersions.get(key.id) !== version) {
			return;
		}
		if (
			status.state === "none"
			&& agentStatus.status === "sent"
			&& agentStatus.issueId === issue.id
			&& agentStatus.launch.requiresPromptPaste
		) {
			await key.setImage(IMAGES.paste);
			return;
		}
		await key.setImage(imageForStatus(status));
	}

	private requestRender(key: KeyAction): Promise<void> {
		const version = (this.renderVersions.get(key.id) ?? 0) + 1;
		this.renderVersions.set(key.id, version);
		return this.render(key, version).catch(async (error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`View PR render failed: ${message}`);
			await key.setImage(IMAGES.error);
		});
	}

	private stopSubscriptions(actionId: string): void {
		for (const unsubscribe of this.subscriptions.get(actionId) ?? []) {
			unsubscribe();
		}
		this.subscriptions.delete(actionId);
	}

	private stopTimer(actionId: string): void {
		const timer = this.timers.get(actionId);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(actionId);
		}
	}
}

export function imageForStatus(status: LoopStatus): string {
	switch (status.state) {
		case "draft": return IMAGES.draft;
		case "ci": return IMAGES.ci;
		case "ready": return IMAGES.ready;
		case "fail": return IMAGES.fail;
		case "merged": return IMAGES.merged;
		case "closed": return IMAGES.closed;
		case "error":
			switch (status.errorKind) {
				case "auth": return IMAGES.auth;
				case "missing-cli": return IMAGES.missingCli;
				case "network": return IMAGES.network;
				default: return IMAGES.error;
			}
		case "none":
		default: return IMAGES.none;
	}
}
