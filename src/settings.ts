import streamDeck from "@elgato/streamdeck";

export type SentrySettings = {
	authToken?: string;
	organizationSlug?: string;
	projectSlug?: string;
	/**
	 * Base URL of the Sentry instance, e.g. `https://sentry.io` (US),
	 * `https://de.sentry.io` (EU) or a self-hosted host. Defaults to
	 * {@link DEFAULT_SENTRY_URL} when unset or invalid.
	 */
	sentryUrl?: string;
	/** Absolute path of the repository the coding agent should inspect. */
	repositoryPath?: string;
	/** Optional absolute path to the new `sentry` CLI executable. */
	sentryCliPath?: string;
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
 * and self-hosted instances. Falls back to {@link DEFAULT_SENTRY_URL} when the
 * value is missing or not a valid http(s) URL.
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
		return DEFAULT_SENTRY_URL;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return DEFAULT_SENTRY_URL;
	}

	// Normalise to origin so any trailing path/slash is dropped.
	return url.origin;
}
