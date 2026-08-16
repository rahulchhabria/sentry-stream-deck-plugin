import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

export type GhRunner = (
	executable: string,
	args: string[],
	options?: { cwd?: string; windowsHide?: boolean; timeout?: number }
) => Promise<{ stdout: string }>;

async function run(
	executable: string,
	args: string[],
	options?: { cwd?: string; windowsHide?: boolean; timeout?: number }
): Promise<{ stdout: string }> {
	return new Promise((resolve, reject) => {
		execFile(executable, args, {
			cwd: options?.cwd,
			windowsHide: options?.windowsHide ?? true,
			timeout: options?.timeout ?? 10_000
		}, (error, stdout) => {
			if (error) reject(error);
			else resolve({ stdout: String(stdout ?? "") });
		});
	});
}

export type LoopState = "none" | "draft" | "ci" | "ready" | "fail" | "merged" | "closed" | "error";
export type LoopStatus = { state: LoopState; url?: string; message?: string };

/**
 * Best-effort PR detection using the GitHub CLI: looks for any PR in the
 * repository whose title, body, or branch mentions the Sentry shortId.
 *
 * Returns:
 * - draft: PR exists and is a draft
 * - merged: PR is merged
 * - ci: PR exists and checks are pending/running
 * - fail: PR exists and checks failed
 * - none: no PR found yet
 */
export async function detectPrStatus(
	repositoryPath: string,
	shortId: string,
	runner: GhRunner = run,
	configuredExecutable?: string
): Promise<LoopStatus> {
	try {
		const executable = configuredExecutable?.trim() || await resolveGitHubCli();
		const list = await runner(executable, [
			"pr",
			"list",
			"--state",
			"all",
			"--search",
			shortId,
			"--json",
			"number,title,url,isDraft,body,headRefName",
			"-L",
			"100"
		], { cwd: repositoryPath, windowsHide: true });
		const prs = JSON.parse(list.stdout) as Array<{
			number: number;
			title: string;
			url: string;
			isDraft?: boolean;
			body?: string;
			headRefName?: string;
		}>;
		const match = prs.find((pr) => [pr.title, pr.body, pr.headRefName].some(
			(value) => typeof value === "string" && containsIssueId(value, shortId)
		));
		if (!match) {
			return { state: "none" };
		}
		const view = await runner(executable, [
			"pr",
			"view",
			String(match.number),
			"--json",
			"isDraft,state,mergedAt,statusCheckRollup,url"
		], { cwd: repositoryPath, windowsHide: true });
		const data = JSON.parse(view.stdout) as {
			isDraft?: boolean;
			state?: string;
			mergedAt?: string | null;
			url?: string;
			statusCheckRollup?: Array<{ state?: string; status?: string; conclusion?: string }>;
		};
		if (data.mergedAt) {
			return { state: "merged", url: data.url ?? match.url };
		}
		if (data.isDraft) {
			return { state: "draft", url: data.url ?? match.url };
		}
		if ((data.state || "").toUpperCase() === "CLOSED") {
			return { state: "closed", url: data.url ?? match.url };
		}
		const checks = data.statusCheckRollup ?? [];
		const states = checks.map((c) => (c.conclusion || c.state || c.status || "").toUpperCase());
		if (states.some((s) => ["FAILURE", "FAILED", "ERROR", "CANCELLED", "TIMED_OUT"].includes(s))) {
			return { state: "fail", url: data.url ?? match.url };
		}
		if (states.some((s) => !s || ["PENDING", "QUEUED", "IN_PROGRESS", "REQUESTED", "WAITING"].includes(s))) {
			return { state: "ci", url: data.url ?? match.url };
		}
		return { state: "ready", url: data.url ?? match.url };
	} catch (error) {
		const message = error instanceof Error ? error.message : "GitHub CLI failed";
		return { state: "error", message };
	}
}

async function resolveGitHubCli(): Promise<string> {
	if (process.platform !== "darwin") {
		return "gh";
	}
	for (const candidate of ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"]) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the next common installation path before relying on PATH.
		}
	}
	return "gh";
}

function containsIssueId(value: string, shortId: string): boolean {
	const escaped = shortId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(value);
}
