import { execFile } from "node:child_process";
import { platform as getPlatform } from "node:os";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import type { SentryIssue } from "./sentry-api";
import type { SentrySettings } from "./settings";
import { getSentryBaseUrl } from "./settings";

export type AgentCommand = {
	executable: string;
	args: string[];
};

export type ProcessLauncher = (
	executable: string,
	args: string[],
	options?: { cwd?: string; windowsHide?: boolean; timeout?: number }
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => Promise<void>;

export function buildAgentPrompt(
	issue: SentryIssue,
	settings: SentrySettings,
	options?: { planText?: string; handoffPath?: string }
): string {
	const lines: string[] = [
		`Sentry issue ${issue.shortId} (${issue.permalink}).`,
		"Use Sentry MCP get_issue_details and analyze_issue_with_seer (or the Sentry CLI if MCP is unavailable).",
		"Identify root cause. Smallest safe fix in the right files.",
		"Add or update a regression test. Open a draft PR linking this issue."
	];
	if (options?.handoffPath) {
		lines.push(
			`Context file: ${options.handoffPath} (org/project/id/url, and optional Seer plan).`
		);
	}
	if (options?.planText?.trim()) {
		lines.push("", "Seer plan:", options.planText.trim());
	}
	return lines.join("\n");
}

export function buildAgentCommand(
	agentKind: string | undefined,
	agentCliPath: string | undefined,
	extraArgs: string | undefined,
	prompt: string
): AgentCommand {
	const executable = (agentCliPath?.trim() || "agent");
	const kind = (agentKind?.trim().toLowerCase() || "agent");
	const baseArgs = extraArgs?.trim() ? splitArgs(extraArgs.trim()) : [];

	// Current CLIs accept an initial prompt argument for interactive sessions.
	switch (kind) {
		case "agent": // Cursor CLI
		case "claude": // Claude Code CLI
		case "codex": // Treat like generic CLI
		default:
			return { executable, args: [...baseArgs, prompt] };
	}
}

export async function writeHandoffFile(
	repositoryPath: string,
	issue: SentryIssue,
	settings: SentrySettings,
	planText?: string
): Promise<string> {
	const dir = join(repositoryPath, ".sentry-deck");
	await fs.mkdir(dir, { recursive: true });

	const handoff = {
		sentryUrl: getSentryBaseUrl(settings),
		organizationSlug: settings.organizationSlug?.trim() || "",
		projectSlug: settings.projectSlug?.trim() || "",
		issue: {
			id: issue.id,
			shortId: issue.shortId,
			title: issue.title,
			permalink: issue.permalink
		},
		planText: planText?.trim() || undefined
	};
	const handoffPath = join(dir, "handoff.json");
	await fs.writeFile(handoffPath, JSON.stringify(handoff, null, 2), "utf8");

	// Best-effort: keep .sentry-deck/ out of version control.
	try {
		const gitDir = join(repositoryPath, ".git");
		await fs.stat(gitDir);
		const ignorePath = join(repositoryPath, ".gitignore");
		let current = "";
		try {
			current = await fs.readFile(ignorePath, "utf8");
		} catch {
			// No .gitignore; skip.
		}
		if (!current.includes(".sentry-deck/")) {
			const inserted = current.endsWith("\n") || current === "" ? current : `${current}\n`;
			await fs.writeFile(ignorePath, `${inserted}.sentry-deck/\n`, "utf8");
		}
	} catch {
		// Not a git repo or ignore update failed — ignore silently.
	}

	return handoffPath;
}

export async function launchInTerminal(
	command: AgentCommand,
	repositoryPath: string,
	launcher: ProcessLauncher = launchDetached
): Promise<void> {
	const platform = getPlatform();
	const quotedCmd = shellQuote([command.executable, ...command.args]);
	const cdAndRun = `cd ${shellQuote([repositoryPath])} && ${quotedCmd}`;

	if (platform === "darwin") {
		// Open macOS Terminal and run the command.
		const osa = [
			"osascript",
			"-e",
			`tell application "Terminal" to do script ${appleScriptQuote(cdAndRun)}`
		];
		await launcher(osa[0], osa.slice(1), { windowsHide: true });
		return;
	}

	if (platform === "win32") {
		// Prefer Windows Terminal (wt.exe); fall back to start cmd.
		// Use `start` to detach from the plugin process.
		const startWt = [
			"cmd.exe",
			"/c",
			"start",
			'""',
			"wt.exe",
			"-w",
			"0",
			"nt",
			"-d",
			repositoryPath,
			command.executable,
			...command.args
		];
		try {
			await launcher(startWt[0], startWt.slice(1), { windowsHide: true });
			return;
		} catch {
			// Fallback: start in a new cmd window in repo dir.
			const startCmd = [
				"cmd.exe",
				"/c",
				"start",
				'""',
				"cmd.exe",
				"/k",
				`cd /d ${repositoryPath} && ${command.executable} ${command.args.map(quoteWin).join(" ")}`
			];
			await launcher(startCmd[0], startCmd.slice(1), { windowsHide: true });
			return;
		}
	}

	// Linux (not officially supported by manifest): try x-terminal-emulator.
	const xterm = [
		"x-terminal-emulator",
		"-e",
		"bash",
		"-lc",
		cdAndRun
	];
	await launcher(xterm[0], xterm.slice(1), { windowsHide: true });
}

function launchDetached(
	executable: string,
	args: string[],
	options?: { cwd?: string; windowsHide?: boolean; timeout?: number }
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = execFile(executable, args, {
			cwd: options?.cwd,
			windowsHide: options?.windowsHide ?? false,
			timeout: options?.timeout ?? 10_000
		}, (error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
		// Do not hold the process open; this is a launcher.
		child.unref();
	});
}

function shellQuote(parts: string[]): string {
	return parts.map((p) => `'${p.replaceAll("'", `'\\''`)}'`).join(" ");
}

function appleScriptQuote(cmd: string): string {
	// Surround with quotes, escape internal quotes for AppleScript.
	return `"${cmd.replaceAll('"', '\\"')}"`;
}

function quoteWin(value: string): string {
	// Basic Windows argument quoting.
	if (!/[ \t"]/.test(value)) {
		return value;
	}
	return `"${value.replaceAll('"', '\\"')}"`;
}

function splitArgs(value: string): string[] {
	// Simple splitter: honors quoted segments "like this".
	const result: string[] = [];
	let current = "";
	let quote: '"' | "'" | undefined;
	for (let i = 0; i < value.length; i += 1) {
		const ch = value[i]!;
		if ((ch === '"' || ch === "'") && !quote) {
			quote = ch;
			continue;
		}
		if (quote && ch === quote) {
			quote = undefined;
			continue;
		}
		if (!quote && /\s/.test(ch)) {
			if (current) {
				result.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (current) {
		result.push(current);
	}
	return result;
}

