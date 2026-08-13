# Sentry for Stream Deck

A physical issue console for Sentry. The plugin watches a project, flashes when
a **new** unresolved issue fires, lets a group of keys navigate one shared issue
queue, and can request a read-only Seer fix plan through the Sentry CLI.

## Actions

### Error Pulse

Shares a single poll of Sentry's v0 Issues API every 15 seconds. The key:

- shows a steady red **ERRORS** state while a backlog of unresolved issues exists;
- **flashes** red when a genuinely new issue arrives (the existing backlog at
  startup is baselined and does not flash);
- stops flashing when pressed (acknowledged) and opens the latest issue in Sentry;
- glows green (**CLEAR**) when the project has no unresolved issues;
- shows **AUTH**, **RATE**, or **API ERR** when the Sentry API rejects the request.

### Previous / Selected / Next

The navigation keys move one shared selection through the latest unresolved
issues. **Selected Issue** shows the selected short ID and opens that exact issue
in Sentry. The selection stays stable when fresh polls reorder the queue. During
a transient API failure, the last successful queue remains usable and the keys
show **STALE** (or a trailing `!` on the queue position) until polling recovers.

### Agent Plan

Runs `sentry issue plan <organization>/<issue-short-id>` in the configured
repository. This asks Seer for root-cause analysis and a proposed fix plan, but
does not launch a coding agent or change code. While running the key shows
**RUN**; after completion it shows **READY**, and pressing it opens the issue in
Sentry.

### Send to Agent

Starts your preferred local coding agent in the configured repository with a
prompt that includes the selected Sentry issue's short ID and permalink. The
agent is expected to have Sentry MCP configured, so it can call
`get_issue_details` and `analyze_issue_with_seer` itself.

- Key states mirror other actions: **SEND** (idle), **RUN** (launching),
  **SENT** (handoff completed), **FAIL** (launch error), **REPO** (missing
  repository), **NONE** (no selection), plus **AUTH/RATE/API ERR** from the
  shared poller when relevant.
- If a Seer plan was already fetched for the same issue via Agent Plan, it is
  included in the prompt and optionally written to a local handoff file
  `.sentry-deck/handoff.json` alongside org/project/id/url (never secrets).
- Interactive CLIs need a TTY: the plugin opens a real terminal window (macOS
  Terminal or Windows Terminal) in your repository and runs the agent command
  there. A second press while the key shows **SENT** is a no-op.

## Requirements

- Node.js 24 or newer
- Stream Deck 7.1 or newer
- A Sentry auth token with `event:read` and `project:read` scopes
- For **Agent Plan**, the new [`sentry` CLI](https://cli.sentry.dev/) installed
  and authenticated with `sentry auth login`, plus Seer enabled for the project

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

```sh
nvm use
npm install
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
npm run sim      # opens an interactive browser simulator of the key states
```

`npm run sim` renders the Error Pulse visuals and lets you exercise the flash /
acknowledge / clear / error behaviour without a physical device. Selection and
Agent Plan behavior is covered by the Node test suite.

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
- [ ] Run the full gate: `npm run typecheck && npm test && npm run build && npm run validate && npm run pack`.

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
