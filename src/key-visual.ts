type KeyVisual = {
	background: string;
	accent: string;
	label: string;
};

export function createKeyImage(visual: KeyVisual): string {
	const label = escapeXml(visual.label.slice(0, 12));
	const svg = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
		`<rect width="144" height="144" rx="22" fill="${visual.background}"/>`,
		`<circle cx="72" cy="58" r="28" fill="${visual.accent}" opacity=".18"/>`,
		`<circle cx="72" cy="58" r="18" fill="${visual.accent}"/>`,
		`<path d="M62 58h20M72 48v20" stroke="${visual.background}" stroke-width="7" stroke-linecap="round"/>`,
		`<text x="72" y="112" fill="#fff" font-family="Arial,sans-serif" font-size="16" font-weight="700" text-anchor="middle">${label}</text>`,
		"</svg>"
	].join("");

	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
