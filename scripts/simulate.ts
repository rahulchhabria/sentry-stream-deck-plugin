/**
 * Browser preview for the complete six-key Stream Deck workflow.
 *
 * This uses the production icon renderer and mirrors user-visible transitions.
 * It is not a replacement for hardware, Mobile, or a Virtual Device.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createActionIcon } from "../src/key-visual";

const icons = {
	pulse: {
		idle: createActionIcon("pulse", { color: "#ff375f" }),
		alerts: Array.from({ length: 9 }, (_, index) => createActionIcon("pulse", {
			color: "#ff375f",
			glow: true,
			value: String(index + 1)
		})),
		quiet: createActionIcon("pulse", { color: "#34d399" }),
		mute: createActionIcon("pulse", { color: "#10b981", dimmed: true, label: "MUTE" }),
		auth: createActionIcon("pulse", { color: "#f59e0b", glow: true, label: "AUTH" })
	},
	inspect: {
		idle: createActionIcon("inspect", { color: "#a78bfa" }),
		none: createActionIcon("inspect", { color: "#60646c", dimmed: true })
	},
	code: {
		idle: createActionIcon("code", { color: "#60a5fa" }),
		working: createActionIcon("code", { color: "#60a5fa", glow: true, label: "OPENING" }),
		done: createActionIcon("code", { color: "#34d399", glow: true, label: "OPEN" })
	},
	agent: {
		idle: createActionIcon("agent", { color: "#ff3d9a" }),
		working: createActionIcon("agent", { color: "#ff3d9a", glow: true, label: "RUN" }),
		done: createActionIcon("agent", { color: "#34d399", glow: true, label: "SENT" })
	},
	pr: {
		idle: createActionIcon("pr", { color: "#60646c", dimmed: true }),
		none: createActionIcon("pr", { color: "#38bdf8", label: "NO PR" }),
		draft: createActionIcon("pr", { color: "#a78bfa", glow: true, label: "DRAFT" }),
		ci: createActionIcon("pr", { color: "#38bdf8", glow: true, label: "CI" }),
		ready: createActionIcon("pr", { color: "#34d399", glow: true, label: "READY" }),
		fail: createActionIcon("pr", { color: "#f59e0b", glow: true, label: "FAIL" })
	},
	resolve: {
		idle: createActionIcon("resolve", { color: "#34d399" }),
		confirm: createActionIcon("resolve", { color: "#f59e0b", glow: true, label: "CONFIRM" }),
		archive: createActionIcon("resolve", { color: "#f59e0b", glow: true, label: "ARCHIVE?" }),
		done: createActionIcon("resolve", { color: "#34d399", glow: true, label: "RESOLVED" }),
		archived: createActionIcon("resolve", { color: "#34d399", glow: true, label: "ARCHIVED" })
	}
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sentry Stream Deck Preview</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#111;color:#eee;font:14px/1.45 -apple-system,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}.wrap{display:flex;gap:42px;align-items:center;padding:32px;flex-wrap:wrap;justify-content:center}.deck{display:grid;grid-template-columns:repeat(3,144px);gap:14px;padding:22px;background:#080808;border:1px solid #333;border-radius:28px;box-shadow:0 24px 80px #000}.key{width:144px;height:144px;border:0;padding:0;background:#000;border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:inset 0 0 0 1px #333}.key:focus-visible{outline:3px solid #fff;outline-offset:3px}.key img{display:block;width:100%;height:100%}.panel{width:290px;display:grid;gap:10px}.panel h1{font-size:18px;margin:0}.panel p{color:#aaa;margin:0 0 8px}.controls{display:flex;gap:8px;flex-wrap:wrap}.controls button{background:#242424;color:#eee;border:1px solid #444;border-radius:8px;padding:8px 10px;cursor:pointer}.log{height:170px;overflow:auto;white-space:pre-wrap;background:#080808;border:1px solid #333;border-radius:10px;padding:10px;font:12px/1.4 ui-monospace,monospace}
</style></head><body><main class="wrap">
<section class="deck" aria-label="Six-key Stream Deck preview">
<button class="key" data-action="pulse" aria-label="New Issue"><img alt="New Issue"></button>
<button class="key" data-action="inspect" aria-label="Inspect"><img alt="Inspect"></button>
<button class="key" data-action="code" aria-label="Code"><img alt="Code"></button>
<button class="key" data-action="agent" aria-label="Agent"><img alt="Agent"></button>
<button class="key" data-action="pr" aria-label="View PR"><img alt="View PR"></button>
<button class="key" data-action="resolve" aria-label="Resolve"><img alt="Resolve"></button>
</section>
<section class="panel"><h1>Six-key workflow preview</h1><p>Click for a short press; hold for 700ms to preview long-press behavior. This does not call Sentry, GitHub, or a coding agent.</p>
<div class="controls"><button data-control="new">New issue</button><button data-control="clear">Clear backlog</button><button data-control="auth">Auth error</button></div>
<div class="controls"><button data-pr="none">No PR</button><button data-pr="draft">Draft</button><button data-pr="ci">CI</button><button data-pr="ready">Ready</button><button data-pr="fail">Fail</button></div>
<div id="log" class="log" aria-live="polite"></div></section>
</main><script>
const icons=${JSON.stringify(icons)};
const state={issues:1,pending:0,muted:false,auth:false,pr:'none',confirm:null};
const logEl=document.getElementById('log');
function log(message){logEl.textContent='› '+message+'\\n'+logEl.textContent}
function image(action){
 if(action==='pulse'){if(state.auth)return icons.pulse.auth;if(state.muted)return icons.pulse.mute;if(state.pending>0)return icons.pulse.alerts[Math.min(state.pending,9)-1];return state.issues?icons.pulse.idle:icons.pulse.quiet}
 if(action==='inspect')return state.issues?icons.inspect.idle:icons.inspect.none;
 if(action==='code')return state.issues?icons.code.idle:icons.inspect.none;
 if(action==='agent')return state.issues?icons.agent.idle:icons.inspect.none;
 if(action==='pr')return state.issues?icons.pr[state.pr]:icons.pr.idle;
 return state.issues?icons.resolve.idle:icons.inspect.none;
}
function render(){document.querySelectorAll('.key').forEach(key=>{key.querySelector('img').src=image(key.dataset.action)})}
function temporary(action,src,delay=850){const key=document.querySelector('[data-action="'+action+'"] img');key.src=src;setTimeout(render,delay)}
let confirmationTimer;
function armConfirmation(kind,image,message){clearTimeout(confirmationTimer);state.confirm=kind;temporary('resolve',image,3000);confirmationTimer=setTimeout(()=>{if(state.confirm===kind)state.confirm=null},3000);log(message)}
function shortPress(action){
 if(action==='pulse'){if(state.pending>0){state.pending--;log('Selected one new issue; '+state.pending+' pending')}else{log(state.issues?'Selected the newest unresolved issue':'No issue to select')}render();return}
 if(!state.issues){log(action+': no selected issue');return}
 if(action==='inspect'){log('Would open the selected Sentry issue');return}
 if(action==='code'){temporary('code',icons.code.working,450);setTimeout(()=>temporary('code',icons.code.done),450);log('Would resolve and open the best local frame');return}
 if(action==='agent'){temporary('agent',icons.agent.working,450);setTimeout(()=>temporary('agent',icons.agent.done),450);log('Would launch the configured coding agent');return}
 if(action==='pr'){if(state.pr==='none'){temporary('pr',icons.agent.working);log('Would ask the agent to create a draft PR')}else log('Would open the matched active PR');return}
 if(action==='resolve'){if(state.confirm==='resolve'){clearTimeout(confirmationTimer);state.issues=Math.max(0,state.issues-1);state.confirm=null;temporary('resolve',icons.resolve.done);log('Resolved the selected issue')}else{armConfirmation('resolve',icons.resolve.confirm,'Press Resolve again within 3 seconds to confirm')}}
}
function longPress(action){if(action==='pulse'){state.muted=!state.muted;log(state.muted?'New Issue muted':'New Issue unmuted');render();return}if(action==='agent'){temporary('agent',icons.agent.working);log('Would launch the agent with a draft-PR request');return}if(action==='resolve'){if(state.confirm==='archive'){clearTimeout(confirmationTimer);state.issues=Math.max(0,state.issues-1);state.confirm=null;temporary('resolve',icons.resolve.archived);log('Archived the selected issue')}else{armConfirmation('archive',icons.resolve.archive,'Long press again within 3 seconds to archive')}return}shortPress(action)}
document.querySelectorAll('.key').forEach(key=>{let timer,long=false;key.addEventListener('pointerdown',()=>{long=false;timer=setTimeout(()=>{long=true;longPress(key.dataset.action)},700)});key.addEventListener('pointerup',()=>{clearTimeout(timer);if(!long)shortPress(key.dataset.action)});key.addEventListener('pointerleave',()=>clearTimeout(timer))});
document.querySelectorAll('[data-control]').forEach(button=>button.addEventListener('click',()=>{const value=button.dataset.control;if(value==='new'){state.issues++;state.pending++;state.auth=false;log('New issue arrived; '+state.pending+' pending')}if(value==='clear'){state.issues=0;state.pending=0;state.auth=false;log('Backlog cleared')}if(value==='auth'){state.auth=true;log('Sentry authentication error')}render()}));
document.querySelectorAll('[data-pr]').forEach(button=>button.addEventListener('click',()=>{state.pr=button.dataset.pr;log('PR state: '+state.pr);render()}));
render();log('Preview ready');
</script></body></html>`;

const directory = mkdtempSync(join(tmpdir(), "sentry-stream-deck-preview-"));
const file = join(directory, "index.html");
writeFileSync(file, html);
console.log(`Preview written to: ${file}`);
if (!process.argv.includes("--no-open")) {
	execFile("open", [file], (error) => {
		if (error) console.log(`Open it manually in a browser:\n  ${file}`);
	});
}
