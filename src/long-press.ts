import {
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction
} from "@elgato/streamdeck";

/**
 * Utility base for actions that differentiate short vs long presses.
 * Subclasses implement onShortPress/onLongPress.
 */
export abstract class LongPressAction extends SingletonAction {
	private readonly downAt = new Map<string, number>();
	private readonly thresholdMs: number;

	constructor(thresholdMs = 700) {
		super();
		this.thresholdMs = thresholdMs;
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		// Record press start; do not trigger action on keyDown.
		this.downAt.set(ev.action.id, Date.now());
	}

	override async onKeyUp(ev: KeyUpEvent): Promise<void> {
		const started = this.downAt.get(ev.action.id) ?? 0;
		this.downAt.delete(ev.action.id);
		const heldMs = Date.now() - started;

		try {
			if (heldMs >= this.thresholdMs) {
				await this.onLongPress(ev.action as KeyAction);
			} else {
				await this.onShortPress(ev.action as KeyAction);
			}
		} catch {
			// Let subclasses decide how to surface errors in render state.
		}
	}

	protected abstract onShortPress(action: KeyAction): Promise<void>;
	protected abstract onLongPress(action: KeyAction): Promise<void>;
}

