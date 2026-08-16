import streamDeck, {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import { getLatestIssueEvent, getProjectIssuesUrl } from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";
import { LongPressAction } from "../long-press";
import { openInEditorOrSystem } from "../open-file";

/**
 * Safe fallback for the human-in-the-loop action.
 *
 * The undocumented Autofix endpoint was not verifiable during the capability
 * probe, so this action intentionally uses only the documented Issues API and
 * opens the selected issue in Sentry for review.
 */
@action({ UUID: "com.rahulchhabria.sentry-human-loop.review-issue" })
export class SelectedIssue extends LongPressAction {
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
			(snapshot) => this.render(ev.action as KeyAction, snapshot)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
	}

	protected override async onShortPress(action: KeyAction): Promise<void> {
		const snapshot = issueSelectionStore.getSnapshot();
		const issue = snapshot.selectedIssue;
		if (issue) {
			await streamDeck.system.openUrl(issue.permalink);
			return;
		}

		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await action.showAlert();
			return;
		}
		await streamDeck.system.openUrl(getProjectIssuesUrl(settings));
	}

	protected override async onLongPress(action: KeyAction): Promise<void> {
		const issue = issueSelectionStore.getSnapshot().selectedIssue;
		const settings = await getSentrySettings();
		if (!issue || !hasRequiredSettings(settings) || !settings.repositoryPath?.trim()) {
			await action.showAlert();
			return;
		}
		try {
			const event = await getLatestIssueEvent(settings, issue.id);
			const frame = pickBestFrame(event);
			const framePath = frame?.absPath || frame?.filename;
			if (!framePath) {
				await action.showAlert();
				return;
			}
			const opened = await openInEditorOrSystem(
				settings.repositoryPath.trim(),
				normalisePath(framePath),
				frame.lineno,
				undefined,
				{
					kind: settings.editorKind,
					executable: settings.editorCliPath,
					argsTemplate: settings.editorArgs
				}
			);
			if (!opened) {
				await action.showAlert();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Inspect IDE failed for ${issue.shortId}: ${message}`);
			await action.showAlert();
		}
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		if (snapshot.source.status === "unconfigured") {
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("inspect", { color: "#8b7aa8", dimmed: true, label: "SETUP" }))
			]);
			return;
		}

		if (snapshot.source.status === "error") {
			const isAuth = snapshot.source.statusCode === 401 || snapshot.source.statusCode === 403;
			const isRate = snapshot.source.statusCode === 429;
			const label = isAuth ? "AUTH" : isRate ? "RATE" : "API ERR";
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("inspect", { color: "#f59e0b", glow: true, label }))
			]);
			return;
		}

		const issue = snapshot.selectedIssue;
		if (!issue) {
			await Promise.all([
				key.setTitle(""),
				key.setImage(createActionIcon("inspect", { color: "#60646c", dimmed: true }))
			]);
			return;
		}

		// Compact heat hint in the title: prefer userCount, else total count.
		const heat = positiveCount(issue.userCount) ?? positiveCount(issue.count);
		// Amber-ish accent for suspected regressions / unhandled issues.
		const accent = issue.isUnhandled ? "#f59e0b" : "#a78bfa";
		const staleLabel = snapshot.source.status === "stale"
			? snapshot.source.statusCode === 429 ? "RATE" : "STALE"
			: undefined;
		await Promise.all([
			key.setTitle(""),
			key.setImage(createActionIcon("inspect", {
				color: accent,
				glow: Boolean(issue.isUnhandled),
				label: staleLabel,
				value: staleLabel ? undefined : heat
			}))
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}

function positiveCount(value: number | undefined): string | undefined {
	return typeof value === "number" && value > 0 ? String(value) : undefined;
}

function pickBestFrame(event: Awaited<ReturnType<typeof getLatestIssueEvent>>): {
	filename?: string;
	absPath?: string;
	lineno?: number;
} | undefined {
	const values = event?.exception?.values ?? [];
	for (const ex of values) {
		const frames = ex.stacktrace?.frames ?? [];
		// Prefer in_app frames towards the bottom (most recent call last).
		for (let i = frames.length - 1; i >= 0; i -= 1) {
			const f = frames[i]!;
			if (f.in_app && (f.abs_path || f.filename)) {
				return { filename: f.filename, absPath: f.abs_path, lineno: f.lineno };
			}
		}
		// Otherwise any frame with a filename.
		for (let i = frames.length - 1; i >= 0; i -= 1) {
			const f = frames[i]!;
			if (f.abs_path || f.filename) {
				return { filename: f.filename, absPath: f.abs_path, lineno: f.lineno };
			}
		}
	}
	return undefined;
}

function normalisePath(path: string): string {
	if (path.startsWith("file://")) {
		try {
			return new URL(path).pathname;
		} catch {
			// Continue with prefix cleanup.
		}
	}
	return path
		.replace(/^(?:webpack|app|vite):\/{2,3}(?:\.\/)?/, "")
		.replace(/^\.\//, "");
}
