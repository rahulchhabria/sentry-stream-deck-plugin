import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openInEditorOrSystem, type FileOpenLauncher } from "./open-file";

const noop: FileOpenLauncher = async () => {};

async function withRepo<T>(fn: (repo: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "repo-"));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

test("rejects path traversal segments outside the repository", async () => {
	await withRepo(async (repo) => {
		await mkdir(join(repo, "safe", "sub"), { recursive: true });
		await writeFile(join(repo, "safe", "sub", "file.txt"), "ok", "utf8");
		let launched = 0;
		const launcher: FileOpenLauncher = async () => { launched += 1; };
		// Attempt to escape with ../ and then back into repo — should be rejected.
		const ok = await openInEditorOrSystem(repo, "../safe/sub/file.txt", undefined, launcher);
		assert.equal(ok, false);
		assert.equal(launched, 0);
	});
});

test("rejects absolute paths", async () => {
	await withRepo(async (repo) => {
		const ok = await openInEditorOrSystem(repo, "/etc/passwd", undefined, noop);
		assert.equal(ok, false);
	});
});

test("opens a repository file in the configured VS Code CLI at the source line", async () => {
	await withRepo(async (repo) => {
		const file = join(repo, "src", "app.ts");
		await mkdir(join(repo, "src"));
		await writeFile(file, "throw new Error();", "utf8");
		const calls: Array<{ executable: string; args: string[] }> = [];
		const ok = await openInEditorOrSystem(
			repo,
			"src/app.ts",
			42,
			async (executable, args) => { calls.push({ executable, args }); },
			{ kind: "vscode", executable: "/opt/bin/code" }
		);
		assert.equal(ok, true);
		assert.deepEqual(calls[0], {
			executable: "/opt/bin/code",
			args: ["--goto", `${file}:42`]
		});
	});
});

test("accepts absolute source paths only when they remain inside the repository", async () => {
	await withRepo(async (repo) => {
		const file = join(repo, "app.ts");
		await writeFile(file, "ok", "utf8");
		const ok = await openInEditorOrSystem(repo, file, undefined, noop, { kind: "system" });
		assert.equal(ok, true);
	});
});
