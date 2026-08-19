import streamDeck from "@elgato/streamdeck";

export type SentrySettings = {
	authToken?: string;
	organizationSlug?: string;
	projectSlug?: string;
	/**
	 * Base URL of the Sentry instance, e.g. `https://sentry.io` (US),
	 * `https://de.sentry.io` (EU) or a self-hosted host. Defaults to
	 * {@link DEFAULT_SENTRY_URL} when unset; invalid values fail closed.
	 */
	sentryUrl?: string;
	/** Absolute path of the repository the coding agent should inspect. */
	repositoryPath?: string;
	/** Optional absolute path to the GitHub CLI executable used for PR discovery. */
	githubCliPath?: string;
	/** Optional absolute path to the local coding agent CLI (e.g. `agent`, `claude`, or `codex`). */
	agentCliPath?: string;
	/**
	 * Which agent command to target for argv shaping. Defaults to `agent`.
	 * Accepts `agent`, `claude`, or `codex`, but free-form values are allowed.
	 */
	agentKind?: string;
	/** Optional extra args to pass to the agent CLI before the prompt. */
	agentExtraArgs?: string;
	/** Where the coding-agent workflow should be presented to the user. */
	agentLaunchMode?: "terminal" | "codex-desktop" | "direct";
	/** Preferred terminal host for interactive agent CLIs. */
	terminalKind?: "auto" | "ghostty" | "terminal" | "iterm" | "custom";
	/** Application name used when terminalKind is custom. */
	terminalApp?: string;
	/** Preferred editor for opening an issue's source location. */
	editorKind?: "auto" | "cursor" | "vscode" | "zed" | "xcode" | "system" | "custom";
	/** Executable used when editorKind is custom, or an override for a known editor. */
	editorCliPath?: string;
	/** Optional editor argument template. Supports {file}, {line}, and {repo}. */
	editorArgs?: string;
};

/** Settings that are guaranteed to have the required connection fields. */
export type ConfiguredSentrySettings = SentrySettings & {
	authToken: string;
	organizationSlug: string;
	projectSlug: string;
};

export const DEFAULT_SENTRY_URL = "https://sentry.io";

export class SentrySettingsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SentrySettingsError";
	}
}

export async function getSentrySettings(): Promise<SentrySettings> {
	return streamDeck.settings.getGlobalSettings<SentrySettings>();
}

export function hasRequiredSettings(
	settings: SentrySettings
): settings is ConfiguredSentrySettings {
	return Boolean(
		settings.authToken?.trim()
		&& settings.organizationSlug?.trim()
		&& settings.projectSlug?.trim()
	);
}

/**
 * Resolves the Sentry base URL (origin only) from settings, supporting US, EU
 * and self-hosted instances. Defaults only when the value is absent; an
 * explicitly configured invalid or insecure URL fails closed.
 */
export function getSentryBaseUrl(settings: SentrySettings): string {
	const raw = settings.sentryUrl?.trim();
	if (!raw) {
		return DEFAULT_SENTRY_URL;
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new SentrySettingsError("Sentry URL is invalid");
	}

	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
		throw new SentrySettingsError("Sentry URL must use HTTPS (HTTP is allowed only for loopback hosts)");
	}

	// Normalise to origin so any trailing path/slash is dropped.
	return url.origin;
}

function isLoopbackHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return normalized === "localhost"
		|| normalized === "::1"
		|| normalized.startsWith("127.");
}
