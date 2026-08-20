# Sentry Alerts Marketplace listing

## Product metadata

- **Name:** Sentry Alerts
- **Author:** Rahul Chhabria
- **Version:** 0.1.0.0
- **UUID:** `com.rc.sentry-alerts`
- **Price:** Free
- **Category:** Productivity
- **Tags:** Developer Tools, Monitoring, Sentry, GitHub
- **Platforms:** macOS 12 or newer; Windows 10 or newer
- **Requires:** Stream Deck 7.1 or newer and a Sentry account

## Description

Sentry Alerts turns a Stream Deck into a focused six-key response console for
Sentry issues. Pulse detects genuinely new unresolved issues without alerting
on the existing backlog. Inspect opens the selected issue, Code jumps to its
best in-app source frame in your local editor, Agent hands the issue to your
chosen local coding agent, View PR follows GitHub and CI status, and Resolve
closes or archives with an intentional two-press confirmation.

Configure a Sentry URL, organization, project, and auth token from any action's
Property Inspector. The plugin works with Sentry SaaS and HTTPS self-hosted
installations. Agent, editor, and GitHub features use tools installed on your
computer; the plugin does not upload repository source or launch an agent
automatically. Optional integrations support Codex, Claude Code, Cursor Agent,
GitHub CLI, Cursor, Visual Studio Code, Zed, and Xcode.

Sentry Alerts is an independent community integration published by Rahul
Chhabria. It is not affiliated with, endorsed by, or sponsored by Sentry or
Elgato.

## Setup tips

1. Add the actions in this layout: `PULSE | INSPECT | CODE` over
   `AGENT | VIEW PR | RESOLVE`.
2. Configure shared settings from any action's Property Inspector.
3. Use a Sentry token with `event:read` and `project:read`; add `event:write`
   only if Resolve should update issues.
4. Configure an absolute repository path before using Code, Agent, or View PR.
5. On Windows, install Windows Terminal for Terminal launch mode or choose
   Direct launch mode.

## Public links

- **Product and setup:** <https://github.com/rahulchhabria/sentry-stream-deck-plugin>
- **Support:** <https://github.com/rahulchhabria/sentry-stream-deck-plugin/issues>
- **Privacy:** <https://github.com/rahulchhabria/sentry-stream-deck-plugin/blob/main/PRIVACY.md>
- **License:** <https://github.com/rahulchhabria/sentry-stream-deck-plugin/blob/main/LICENSE>

## Media

- App icon: `app-icon-288.png`
- Thumbnail: `media/thumbnail.png`
- Gallery 1: `media/gallery-01-workflow.png`
- Gallery 2: `media/gallery-02-status.png`
- Gallery 3: `media/gallery-03-control.png`
