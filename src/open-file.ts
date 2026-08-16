import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";

export type FileOpenLauncher = (
	executable: string,
	args: string[],
	options?: { windowsHide?: boolean }
) => Promise<void>;

export type EditorOpenOptions = {
	kind?: "auto" | "cursor" | "vscode" | "zed" | "xcode" | "system" | "custom";
	executable?: string;
	argsTemplate?: string;
};

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
	launcher: FileOpenLauncher = run,
	options: EditorOpenOptions = {}
): Promise<boolean> {
	let file: string;
	if (isAbsolute(relativePath)) {
		file = resolve(relativePath);
	} else {
		const parts = relativePath.split(/[/\\]+/).filter(Boolean);
		if (parts.some((p) => p === "..")) {
			return false;
		}
		file = resolve(repositoryPath, parts.join(sep));
	}
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

	const kind = options.kind ?? "auto";
	const candidates = kind === "auto"
		? ["cursor", "vscode", "zed", "system"] as const
		: [kind];
	for (const candidate of candidates) {
		try {
			const command = editorCommand(candidate, file, repositoryPath, line, options);
			await launcher(command.executable, command.args, { windowsHide: true });
			return true;
		} catch {
			// Auto mode tries the next editor. Explicit modes fail closed.
			if (kind !== "auto") {
				return false;
			}
		}
	}
	return false;
}

function editorCommand(
	kind: NonNullable<EditorOpenOptions["kind"]>,
	file: string,
	repositoryPath: string,
	line: number | undefined,
	options: EditorOpenOptions
): { executable: string; args: string[] } {
	const location = line && line > 0 ? `${file}:${line}` : file;
	const executable = options.executable?.trim();
	switch (kind) {
		case "cursor": return { executable: executable || "cursor", args: ["--goto", location] };
		case "vscode": return { executable: executable || "code", args: ["--goto", location] };
		case "zed": return { executable: executable || "zed", args: [location] };
		case "xcode": return {
			executable: executable || "xed",
			args: line && line > 0 ? ["--line", String(line), file] : [file]
		};
		case "custom": {
			if (!executable) {
				throw new Error("Custom editor executable is missing");
			}
			const template = options.argsTemplate?.trim() || "{file}";
			return {
				executable,
				args: splitTemplate(template).map((arg) => arg
					.replaceAll("{file}", file)
					.replaceAll("{line}", line && line > 0 ? String(line) : "")
					.replaceAll("{repo}", repositoryPath))
			};
		}
		case "system":
		default:
			if (process.platform === "darwin") return { executable: "open", args: [file] };
			if (process.platform === "win32") return { executable: "cmd.exe", args: ["/c", "start", "", file] };
			return { executable: "xdg-open", args: [file] };
	}
}

function splitTemplate(value: string): string[] {
	const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	return matches.map((part) => part.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2"));
}
