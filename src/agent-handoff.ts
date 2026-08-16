import { execFile, spawn } from "node:child_process";
import { platform as getPlatform } from "node:os";
import { tmpdir } from "node:os";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import type { SentryIssue } from "./sentry-api";
import type { SentrySettings } from "./settings";
import { getSentryBaseUrl } from "./settings";

export type AgentCommand = {
	executable: string;
	args: string[];
};

export type AgentLaunchResult = {
	mode: "terminal" | "codex-desktop" | "direct";
	/** Desktop app launch opens the workspace and places the prompt on the clipboard. */
	requiresPromptPaste?: boolean;
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
	options?: { planText?: string; handoffPath?: string; requestDraftPr?: boolean }
): string {
	const lines: string[] = [
		`Sentry issue ${issue.shortId}: ${issue.title} (${issue.permalink}).`,
		"Use Sentry MCP get_issue_details and analyze_issue_with_seer (or the Sentry CLI if MCP is unavailable).",
		"Identify root cause. Smallest safe fix in the right files.",
		"Add or update a regression test."
	];
	if (options?.requestDraftPr) {
		lines.push(
			"There may already be uncommitted local changes for this issue. Preserve and inspect them; do not reset or discard them.",
			"Validate the intended changes, commit them on an appropriate branch, push, and open a draft PR linking this issue."
		);
	}
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
	// Keep handoff metadata out of the user's worktree. Prefer the repository's
	// private Git metadata; use the OS temp directory for worktrees/non-Git repos.
	let dir = join(tmpdir(), "sentry-stream-deck", issue.id.replace(/[^A-Za-z0-9._-]/g, "_"));
	try {
		const gitDir = join(repositoryPath, ".git");
		if ((await fs.stat(gitDir)).isDirectory()) {
			dir = join(gitDir, "sentry-deck");
		}
	} catch {
		// Non-Git repository or linked worktree: use the temp location.
	}
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

	return handoffPath;
}

export async function launchAgent(
	command: AgentCommand,
	repositoryPath: string,
	settings: SentrySettings,
	launcher: ProcessLauncher = launchDetached,
	clipboardWriter: (text: string) => Promise<void> = copyToClipboard
): Promise<AgentLaunchResult> {
	const mode = settings.agentLaunchMode ?? "terminal";
	if (mode === "codex-desktop") {
		const configuredKind = settings.agentKind?.trim().toLowerCase();
		const executableName = command.executable.split(/[/\\]/).at(-1)?.toLowerCase() ?? "";
		if (configuredKind !== "codex" && !executableName.includes("codex")) {
			throw new Error("Codex Desktop launch mode requires Agent Kind = codex");
		}
		const prompt = command.args.at(-1) ?? "";
		await clipboardWriter(prompt);
		await launcher(command.executable, ["app", repositoryPath], {
			cwd: repositoryPath,
			windowsHide: true
		});
		return { mode, requiresPromptPaste: true };
	}
	if (mode === "direct") {
		await launcher(command.executable, command.args, {
			cwd: repositoryPath,
			windowsHide: true
		});
		return { mode };
	}

	await launchInTerminal(command, repositoryPath, settings, launcher);
	return { mode: "terminal" };
}

export async function launchInTerminal(
	command: AgentCommand,
	repositoryPath: string,
	settings: SentrySettings = {},
	launcher: ProcessLauncher = launchDetached
): Promise<void> {
	const platform = getPlatform();
	const quotedCmd = shellQuote([command.executable, ...command.args]);
	const cdAndRun = `cd ${shellQuote([repositoryPath])} && ${quotedCmd}`;

	if (platform === "darwin") {
		const terminalKind = await resolveMacTerminal(settings.terminalKind ?? "auto");
		if (terminalKind === "ghostty") {
			const script = [
				'tell application "Ghostty"',
				"set launchConfig to new surface configuration",
				`set initial working directory of launchConfig to ${appleScriptQuote(repositoryPath)}`,
				`set command of launchConfig to ${appleScriptQuote(quotedCmd)}`,
				"set wait after command of launchConfig to true",
				"new window with configuration launchConfig",
				"activate",
				"end tell"
			].join("\n");
			await launcher("osascript", ["-e", script], { windowsHide: true });
			return;
		}
		if (terminalKind === "iterm") {
			const script = [
				'tell application "iTerm2"',
				"activate",
				"if (count of windows) = 0 then",
				`create window with default profile command ${appleScriptQuote(cdAndRun)}`,
				"else",
				`tell current window to create tab with default profile command ${appleScriptQuote(cdAndRun)}`,
				"end if",
				"end tell"
			].join("\n");
			await launcher("osascript", ["-e", script], { windowsHide: true });
			return;
		}
		if (terminalKind === "custom" && settings.terminalApp?.trim()) {
			await launcher("open", [
				"-na",
				settings.terminalApp.trim(),
				"--args",
				"-e",
				"/bin/zsh",
				"-lc",
				cdAndRun
			], { windowsHide: true });
			return;
		}

		// Default macOS Terminal integration.
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
			quoteWin(repositoryPath),
			quoteWin(command.executable),
			...command.args.map(quoteWin)
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
				`cd /d ${quoteWin(repositoryPath)} && ${quoteWin(command.executable)} ${command.args.map(quoteWin).join(" ")}`
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
		const child = spawn(executable, args, {
			cwd: options?.cwd,
			windowsHide: options?.windowsHide ?? false,
			detached: true,
			stdio: "ignore"
		});
		child.once("error", reject);
		child.once("spawn", resolve);
		child.unref();
	});
}

async function resolveMacTerminal(
	configured: NonNullable<SentrySettings["terminalKind"]>
): Promise<NonNullable<SentrySettings["terminalKind"]>> {
	if (configured !== "auto") {
		return configured;
	}
	try {
		await fs.access("/Applications/Ghostty.app");
		return "ghostty";
	} catch {
		return "terminal";
	}
}

function copyToClipboard(value: string): Promise<void> {
	if (getPlatform() !== "darwin") {
		return Promise.reject(new Error("Codex Desktop clipboard handoff is currently supported on macOS only"));
	}
	return new Promise((resolve, reject) => {
		const child = execFile("pbcopy", (error) => error ? reject(error) : resolve());
		child.stdin?.end(value);
	});
}

function shellQuote(parts: string[]): string {
	return parts.map((p) => `'${p.replaceAll("'", `'\\''`)}'`).join(" ");
}

function appleScriptQuote(cmd: string): string {
	// Surround with quotes, escape internal quotes for AppleScript.
	return `"${cmd.replaceAll('"', '\\"')}"`;
}

export function quoteWin(value: string): string {
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
