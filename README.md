# Sentry for Stream Deck

A physical, six-key human-in-the-loop pipeline for Sentry. The plugin watches a
project, flashes when a **new** unresolved issue fires, lets you walk the
highest-pain issues, hands off to a local coding agent, follows PR status, and
can resolve/archive issues when you're done.

## Actions

Layout for a 6‑key Stream Deck:

```
PULSE    THIS    NEXT
SEND     LOOP    DONE
```

### Pulse

Shares a single poll of Sentry's v0 Issues API every 15 seconds. The key:

- shows a steady red **ERRORS** state while a backlog of unresolved issues exists;
- **flashes** red on genuinely new issues (the existing backlog at startup is baselined);
- while flashing, shows a count of new issues;
- short press: acknowledges the flash and selects the newest new issue (does not open a browser);
- long press (~700ms): toggles a session‑local **MUTE** state (no flash; still polls and updates THIS/NEXT);
- glows green (**QUIET**) when the project has no unresolved issues;
- shows **AUTH**, **RATE**, or **API ERR** when the Sentry API rejects the request.

### This Issue / Next Issue

Walk a shared selection through the highest‑pain unresolved issues (ordered by
`userCount`, then total `count`, then recency). The selection remains stable
across refreshes and during transient API failures.

- THIS shows the selected short ID with a compact heat hint (user count or total events).
  Short press opens the culprit file in your local editor (Cursor if available)
  using the latest event stacktrace; falls back to the Sentry permalink.
  Long press cycles to the next issue.
- NEXT selects the next issue (wraps).

### Send to Agent

Starts your preferred local coding agent in the configured repository with a
prompt that includes the selected Sentry issue's short ID and permalink. The
agent is expected to have Sentry MCP configured so it can call
`get_issue_details` and `analyze_issue_with_seer` itself.

- Key states mirror other actions: **SEND** (idle), **RUN** (launching),
  **SENT** (handoff completed), **FAIL** (launch error), **REPO** (missing
  repository), **NONE** (no selection), plus **AUTH/RATE/API ERR** when relevant.
- Short press launches with a minimal prompt. Long press explicitly asks the agent
  to open a draft PR linking the issue.
- The plugin never auto‑launches an agent when flashing.

### Loop

Follow‑up on the last successful SEND. On a slow interval (≈30s), the key
looks for a PR in the configured repository whose title mentions the issue
short ID using the GitHub CLI (`gh`). It shows **DRAFT**, **CI**, **FAIL**,
or **MERGED** when it can determine a state; otherwise **SENT** (handoff
happened, no PR yet). Short press opens the PR if known, else the issue.

### Done

Operates on the selected issue:

- Short press: resolve the issue via the Sentry Issues API.
- Long press: archive/ignore the issue.
- Requires a token with `event:write`. When missing, the key shows **AUTH**.

## Requirements

- Node.js 24 or newer
- Stream Deck 7.1 or newer
- A Sentry auth token with `event:read` and `project:read` scopes
- For DONE, add `event:write` to resolve/archive.

## Configure

Add the actions to a profile, select one, and fill in the shared Property
Inspector settings (stored in Stream Deck global settings, shared by all actions):

| Field | Notes |
| --- | --- |
| **Sentry URL** | Optional. `https://sentry.io` (US, default), `https://de.sentry.io` (EU), or a self-hosted URL. |
| **Auth Token** | Required. Sentry auth token with the scopes above. |
| **Organization** | Required. Organization slug. |
| **Project** | Required. Project slug. |
| **Repository** | Absolute path to the local repository used by Agent Plan. |
| **Sentry CLI** | Optional executable or absolute path. Defaults to `sentry`. An absolute path is often more reliable when Stream Deck does not inherit the shell's `PATH`. |
| **Agent CLI** | Optional executable or absolute path to your coding agent. Defaults to `agent` (Cursor CLI). Absolute paths are recommended. |
| **Agent Kind** | Optional hint for argv shaping: `agent`, `claude`, or `codex`. Free text allowed; defaults to `agent`. |
| **Agent Extra Args** | Optional extra arguments passed before the prompt. |

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

`npm run sim` renders the Error Pulse visuals and lets you exercise the flash /
acknowledge / clear / error behaviour without a physical device. Selection and
Agent Plan behavior is covered by the Node test suite.

Run every automated build and packaging gate with:

```sh
npm run check
```

## Package

```sh
npm run pack    # -> com.rahulchhabria.sentry-human-loop.streamDeckPlugin
```

Upload that file at <https://marketplace.elgato.com/maker>.

## Before submitting to the Marketplace

- [ ] Replace the placeholder art (still Elgato template defaults) — plugin icon,
      category icon, both action icons, and both default key images, each with an
      `@2x` variant. See the sizes in `manifest.json`.
- [ ] Re-prefix the plugin UUID to an identity you control (see below).
- [ ] Confirm Sentry trademark/branding usage is cleared.
- [ ] Prepare listing assets in the Maker portal: description, category,
      screenshot(s) of the key in action, support URL.
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
