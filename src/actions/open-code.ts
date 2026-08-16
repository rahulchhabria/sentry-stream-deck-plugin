import streamDeck, {
	action,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import { pickBestFrame, sourcePathCandidates } from "./human-loop";
import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { openInEditorOrSystem } from "../open-file";
import { getLatestIssueEvent } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";

const IMAGES = {
	idle: createActionIcon("code", { color: "#60a5fa" }),
	opening: createActionIcon("code", { color: "#60a5fa", glow: true, label: "OPENING" }),
	opened: createActionIcon("code", { color: "#34d399", glow: true, label: "OPEN" }),
	setup: createActionIcon("code", { color: "#8b7aa8", dimmed: true, label: "SETUP" }),
	none: createActionIcon("code", { color: "#60646c", dimmed: true }),
	noFrame: createActionIcon("code", { color: "#f59e0b", glow: true, label: "NO FRAME" }),
	noFile: createActionIcon("code", { color: "#f59e0b", glow: true, label: "NO FILE" }),
	auth: createActionIcon("code", { color: "#f59e0b", glow: true, label: "AUTH" }),
	error: createActionIcon("code", { color: "#f59e0b", glow: true, label: "API ERR" })
};

/** Retains the old Next action UUID so existing physical profiles become Code in place. */
@action({ UUID: "com.rahulchhabria.sentry-human-loop.next-issue" })
export class OpenCode extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();
	private readonly feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}
		this.stopSubscription(ev.action.id);
		const unsubscribe = issueSelectionStore.subscribe(
			(snapshot) => this.render(ev.action as KeyAction, snapshot)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
		this.stopFeedbackTimer(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const key = ev.action as KeyAction;
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		const settings = await getSentrySettings();
		if (!issue) {
			await key.setImage(IMAGES.none);
			return;
		}
		if (!hasRequiredSettings(settings) || !settings.repositoryPath?.trim()) {
			await key.setImage(IMAGES.setup);
			return;
		}

		await key.setImage(IMAGES.opening);
		try {
			const event = await getLatestIssueEvent(settings, issue.id);
			const frame = pickBestFrame(event);
			if (!frame) {
				streamDeck.logger.warn(`Code found no stack frame for ${issue.shortId}`);
				await key.setImage(IMAGES.noFrame);
				return;
			}
			const candidates = sourcePathCandidates(frame);
			for (const candidate of candidates) {
				const opened = await openInEditorOrSystem(
					settings.repositoryPath.trim(),
					candidate,
					frame.lineno,
					undefined,
					{
						kind: settings.editorKind,
						executable: settings.editorCliPath,
						argsTemplate: settings.editorArgs
					}
				);
				if (opened) {
					streamDeck.logger.info(`Code opened ${candidate}:${frame.lineno ?? 1}`);
					await key.setImage(IMAGES.opened);
					this.scheduleRender(key);
					return;
				}
			}
			streamDeck.logger.warn(
				`Code found no local file for ${issue.shortId}: ${candidates.join(", ") || "no path"}`
			);
			await key.setImage(IMAGES.noFile);
		} catch (error) {
			const status = (error as { status?: number } | undefined)?.status;
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Code failed for ${issue.shortId}: ${message}`);
			await key.setImage(status === 401 || status === 403 ? IMAGES.auth : IMAGES.error);
		}
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		if (snapshot.source.status === "unconfigured") {
			await key.setImage(IMAGES.setup);
			return;
		}
		if (snapshot.source.status === "error") {
			const isAuth = snapshot.source.statusCode === 401 || snapshot.source.statusCode === 403;
			await key.setImage(isAuth ? IMAGES.auth : IMAGES.error);
			return;
		}
		await key.setImage(snapshot.selectedIssue ? IMAGES.idle : IMAGES.none);
	}

	private scheduleRender(key: KeyAction): void {
		this.stopFeedbackTimer(key.id);
		this.feedbackTimers.set(key.id, setTimeout(() => {
			this.feedbackTimers.delete(key.id);
			void this.render(key, issueSelectionStore.getSnapshot());
		}, 900));
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}

	private stopFeedbackTimer(actionId: string): void {
		const timer = this.feedbackTimers.get(actionId);
		if (timer) {
			clearTimeout(timer);
			this.feedbackTimers.delete(actionId);
		}
	}
}
