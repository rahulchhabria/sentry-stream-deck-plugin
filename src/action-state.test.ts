import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	KeyDownEvent,
	KeyUpEvent,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";

import { DoneAction, confirmationStep } from "./actions/done";
import { LoopStatusAction, imageForStatus } from "./actions/loop";
import { OpenCode } from "./actions/open-code";
import { SendToAgent } from "./actions/send-to-agent";
import { agentHandoffManager } from "./agent-handoff-manager";
import type { IssueSelectionSnapshot } from "./issue-selection";
import { issueSelectionStore } from "./issue-selection-store";

const emptySelection: IssueSelectionSnapshot = {
	source: { status: "unconfigured", issues: [] },
	selectedIndex: -1,
	issueCount: 0
};

test("registered workflow actions render, handle an empty press, and clean up", async () => {
	const pending: Array<Promise<void>> = [];
	const originalSelectionSubscribe = issueSelectionStore.subscribe;
	const originalGetSnapshot = issueSelectionStore.getSnapshot;
	const originalAgentSubscribe = agentHandoffManager.subscribe;
	const originalGetStatus = agentHandoffManager.getStatus;
	issueSelectionStore.subscribe = (subscriber) => {
		pending.push(Promise.resolve(subscriber(emptySelection)));
		return () => {};
	};
	issueSelectionStore.getSnapshot = () => emptySelection;
	agentHandoffManager.subscribe = (subscriber) => {
		pending.push(Promise.resolve(subscriber({ status: "idle" })));
		return () => {};
	};
	agentHandoffManager.getStatus = () => ({ status: "idle" });

	const images: string[] = [];
	let alerts = 0;
	const key = {
		id: "test-key",
		isKey: () => true,
		setImage: async (image: string) => { images.push(image); },
		setTitle: async () => {},
		showAlert: async () => { alerts += 1; }
	};
	const appear = { action: key } as unknown as WillAppearEvent;
	const disappear = { action: key } as unknown as WillDisappearEvent;
	const down = { action: key } as unknown as KeyDownEvent;
	const up = { action: key } as unknown as KeyUpEvent;

	try {
		const code = new OpenCode();
		code.onWillAppear(appear);
		await code.onKeyDown(down);
		code.onWillDisappear(disappear);

		const agent = new SendToAgent();
		agent.onWillAppear(appear);
		await agent.onKeyDown(down);
		await agent.onKeyUp(up);
		agent.onWillDisappear(disappear);

		const loop = new LoopStatusAction();
		loop.onWillAppear(appear);
		await loop.onKeyDown(down);
		loop.onWillDisappear(disappear);

		const done = new DoneAction();
		done.onWillAppear(appear);
		await done.onKeyDown(down);
		await done.onKeyUp(up);
		done.onWillDisappear(disappear);

		await Promise.all(pending);
		assert.ok(images.length >= 4);
		assert.equal(alerts, 4);
	} finally {
		issueSelectionStore.subscribe = originalSelectionSubscribe;
		issueSelectionStore.getSnapshot = originalGetSnapshot;
		agentHandoffManager.subscribe = originalAgentSubscribe;
		agentHandoffManager.getStatus = originalGetStatus;
	}
});

test("Resolve requires the same issue and mutation on the confirmation press", () => {
	assert.equal(confirmationStep(undefined, "1", "resolved"), "arm");
	assert.equal(confirmationStep({ issueId: "1", status: "resolved" }, "1", "resolved"), "execute");
	assert.equal(confirmationStep({ issueId: "1", status: "resolved" }, "2", "resolved"), "arm");
	assert.equal(confirmationStep({ issueId: "1", status: "resolved" }, "1", "ignored"), "arm");
});

test("View PR has a renderable visual for every status", () => {
	for (const state of ["none", "draft", "ci", "ready", "fail", "merged", "closed"] as const) {
		assert.match(imageForStatus({ state }), /^data:image\/svg\+xml;base64,/);
	}
	for (const errorKind of ["auth", "missing-cli", "network", "command"] as const) {
		assert.match(imageForStatus({ state: "error", errorKind }), /^data:image\/svg\+xml;base64,/);
	}
});
