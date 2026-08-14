import streamDeck, {
	action,
	type KeyAction,
	type WillAppearEvent,
	type WillDisappearEvent
} from "@elgato/streamdeck";

import type { IssueSelectionSnapshot } from "../issue-selection";
import { issueSelectionStore } from "../issue-selection-store";
import { createKeyImage } from "../key-visual";
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
			// Best-effort: try to open the culprit file; fall back to the permalink.
			const settings = await getSentrySettings();
			if (hasRequiredSettings(settings) && settings.repositoryPath?.trim()) {
				try {
					const event = await getLatestIssueEvent(settings, issue.id);
					const frame = pickBestFrame(event);
					if (frame?.filename) {
						const opened = await openInEditorOrSystem(
							settings.repositoryPath!.trim(),
							normalisePath(frame.filename),
							frame.lineno
						);
						if (opened) {
							return;
						}
					}
				} catch {
					// Ignore and fall through to permalink.
				}
			}
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

	protected override async onLongPress(): Promise<void> {
		issueSelectionStore.next();
	}

	private async render(key: KeyAction, snapshot: IssueSelectionSnapshot): Promise<void> {
		if (snapshot.source.status === "unconfigured") {
			await Promise.all([
				key.setTitle("SETUP"),
				key.setImage(createKeyImage({
					background: "#201a2c",
					accent: "#8b7aa8",
					label: "CONFIG"
				}))
			]);
			return;
		}

		if (snapshot.source.status === "error") {
			const isAuth = snapshot.source.statusCode === 401 || snapshot.source.statusCode === 403;
			const isRate = snapshot.source.statusCode === 429;
			await Promise.all([
				key.setTitle(isAuth ? "AUTH" : isRate ? "RATE" : "API ERR"),
				key.setImage(createKeyImage({
					background: "#2c1d08",
					accent: "#f59e0b",
					label: isAuth ? "CHECK KEY" : isRate ? "SLOW DOWN" : "RETRY"
				}))
			]);
			return;
		}

		const issue = snapshot.selectedIssue;
		if (!issue) {
			await Promise.all([
				key.setTitle("NONE"),
				key.setImage(createKeyImage({
					background: "#101d2b",
					accent: "#60a5fa",
					label: "NO REVIEW"
				}))
			]);
			return;
		}

		// Compact heat hint in the title: prefer userCount, else total count.
		const heat = issue.userCount ?? issue.count ?? "";
		// Amber-ish accent for suspected regressions / unhandled issues.
		const accent = issue.isUnhandled ? "#f59e0b" : "#a78bfa";
		await Promise.all([
			key.setTitle(
				snapshot.source.status === "stale"
					? snapshot.source.statusCode === 429 ? "RATE" : "STALE"
					: String(heat)
			),
			key.setImage(createKeyImage({
				background: "#21113d",
				accent,
				label: issue.shortId
			}))
		]);
	}

	private stopSubscription(actionId: string): void {
		this.subscriptions.get(actionId)?.();
		this.subscriptions.delete(actionId);
	}
}

function pickBestFrame(event: Awaited<ReturnType<typeof getLatestIssueEvent>>): {
	filename?: string;
	lineno?: number;
} | undefined {
	const values = event?.exception?.values ?? [];
	for (const ex of values) {
		const frames = ex.stacktrace?.frames ?? [];
		// Prefer in_app frames towards the bottom (most recent call last).
		for (let i = frames.length - 1; i >= 0; i -= 1) {
			const f = frames[i]!;
			if (f.in_app && f.filename) {
				return { filename: f.filename, lineno: f.lineno };
			}
		}
		// Otherwise any frame with a filename.
		for (let i = frames.length - 1; i >= 0; i -= 1) {
			const f = frames[i]!;
			if (f.filename) {
				return { filename: f.filename, lineno: f.lineno };
			}
		}
	}
	return undefined;
}

function normalisePath(path: string): string {
	// Strip leading slashes or drive letters to treat it as a repo-relative path.
	return path.replace(/^[A-Za-z]:[\\/]/, "").replace(/^[/\\]+/, "");
}
