# Sentry Alerts

An independent community integration for Stream Deck. This project is not
affiliated with, endorsed by, or sponsored by Sentry or Elgato. Sentry and
Stream Deck are trademarks of their respective owners.

A physical, six-key human-in-the-loop pipeline for Sentry. The plugin watches a
project, flashes when a **new** unresolved issue fires, opens the selected
issue and its source, hands off to a local coding agent, follows PR status, and
can resolve/archive issues when you're done.

## Actions

Layout for a 6‑key Stream Deck:

```
NEW ISSUE INSPECT CODE
AGENT     VIEW PR RESOLVE
```

### Pulse

Shares a single poll of Sentry's v0 Issues API every 15 seconds. The key:

- shows a steady red **ERRORS** state while a backlog of unresolved issues exists;
- **flashes** red on genuinely new issues (the existing backlog at startup is baselined);
- while flashing, shows a count of new issues;
- short press: acknowledges the flash and selects the newest new issue (does not open a browser);
- long press (~700ms): toggles a session‑local **MUTE** state (no flash; still polls and updates INSPECT/CODE);
- glows green (**QUIET**) when the project has no unresolved issues;
- shows **AUTH**, **RATE**, or **API ERR** when the Sentry API rejects the request.

### Inspect / Code

Pulse maintains a shared selected issue. The selection remains stable across
refreshes and during transient API failures, and advances automatically when a
resolved issue disappears from the queue.

- INSPECT opens the selected issue in Sentry.
- CODE fetches the selected issue's latest event, maps its best in-app frame to
  the configured repository, and opens that file and line in the configured IDE.

### Agent

Starts your preferred local coding agent in the configured repository and host with a
prompt that includes the selected Sentry issue's short ID and permalink. The
agent is expected to have Sentry MCP configured so it can call
`get_issue_details` and `analyze_issue_with_seer` itself.

- Key states mirror other actions: **AGENT** (idle), **RUN** (launching),
  **SENT** (handoff completed), **FAIL** (launch error), **REPO** (missing
  repository), plus **AUTH/RATE/API ERR** when relevant.
- Short press launches with a minimal prompt. Long press explicitly asks the agent
  to open a draft PR linking the issue.
- Terminal mode supports Ghostty, Terminal.app, iTerm2, and a custom terminal.
  Auto-detect prefers Ghostty when it is installed. On Windows, terminal mode
  requires Windows Terminal; choose Direct mode if Windows Terminal is not installed.
- Codex Desktop mode opens the repository with `codex app`, copies the complete
  prompt to the clipboard, and shows **PASTE** because the public app launcher
  does not accept an initial prompt.
- The plugin never auto‑launches an agent when flashing.

### View PR

Operates on the currently selected issue, even after a plugin restart. On a slow
interval (≈30s), the key searches PR title, body, and branch for the exact issue
short ID using the GitHub CLI (`gh`). It shows **NO PR**, **DRAFT**, **CI**,
**READY**, **FAIL**, **MERGED**, **CLOSED**, or **PR ERR**.

- If a PR exists, pressing the key opens it in GitHub.
- If no PR exists, pressing the key brings the configured agent interface forward
  with a prompt to preserve and validate existing local changes, commit, push,
  and open a draft PR.
- GitHub failures are actionable: **GH AUTH** opens `gh auth login` in the
  configured terminal, **GH CLI** opens installation help, and **NET ERR** opens
  GitHub Status. Unknown command failures remain **PR ERR** and never trigger an agent.

### Resolve

Operates on the selected issue:

- Short press twice within three seconds: resolve the issue.
- Long press twice within three seconds: archive/ignore the issue.
- A successful mutation immediately refreshes the shared issue queue.
- Requires a token with `event:write`. When missing, the key shows **AUTH**.

## Requirements

- Stream Deck 7.1 or newer
- A Sentry auth token with `event:read` and `project:read` scopes
- For RESOLVE, add `event:write` to resolve/archive.
- Optional: a supported local coding-agent CLI, GitHub CLI, and IDE for the
  AGENT, VIEW PR, and CODE actions.

## Configure

Add the actions to a profile, select one, and fill in the shared Property
Inspector settings (stored in Stream Deck global settings, shared by all actions):

