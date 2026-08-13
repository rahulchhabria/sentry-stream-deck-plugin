import { execFile } from "node:child_process";

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

export type LoopState = "idle" | "sent" | "draft" | "ci" | "fail" | "merged";
export type LoopStatus = { state: LoopState; url?: string };

/**
 * Best-effort PR detection using the GitHub CLI: looks for any PR in the
 * repository whose title mentions the Sentry shortId.
 *
 * Returns:
 * - draft: PR exists and is a draft
 * - merged: PR is merged
 * - ci: PR exists and checks are pending/running
 * - fail: PR exists and checks failed
 * - sent: no PR found yet
 */
export async function detectPrStatus(
	repositoryPath: string,
	shortId: string,
	runner: GhRunner = run
): Promise<LoopStatus> {
	try {
		const list = await runner("gh", [
			"pr",
			"list",
			"--state",
			"all",
			"--json",
			"number,title,url,isDraft",
			"-L",
			"50"
		], { cwd: repositoryPath, windowsHide: true });
		const prs = JSON.parse(list.stdout) as Array<{ number: number; title: string; url: string; isDraft?: boolean }>;
		const match = prs.find((p) => typeof p.title === "string" && p.title.includes(shortId));
		if (!match) {
			return { state: "sent" };
		}
		const view = await runner("gh", [
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
			statusCheckRollup?: Array<{ state?: string; conclusion?: string }>;
		};
		if (data.mergedAt) {
			return { state: "merged", url: data.url ?? match.url };
		}
		if (data.isDraft) {
			return { state: "draft", url: data.url ?? match.url };
		}
		const checks = data.statusCheckRollup ?? [];
		const states = checks.map((c) => (c.conclusion || c.state || "").toUpperCase());
		if (states.some((s) => ["FAILURE", "FAILED", "ERROR", "CANCELLED", "TIMED_OUT"].includes(s))) {
			return { state: "fail", url: data.url ?? match.url };
		}
		if (checks.length > 0 || ["OPEN", "QUEUED"].includes((data.state || "").toUpperCase())) {
			return { state: "ci", url: data.url ?? match.url };
		}
		return { state: "ci", url: data.url ?? match.url };
	} catch {
		// gh not present or error: treat as "sent" (handoff happened, no PR yet).
		return { state: "sent" };
	}
}

