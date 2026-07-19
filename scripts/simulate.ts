/**
 * Headless simulator for the Sentry Stream Deck plugin.
 *
 * Renders the real key visuals (via the same createKeyImage used by the plugin)
 * into an interactive HTML page so the Error Pulse behaviour — steady backlog,
 * flash on a new issue, click-to-acknowledge, clear/error states — can be
 * exercised in a browser without a physical Stream Deck.
 *
 * Run with:  npm run sim
 */
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createKeyImage } from "../src/key-visual";

// Same visuals the Error Pulse action uses (see src/actions/error-pulse.ts).
const VISUALS = {
	SETUP: { title: "SETUP", img: createKeyImage({ background: "#271a1c", accent: "#8b6f73", label: "CONFIG" }) },
	API_ERR: { title: "API ERR", img: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "RETRY" }) },
	AUTH: { title: "AUTH", img: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "CHECK KEY" }) },
	RATE: { title: "RATE", img: createKeyImage({ background: "#2c1d08", accent: "#f59e0b", label: "SLOW DOWN" }) },
	CLEAR: { title: "CLEAR", img: createKeyImage({ background: "#10241d", accent: "#34d399", label: "QUIET" }) },
	BRIGHT: { img: createKeyImage({ background: "#500918", accent: "#ff375f", label: "ERRORS" }) },
	DIM: { img: createKeyImage({ background: "#19080d", accent: "#7f1d35", label: "ERRORS" }) },
	STEADY: { img: createKeyImage({ background: "#2a0c14", accent: "#b52c48", label: "ERRORS" }) }
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sentry Stream Deck — Simulator</title>
<style>
	:root { color-scheme: dark; }
	body { margin: 0; font: 14px/1.5 -apple-system, system-ui, sans-serif; background: #121212; color: #e6e6e6; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
	.wrap { display: flex; gap: 48px; align-items: center; flex-wrap: wrap; justify-content: center; padding: 32px; }
	.stage { display: flex; flex-direction: column; align-items: center; gap: 16px; }
	.key { position: relative; width: 216px; height: 216px; }
	.key img { width: 100%; height: 100%; display: block; }
	.title { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-weight: 700; font-size: 26px; color: #fff; text-shadow: 0 1px 3px #000; letter-spacing: .5px; }
	.state { font-size: 12px; color: #9a9a9a; }
	.panel { display: flex; flex-direction: column; gap: 10px; min-width: 240px; }
	.panel h2 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #8a8a8a; }
	button { font: inherit; padding: 10px 14px; border-radius: 8px; border: 1px solid #333; background: #1e1e1e; color: #e6e6e6; cursor: pointer; text-align: left; }
	button:hover { background: #2a2a2a; }
	button.primary { border-color: #ff375f; }
	.log { font-family: ui-monospace, monospace; font-size: 12px; background: #0c0c0c; border: 1px solid #262626; border-radius: 8px; padding: 10px; height: 150px; overflow: auto; white-space: pre-wrap; }
	.hint { font-size: 12px; color: #777; }
</style>
</head>
<body>
<div class="wrap">
	<div class="stage">
		<div class="key" id="key" title="Click to press the key">
			<img id="keyImg" alt="key" />
			<div class="title" id="keyTitle"></div>
		</div>
		<div class="state" id="stateLabel"></div>
		<div class="hint">Click the key to “press” it (acknowledges an alert).</div>
	</div>
	<div class="panel">
		<h2>Simulate poller snapshots</h2>
		<button onclick="apply('unconfigured')">Unconfigured (no settings)</button>
		<button onclick="ready(3,false)">Ready · 3 existing issues (baseline)</button>
		<button class="primary" onclick="fire()">🔴 New issue fires</button>
		<button onclick="ready(4,false)">Next poll · still 4, none new</button>
		<button onclick="ready(120,true)">Ready · 100+ issues</button>
		<button onclick="apply('clear')">All resolved (CLEAR)</button>
		<button onclick="apply('auth')">Error · 401/403 (AUTH)</button>
		<button onclick="apply('rate')">Error · 429 (RATE)</button>
		<button onclick="apply('error')">Error · other (API ERR)</button>
		<div class="log" id="log"></div>
	</div>
</div>
<script>
	const V = ${JSON.stringify(VISUALS)};
	const keyImg = document.getElementById('keyImg');
	const keyTitle = document.getElementById('keyTitle');
	const stateLabel = document.getElementById('stateLabel');
	const logEl = document.getElementById('log');

	let alerting = false;      // unacknowledged new issue
	let flashTimer = null;
	let bright = true;
	let hasIssue = false;      // an issue is available to "open"

	function log(msg){ logEl.textContent = '› ' + msg + '\\n' + logEl.textContent; }
	function setKey(img, title){ keyImg.src = img; keyTitle.textContent = title ?? ''; }

	function stopFlash(){ if (flashTimer){ clearInterval(flashTimer); flashTimer = null; } }
	function ensureFlash(){
		if (flashTimer) return;
		bright = true;
		setKey(V.BRIGHT.img, '');
		flashTimer = setInterval(() => {
			bright = !bright;
			keyImg.src = bright ? V.BRIGHT.img : V.DIM.img;
		}, 600);
	}

	function apply(kind){
		stopFlash(); alerting = false; hasIssue = false;
		if (kind === 'unconfigured'){ setKey(V.SETUP.img, V.SETUP.title); stateLabel.textContent = 'status: unconfigured'; log('unconfigured — showing SETUP'); }
		else if (kind === 'clear'){ setKey(V.CLEAR.img, V.CLEAR.title); stateLabel.textContent = 'status: ready, 0 issues'; log('backlog cleared — showing CLEAR'); }
		else if (kind === 'auth'){ setKey(V.AUTH.img, V.AUTH.title); stateLabel.textContent = 'status: error 401/403'; log('auth error — showing AUTH / CHECK KEY'); }
		else if (kind === 'rate'){ setKey(V.RATE.img, V.RATE.title); stateLabel.textContent = 'status: error 429'; log('rate limited — showing RATE / SLOW DOWN'); }
		else if (kind === 'error'){ setKey(V.API_ERR.img, V.API_ERR.title); stateLabel.textContent = 'status: error'; log('api error — showing API ERR / RETRY'); }
	}

	// A ready snapshot with N issues; newCount>0 means new issues arrived.
	function ready(count, hasMore){
		hasIssue = count > 0;
		const label = hasMore ? count + '+' : String(count);
		if (alerting){ ensureFlash(); stateLabel.textContent = 'status: ready, ' + label + ' issues (ALERTING)'; log('poll: ' + label + ' issues, still alerting → flashing'); }
		else { stopFlash(); setKey(V.STEADY.img, ''); stateLabel.textContent = 'status: ready, ' + label + ' issues (steady)'; log('poll: ' + label + ' issues, none new → steady (no flash)'); }
	}

	function fire(){
		alerting = true; hasIssue = true;
		ensureFlash();
		stateLabel.textContent = 'status: ready, NEW issue → ALERTING';
		log('🔴 new issue fired → flashing until acknowledged');
	}

	// Pressing the key: acknowledge an alert, then "open" the issue.
	document.getElementById('key').addEventListener('click', () => {
		if (alerting){ alerting = false; stopFlash(); setKey(V.STEADY.img, keyTitle.textContent); log('key pressed → acknowledged, flashing stopped'); }
		else { log('key pressed → ' + (hasIssue ? 'would open the latest issue in Sentry' : 'would open the project issues page')); }
	});

	apply('unconfigured');
</script>
</body>
</html>`;

const dir = mkdtempSync(join(tmpdir(), "sentry-sim-"));
const file = join(dir, "simulator.html");
writeFileSync(file, html);
console.log(`Simulator written to: ${file}`);
execFile("open", [file], (error) => {
	if (error) {
		console.log(`Open it manually in a browser:\n  ${file}`);
	}
});
