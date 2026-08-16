type KeyVisual = {
	background: string;
	accent: string;
	label: string;
};

export type ActionIconName = "pulse" | "inspect" | "code" | "agent" | "pr" | "resolve";

type ActionIconOptions = {
	color: string;
	glow?: boolean;
	dimmed?: boolean;
	label?: string;
	value?: string;
};

const ACTION_LABELS: Record<ActionIconName, string> = {
	pulse: "NEW ISSUE",
	inspect: "INSPECT",
	code: "CODE",
	agent: "AGENT",
	pr: "VIEW PR",
	resolve: "RESOLVE"
};

const ACTION_GLYPHS: Record<ActionIconName, string> = {
	pulse: [
		'<path fill="currentColor" stroke="none" d="M160.654 61.211c-1.663-2.761-4.012-5.045-6.818-6.63-2.807-1.586-5.975-2.419-9.198-2.419s-6.392.833-9.198 2.419c-2.807 1.585-5.155 3.869-6.819 6.63l-26.347 45.127c20.128 10.049 37.278 25.189 49.746 43.915 12.468 18.727 19.82 40.389 21.328 62.836h-18.5c-1.504-19.241-8.007-37.756-18.864-53.712-10.858-15.956-25.694-28.801-43.04-37.263l-24.385 42.164c9.751 4.374 18.246 11.129 24.704 19.644 6.459 8.515 10.672 18.517 12.254 29.087H63.033a3.01 3.01 0 0 1-2.443-4.445l11.732-20.021a58.68 58.68 0 0 0-13.454-7.607l-11.652 20.02a18.4 18.4 0 0 0 6.767 24.986 18.42 18.42 0 0 0 9.05 2.403h58.18c1.081-13.334-1.3-26.72-6.912-38.864-5.612-12.143-14.265-22.631-25.121-30.448l9.25-16.017c13.7 9.41 24.709 22.229 31.942 37.193 7.233 14.964 10.438 31.555 9.301 48.136h49.291c1.148-25.118-4.317-50.098-15.847-72.443-11.531-22.344-28.724-41.271-49.862-54.89l18.7-32.033a3.05 3.05 0 0 1 4.204-1.081c2.123 1.161 81.245 139.225 82.727 140.826a3.08 3.08 0 0 1-2.723 4.525h-19.06c.24 5.099.24 10.184 0 15.256h19.14a18.5 18.5 0 0 0 18.499-18.459 18.1 18.1 0 0 0-2.483-9.13L160.654 61.211Z"/>'
	].join(""),
	inspect: [
		'<path d="M96 62H66a18 18 0 0 0-18 18v30"/>',
		'<path d="M192 62h30a18 18 0 0 1 18 18v30"/>',
		'<path d="M96 226H66a18 18 0 0 1-18-18v-30"/>',
		'<path d="M192 226h30a18 18 0 0 0 18-18v-30"/>',
		'<circle cx="144" cy="144" r="28" fill="currentColor" stroke="none"/>'
	].join(""),
	code: [
		'<path d="m112 88-56 56 56 56"/>',
		'<path d="m176 88 56 56-56 56"/>',
		'<path d="m162 66-36 156"/>'
	].join(""),
	agent: [
		'<rect x="62" y="78" width="164" height="140" rx="32"/>',
		'<path d="M144 78V50"/>',
		'<circle cx="144" cy="40" r="10" fill="currentColor" stroke="none"/>',
		'<circle cx="112" cy="136" r="10" fill="currentColor" stroke="none"/>',
		'<circle cx="176" cy="136" r="10" fill="currentColor" stroke="none"/>',
		'<path d="M108 178h72"/>'
	].join(""),
	pr: [
		'<circle cx="82" cy="64" r="16"/>',
		'<circle cx="82" cy="216" r="16"/>',
		'<circle cx="214" cy="216" r="16"/>',
		'<path d="M82 80v120"/>',
		'<path d="M214 200V108c0-24-20-44-44-44h-42"/>',
		'<path d="m154 36-28 28 28 28"/>'
	].join(""),
	resolve: [
		'<circle cx="144" cy="144" r="92"/>',
		'<path d="m94 146 34 34 68-76"/>'
	].join("")
};

export function createActionIcon(name: ActionIconName, options: ActionIconOptions): string {
	return svgDataUri(createActionIconSvg(name, options));
}

export function createActionIconSvg(name: ActionIconName, options: ActionIconOptions): string {
	const color = escapeXml(options.color);
	const opacity = options.dimmed ? ".42" : "1";
	const label = escapeXml(options.label ?? ACTION_LABELS[name]);
	const value = options.value?.trim() ? escapeXml(options.value.trim()) : undefined;
	const strokeWidth = 16;
	const renderGlyph = (glyphColor: string, attributes = ""): string => [
		`<g fill="none" stroke="${glyphColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" transform="translate(31 -16) scale(.78)" ${attributes}>`,
		ACTION_GLYPHS[name].replaceAll("currentColor", glyphColor),
		"</g>"
	].join("");
	const glowLayers = options.glow
		? [
			renderGlyph(color, 'filter="url(#blur44)" opacity=".9"'),
			renderGlyph(color, 'filter="url(#blur20)"'),
			renderGlyph(color, 'filter="url(#blur9)"'),
			renderGlyph(color, 'filter="url(#blur4)"')
		].join("")
		: renderGlyph(color, 'filter="url(#blur4)" opacity=".48"');

	return [
		'<svg xmlns="http://www.w3.org/2000/svg" width="288" height="288" viewBox="0 0 288 288">',
		'<rect width="288" height="288" fill="#000"/>',
		'<defs>',
		'<filter id="blur44" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="44"/></filter>',
		'<filter id="blur20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>',
		'<filter id="blur9" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>',
		'<filter id="blur4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>',
		'</defs>',
		glowLayers,
		renderGlyph("#fff", `opacity="${opacity}"`),
		value
			? `<text x="144" y="237" fill="#fff" opacity=".94" font-family="Arial,sans-serif" font-size="27" font-weight="700" letter-spacing=".2" text-anchor="middle">${label}</text><text x="144" y="271" fill="#fff" opacity=".94" font-family="Arial,sans-serif" font-size="27" font-weight="700" text-anchor="middle">${value}</text>`
			: `<text x="144" y="264" fill="#fff" opacity=".94" font-family="Arial,sans-serif" font-size="30" font-weight="700" letter-spacing=".2" text-anchor="middle">${label}</text>`,
		'</svg>'
	].join("");
}

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

	return svgDataUri(svg);
}

function svgDataUri(svg: string): string {
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
