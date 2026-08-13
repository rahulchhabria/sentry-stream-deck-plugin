import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

