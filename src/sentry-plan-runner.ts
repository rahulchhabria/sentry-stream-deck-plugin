import { execFile } from "node:child_process";

export type SentryPlanCommand = {
	executable: string;
	repositoryPath: string;
	organizationSlug: string;
	issueShortId: string;
};

export type ProcessExecutor = (
	executable: string,
	args: string[],
	options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean }
) => Promise<{ stdout: string; stderr: string }>;

const PLAN_TIMEOUT_MS = 5 * 60_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Runs Seer's read-only planning command for one stable issue id. */
export async function runSentryPlan(
	command: SentryPlanCommand,
	execute: ProcessExecutor = executeFile
): Promise<string> {
	const executable = command.executable.trim();
	const repositoryPath = command.repositoryPath.trim();
	const organizationSlug = command.organizationSlug.trim();
	const issueShortId = command.issueShortId.trim();
	if (!executable || !repositoryPath || !organizationSlug || !issueShortId) {
		throw new Error("Sentry plan command is missing required configuration");
	}

	const { stdout, stderr } = await execute(
		executable,
		["issue", "plan", `${organizationSlug}/${issueShortId}`],
		{
			cwd: repositoryPath,
			timeout: PLAN_TIMEOUT_MS,
			maxBuffer: MAX_OUTPUT_BYTES,
			windowsHide: true
		}
	);
	const output = stripAnsi(stdout).trim();
	if (!output) {
		throw new Error(stripAnsi(stderr).trim() || "Sentry CLI returned an empty plan");
	}
	return output;
}

function executeFile(
	executable: string,
	args: string[],
	options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean }
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(executable, args, { ...options, encoding: "utf8" }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stripAnsi(stderr).trim() || error.message, { cause: error }));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

function stripAnsi(value: string): string {
	return value.replaceAll(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
