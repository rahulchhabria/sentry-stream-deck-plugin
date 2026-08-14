import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";

export type FileOpenLauncher = (
	executable: string,
	args: string[],
	options?: { windowsHide?: boolean }
) => Promise<void>;

async function run(
	executable: string,
	args: string[],
	options?: { windowsHide?: boolean }
): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(executable, args, { windowsHide: options?.windowsHide ?? true }, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

/**
 * Best-effort: try Cursor CLI if available, else platform opener. Returns true
 * when some open command was attempted successfully.
 */
export async function openInEditorOrSystem(
	repositoryPath: string,
	relativePath: string,
	line?: number,
	launcher: FileOpenLauncher = run
): Promise<boolean> {
	// Reject absolute paths and traversal segments.
	if (isAbsolute(relativePath)) {
		return false;
	}
	const parts = relativePath.split(/[/\\]+/).filter(Boolean);
	if (parts.some((p) => p === "..")) {
		return false;
	}
	// Normalise separators and resolve to an absolute path.
	const normalised = parts.join(sep);
	const file = resolve(repositoryPath, normalised);
	// Verify the resolved path stays under the repository path.
	const rel = relative(repositoryPath, file);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		return false;
	}
	try {
		await access(file);
	} catch {
		return false;
	}

	// Prefer Cursor CLI if on PATH.
	try {
		const arg = line && line > 0 ? `${file}:${line}` : file;
		await launcher("cursor", [arg], { windowsHide: true });
		return true;
	} catch {
		// Fallback: OS opener
		const platform = process.platform;
		try {
			if (platform === "darwin") {
				await launcher("open", [file], { windowsHide: true });
				return true;
			}
			if (platform === "win32") {
				await launcher("cmd.exe", ["/c", "start", "", file], { windowsHide: true });
				return true;
			}
			await launcher("xdg-open", [file], { windowsHide: true });
			return true;
		} catch {
			return false;
		}
	}
}
