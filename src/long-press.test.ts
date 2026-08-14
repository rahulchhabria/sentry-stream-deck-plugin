import assert from "node:assert/strict";
import { test } from "node:test";
import type { KeyAction } from "@elgato/streamdeck";
import { LongPressAction } from "./long-press";

class ProbeAction extends LongPressAction {
	short = 0;
	long = 0;
	constructor() { super(50); } // small threshold for test
	protected async onShortPress(): Promise<void> { this.short += 1; }
	protected async onLongPress(): Promise<void> { this.long += 1; }
}

const fakeKey = { id: "k1", isKey: () => true, setImage: async () => {}, setTitle: async () => {} } as unknown as KeyAction;
const keyDown = (action: KeyAction) => ({ action } as unknown as import("@elgato/streamdeck").KeyDownEvent);
const keyUp = (action: KeyAction) => ({ action } as unknown as import("@elgato/streamdeck").KeyUpEvent);

test("ignores keyUp without a matching keyDown", async () => {
	const a = new ProbeAction();
	await a.onKeyUp(keyUp(fakeKey));
	assert.equal(a.short, 0);
	assert.equal(a.long, 0);
});

test("fires short vs long depending on hold duration", async () => {
	const a = new ProbeAction();
	await a.onKeyDown(keyDown(fakeKey));
	await a.onKeyUp(keyUp(fakeKey)); // immediate -> short
	assert.equal(a.short, 1);
	assert.equal(a.long, 0);

	await a.onKeyDown(keyDown(fakeKey));
	await new Promise((r) => setTimeout(r, 60));
	await a.onKeyUp(keyUp(fakeKey)); // held past threshold -> long
	assert.equal(a.short, 1);
	assert.equal(a.long, 1);
});