| Field | Notes |
| --- | --- |
| **Sentry URL** | Optional. `https://sentry.io` (US, default), `https://de.sentry.io` (EU), or a self-hosted URL. |
| **Auth Token** | Required. Sentry auth token with the scopes above. |
| **Organization** | Required. Organization slug. |
| **Project** | Required. Project slug. |
| **Repository** | Absolute path to the local repository used by Code, Agent, and View PR. |
| **GitHub CLI** | Optional executable or absolute path used by View PR. On macOS the plugin checks common Homebrew paths before relying on `PATH`. |
| **Agent CLI** | Optional executable or absolute path to your coding agent. Defaults to `agent` (Cursor CLI). Absolute paths are recommended. |
| **Agent Kind** | Agent adapter: Codex, Claude Code, Cursor Agent, or Custom. Existing unset configurations retain the `agent` default. |
| **Agent Extra Args** | Optional extra arguments passed before the prompt. |
| **Launch In** | Terminal interface, Codex Desktop, or direct/no-interface mode. |
| **Terminal** | Auto-detect, Ghostty, Terminal.app, iTerm2, or a custom application. |
| **Terminal App** | Application name for the custom-terminal adapter. |
| **Code IDE** | Auto-detect, Cursor, VS Code, Zed, Xcode, system default, or custom CLI. |
| **IDE CLI** | Optional executable override for the selected editor. |
| **IDE Args** | Custom argument template supporting `{file}`, `{line}`, and `{repo}`. |

The token is stored in Stream Deck's plugin global settings and is never
hardcoded or written to the plugin logs.

### Coding agent setup

This plugin does not embed Sentry MCP. Install or enable Sentry MCP in your
agent:

- Cursor CLI: `npx @sentry/ai install` in the repository, or point to a hosted
  MCP server like `https://mcp.sentry.dev/mcp/<org>/<project>`.
- Claude Code: configure the same MCP server or local install in your project
  settings.

The Error Pulse flash is an interrupt; the new key press is the decision. The
plugin never auto-launches an agent when flashing.

## Develop

Development requires Node.js 24 or newer.

Install and verify Elgato's official Stream Deck CLI:

```sh
npm install -g @elgato/cli@latest
streamdeck -v
```

Then install the project and link the compiled plugin. The Property Inspector
UI library is bundled locally, so settings continue to work without internet
access.

```sh
nvm use
npm ci
npm run dev:enable
npm run link    # link the compiled plugin directory into Stream Deck
npm run watch   # rebuilds and restarts the linked plugin on every change
```

One-off build and manifest validation:

```sh
npm run build
npm run validate
npm run pack:check
```

## Test

```sh
npm test        # node --test suite (poller diff, settings, Sentry API, handoff)
npm run typecheck
npm run lint     # Elgato's recommended ESLint configuration
npm run sim      # opens an interactive browser simulator of the key states
```

`npm run sim` renders an interactive six-key preview with synthetic states and
short/long-press interactions. It does not execute live Sentry, IDE, agent, or
GitHub integrations. Use Stream Deck hardware, Mobile, or a Virtual Device for
end-to-end coordinated-key testing; those workflows also have Node regression
coverage.

Run every automated build and packaging gate with:

```sh
npm run check
```

## Package

```sh
npm run pack    # -> com.rahulchhabria.sentry-human-loop.streamDeckPlugin
```

Upload that file at <https://marketplace.elgato.com/maker> only after every
applicable item in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) has evidence.

## Before submitting to the Marketplace

- [ ] Confirm `Sentry Alerts`, free pricing, your individual Maker identity, and
      `com.rahulchhabria.sentry-human-loop` before creating the product.
- [ ] Obtain Sentry's permission or documented legal clearance for the exact
      product name and all Sentry mark and imagery usage; the disclaimer above
      is not legal clearance.
- [ ] Upload the 288×288 app icon, 1920×960 thumbnail, and three 1920×960
      gallery images from the prepared release bundle.
- [ ] Publish this release's setup, support, and privacy documents, then verify
      every manifest and Property Inspector URL anonymously.
- [ ] Bump `Version` in `manifest.json` (4-part, e.g. `0.1.1.0`) and the
      `package.json` `version` on each release.
- [ ] Run the full gate: `npm run check`, then `npm run pack` for the release artifact.

### Renaming the plugin UUID

The current UUID is `com.rahulchhabria.sentry-human-loop`. To change the prefix,
update every occurrence consistently:

1. Rename the folder `com.rahulchhabria.sentry-human-loop.sdPlugin`.
2. In `manifest.json`: the top-level `UUID` and every action `UUID`.
3. In `src/actions/`: update every `@action({ UUID: ... })` decorator to match
   its manifest action UUID.
4. In `package.json` (`watch`, `validate`, `pack` scripts) and
   `rollup.config.mjs` (`sdPlugin` constant): the folder name.
5. Re-link with the Stream Deck CLI (`streamdeck link <new folder>`) and restart.

Changing the UUID registers the plugin as a new one, so do this before the first
submission.

## Support and privacy

- Setup and troubleshooting: [SUPPORT.md](SUPPORT.md)
- Bug reports: <https://github.com/rahulchhabria/sentry-stream-deck-plugin/issues>
- Data handling: [PRIVACY.md](PRIVACY.md)
