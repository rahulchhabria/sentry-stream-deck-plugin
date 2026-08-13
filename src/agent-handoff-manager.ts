import streamDeck from "@elgato/streamdeck";

import type { SentryIssue } from "./sentry-api";
import type { SentrySettings } from "./settings";
import { buildAgentCommand, buildAgentPrompt, launchInTerminal, writeHandoffFile, type AgentCommand } from "./agent-handoff";

export type TerminalLauncher = (command: AgentCommand, repositoryPath: string) => Promise<void>;

export type AgentHandoffStatus =
	| { status: "idle" }
	| { status: "running"; issueId: string }
	| { status: "sent"; issueId: string }
	| { status: "error"; issueId: string; message: string };

type Subscriber = (status: AgentHandoffStatus) => void | Promise<void>;

class AgentHandoffManager {
	private readonly subscribers = new Set<Subscriber>();
	private current: AgentHandoffStatus = { status: "idle" };

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		this.notify(subscriber, this.current);
		return () => this.subscribers.delete(subscriber);
	}

	getStatus(): AgentHandoffStatus {
		return this.current;
	}

	async start(
		issue: SentryIssue,
		settings: SentrySettings,
		options?: { planText?: string; requestDraftPr?: boolean },
		launcher?: TerminalLauncher
	): Promise<void> {
		if (this.current.status === "running") {
			return;
		}
		const repositoryPath = settings.repositoryPath?.trim() || "";
		if (!repositoryPath) {
			this.publish({ status: "error", issueId: issue.id, message: "Missing repository path" });
			return;
		}
		const agentCliPath = settings.agentCliPath?.trim() || "agent";

		this.publish({ status: "running", issueId: issue.id });
		try {
			// Best-effort context handoff file (no secrets).
			let handoffPath: string | undefined;
			try {
				handoffPath = await writeHandoffFile(repositoryPath, issue, settings, options?.planText);
			} catch {
				// Ignore handoff write failures and continue with inline prompt only.
			}

			const prompt = buildAgentPrompt(issue, settings, {
				planText: options?.planText,
				handoffPath,
				requestDraftPr: options?.requestDraftPr
			});
			const command = buildAgentCommand(
				settings.agentKind,
				agentCliPath,
				settings.agentExtraArgs,
				prompt
			);
			await (launcher ?? launchInTerminal)(command, repositoryPath);
			this.publish({ status: "sent", issueId: issue.id });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Send to Agent failed: ${message}`);
			this.publish({ status: "error", issueId: issue.id, message });
		}
	}

	private publish(status: AgentHandoffStatus): void {
		this.current = status;
		for (const subscriber of this.subscribers) {
			this.notify(subscriber, status);
		}
	}

	private notify(subscriber: Subscriber, status: AgentHandoffStatus): void {
		Promise.resolve(subscriber(status)).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Agent handoff status update failed: ${message}`);
		});
	}
}

export const agentHandoffManager = new AgentHandoffManager();

