import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createActionIconSvg, type ActionIconName } from "../src/key-visual";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "assets", "streamdeck-icons");
const icons: Array<{ name: ActionIconName; color: string }> = [
	{ name: "pulse", color: "#ff375f" },
	{ name: "inspect", color: "#a78bfa" },
	{ name: "next", color: "#60a5fa" },
	{ name: "agent", color: "#ff3d9a" },
	{ name: "pr", color: "#38bdf8" },
	{ name: "resolve", color: "#34d399" }
];

await mkdir(output, { recursive: true });
await Promise.all(icons.flatMap(({ name, color }) => [
	writeFile(
		join(output, `${name}-normal.svg`),
		`${createActionIconSvg(name, { color })}\n`,
		"utf8"
	),
	writeFile(
		join(output, `${name}-glow.svg`),
		`${createActionIconSvg(name, { color, glow: true })}\n`,
		"utf8"
	)
]));

console.log(`Exported ${icons.length * 2} icons to ${output}`);
