import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createActionIcon } from "../key-visual";
import {
	getEventFrames,
	getLatestIssueEvent,
	getProjectIssuesUrl,
	type SentryEventFrame
} from "../sentry-api";
import { getSentrySettings, hasRequiredSettings } from "../settings";

/**
 * Safe fallback for the human-in-the-loop action.
 *
 * The undocumented Autofix endpoint was not verifiable during the capability
 * probe, so this action intentionally uses only the documented Issues API and
 * opens the selected issue in Sentry for review.
 */
@action({ UUID: "com.rahulchhabria.sentry-human-loop.review-issue" })
export class SelectedIssue extends SingletonAction {
	private readonly subscriptions = new Map<string, () => void>();

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey()) {
			return;
		}

		this.stopSubscription(ev.action.id);
		const unsubscribe = issueSelectionStore.subscribe(
			(snapshot) => this.render(ev.action, snapshot)
		);
		this.subscriptions.set(ev.action.id, unsubscribe);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.stopSubscription(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const key = ev.action;
		const snapshot = issueSelectionStore.getSnapshot();
		const issue = snapshot.selectedIssue;
		if (issue) {
			await streamDeck.system.openUrl(issue.permalink);
			return;
		}

		const settings = await getSentrySettings();
		if (!hasRequiredSettings(settings)) {
			await key.showAlert();
			return;
		}
		await streamDeck.system.openUrl(getProjectIssuesUrl(settings));
	}

	private async render(key: WillAppearEvent["action"], snapshot: IssueSelectionSnapshot): Promise<void> {
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

export function pickBestFrame(
	event: Awaited<ReturnType<typeof getLatestIssueEvent>>
): SentryEventFrame | undefined {
	const frames = getEventFrames(event);
	// Frames are oldest-to-newest; prefer the newest in-app frame with a path.
	for (let i = frames.length - 1; i >= 0; i -= 1) {
		const frame = frames[i]!;
		if (frame.inApp && sourcePathCandidates(frame).length > 0) {
			return frame;
		}
	}
	for (let i = frames.length - 1; i >= 0; i -= 1) {
		const frame = frames[i]!;
		if (sourcePathCandidates(frame).length > 0) {
			return frame;
		}
	}
	return undefined;
}

export function sourcePathCandidates(frame: SentryEventFrame): string[] {
	return [...new Set([frame.filename, frame.absPath]
		.filter((path): path is string => Boolean(path))
		.map(normalisePath)
		.filter((path): path is string => Boolean(path)))];
}

function normalisePath(path: string): string | undefined {
	const trimmed = path.trim();
	if (!trimmed || /^<.*>$/.test(trimmed)) {
		return undefined;
	}
	if (trimmed.startsWith("file://")) {
		try {
			return decodeURIComponent(new URL(trimmed).pathname);
		} catch {
			// Continue with prefix cleanup.
		}
	}
	if (/^https?:\/\//i.test(trimmed)) {
		try {
			return decodeURIComponent(new URL(trimmed).pathname).replace(/^\/+/, "");
		} catch {
			return undefined;
		}
	}
	return trimmed
		.replace(/^(?:webpack|app|vite):\/{2,3}(?:\.\/)?/, "")
		.replace(/^(?:\.\.\/)+/, "")
		.replace(/^\.\//, "");
}
