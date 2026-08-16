import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
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
	/** Test seam for platform-specific editor application fallbacks. */
	platform?: NodeJS.Platform;
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
	let canonicalRepository: string;
	let canonicalFile: string;
	try {
		[canonicalRepository, canonicalFile] = await Promise.all([
			realpath(repositoryPath),
			realpath(file)
		]);
	} catch {
		return false;
	}
	// Compare canonical paths so a symlink inside the repository cannot escape it.
	const rel = relative(canonicalRepository, canonicalFile);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		return false;
	}
	// Launch the verified canonical target so the editor does not follow a
	// subsequently swapped symlink after the boundary check.
	file = canonicalFile;

	const kind = options.kind ?? "auto";
	const candidates = kind === "auto"
		? ["cursor", "vscode", "zed", "system"] as const
		: [kind];
	for (const candidate of candidates) {
		for (const command of editorCommands(candidate, file, repositoryPath, line, options)) {
			try {
				await launcher(command.executable, command.args, { windowsHide: true });
				return true;
			} catch {
				// Try a macOS application adapter or the next auto-detected editor.
			}
		}
		if (kind !== "auto") {
			return false;
		}
	}
	return false;
}

function editorCommands(
	kind: NonNullable<EditorOpenOptions["kind"]>,
	file: string,
	repositoryPath: string,
	line: number | undefined,
	options: EditorOpenOptions
): Array<{ executable: string; args: string[] }> {
	const location = line && line > 0 ? `${file}:${line}` : file;
	const executable = options.executable?.trim();
	const platform = options.platform ?? process.platform;
	switch (kind) {
		case "cursor": return executable
			? [{ executable, args: ["--goto", location] }]
			: withMacApp({ executable: "cursor", args: ["--goto", location] }, "Cursor", ["--goto", location], platform);
		case "vscode": return executable
			? [{ executable, args: ["--goto", location] }]
			: withMacApp(
				{ executable: "code", args: ["--goto", location] },
				"Visual Studio Code",
				["--goto", location],
				platform
			);
		case "zed": return executable
			? [{ executable, args: [location] }]
			: withMacApp({ executable: "zed", args: [location] }, "Zed", [location], platform);
		case "xcode": return withMacApp({
			executable: executable || "xed",
			args: line && line > 0 ? ["--line", String(line), file] : [file]
		}, "Xcode", [file], platform, Boolean(executable));
		case "custom": {
			if (!executable) {
				throw new Error("Custom editor executable is missing");
			}
			const template = options.argsTemplate?.trim() || "{file}";
			return [{
				executable,
				args: splitTemplate(template).map((arg) => arg
					.replaceAll("{file}", file)
					.replaceAll("{line}", line && line > 0 ? String(line) : "")
					.replaceAll("{repo}", repositoryPath))
			}];
		}
		case "system":
		default:
			if (platform === "darwin") return [{ executable: "open", args: [file] }];
			if (platform === "win32") return [{ executable: "cmd.exe", args: ["/c", "start", "", file] }];
			return [{ executable: "xdg-open", args: [file] }];
	}
}

function withMacApp(
	cli: { executable: string; args: string[] },
	appName: string,
	appArgs: string[],
	platform: NodeJS.Platform,
	explicitExecutable = false
): Array<{ executable: string; args: string[] }> {
	if (platform !== "darwin" || explicitExecutable) {
		return [cli];
	}
	return [cli, { executable: "open", args: ["-a", appName, "--args", ...appArgs] }];
}

function splitTemplate(value: string): string[] {
	const matches = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	return matches.map((part) => part.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2"));
}
