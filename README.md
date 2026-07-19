# Sentry for Stream Deck

A physical control surface for Sentry. The plugin watches a project and flashes a
Stream Deck key when a **new** unresolved issue fires, with a one-press handoff
into Sentry for review.

## Actions

### Error Pulse

Shares a single poll of Sentry's v0 Issues API every 15 seconds. The key:

- shows a steady red **ERRORS** state while a backlog of unresolved issues exists;
- **flashes** red when a genuinely new issue arrives (the existing backlog at
  startup is baselined and does not flash);
- stops flashing when pressed (acknowledged) and opens the latest issue in Sentry;
- glows green (**CLEAR**) when the project has no unresolved issues;
- shows **AUTH**, **RATE**, or **API ERR** when the Sentry API rejects the request.

### Human in the Loop

Glows purple when an unresolved issue is ready to inspect, shows its short ID, and
opens it in Sentry when pressed. This is intentionally a safe, read-only action —
it never triggers automated fixes.

## Requirements

- Node.js 24 or newer
- Stream Deck 7.1 or newer
- A Sentry auth token with `event:read` and `project:read` scopes

## Configure

Add either action to a profile, select it, and fill in the shared Property
Inspector settings (stored in Stream Deck global settings, shared by both actions):

| Field | Notes |
| --- | --- |
| **Sentry URL** | Optional. `https://sentry.io` (US, default), `https://de.sentry.io` (EU), or a self-hosted URL. |
| **Auth Token** | Required. Sentry auth token with the scopes above. |
| **Organization** | Required. Organization slug. |
| **Project** | Required. Project slug. |

The token is stored in Stream Deck's plugin global settings and is never
hardcoded or written to the plugin logs.

## Develop

```sh
nvm use
npm install
npm run watch   # rebuilds and restarts the linked plugin on every change
```

One-off build and manifest validation:

```sh
npm run build
npm run validate
```

## Test

```sh
npm test        # node --test suite (poller diff, settings, Sentry API)
npm run typecheck
npm run sim      # opens an interactive browser simulator of the key states
```

`npm run sim` renders the real key visuals and lets you exercise the flash /
acknowledge / clear / error behaviour without a physical device.

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
2. In `manifest.json`: the top-level `UUID` and both action `UUID`s.
3. In `src/actions/error-pulse.ts` and `src/actions/human-loop.ts`: the
   `@action({ UUID: ... })` decorators (must match the manifest action UUIDs).
4. In `package.json` (`watch`, `validate`, `pack` scripts) and
   `rollup.config.mjs` (`sdPlugin` constant): the folder name.
5. Re-link with the Stream Deck CLI (`streamdeck link <new folder>`) and restart.

Changing the UUID registers the plugin as a new one, so do this before the first
submission.
