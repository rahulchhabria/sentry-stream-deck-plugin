import streamDeck from "@elgato/streamdeck";

type Subscriber = (muted: boolean) => void | Promise<void>;

class PulseMuteStore {
	private muted = false;
	private readonly subscribers = new Set<Subscriber>();

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber);
		this.notify(subscriber, this.muted);
		return () => this.subscribers.delete(subscriber);
	}

	isMuted(): boolean {
		return this.muted;
	}

	toggle(): void {
		this.set(!this.muted);
	}

	set(muted: boolean): void {
		if (this.muted === muted) return;
		this.muted = muted;
		for (const sub of this.subscribers) {
			this.notify(sub, muted);
		}
	}

	private notify(subscriber: Subscriber, muted: boolean): void {
		Promise.resolve(subscriber(muted)).catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			streamDeck.logger.error(`Pulse mute update failed: ${message}`);
		});
	}
}

export const pulseMuteStore = new PulseMuteStore();

