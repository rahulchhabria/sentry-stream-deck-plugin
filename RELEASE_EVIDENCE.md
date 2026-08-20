# Sentry Alerts 0.1.0 release evidence

This record separates automated and observed evidence from checks that still
require a human-operated Stream Deck session. Passing CI does not
certify GUI installation, physical key presses, or live Sentry mutations.

## Automated gates

Recorded on 2026-08-19 from the release checkout:

- `npm ci` completed from `package-lock.json`.
- `npm audit` reported zero vulnerabilities.
- `npm run check` passed lint, typecheck, 83 tests, production build, official
  Stream Deck validation, and package dry-run.
- The tests exercise all six registered action classes, empty and error states,
  Sentry authentication/API failures, bounded network and server-error retries,
  stale-state recovery, editor path containment, macOS launch argument
  boundaries, GitHub status and failure states, Resolve confirmation,
  issue status updates, and Property Inspector validation/help behavior.
- [GitHub Actions run 32325495299](https://github.com/rahulchhabria/sentry-stream-deck-plugin/actions/runs/32325495299)
  passed the same gate and produced identical macOS-targeted installer artifacts
  across its runners for commit `449d3c4`.
- The three extracted CI installer payloads were byte-for-byte identical. Their
  sorted content manifest has SHA-256
  `76e10bc3666d7738bd950480a6525f7d57e0166c4c59b4f54bcc02649eaac162`.
- Packaged installer SHA-256:
  `1a6036ac056b1831b6823cb04e8a0a0eed61ef2cabb7478b40096d4bf8667237`.
- Every submission-bundle file is covered by `marketplace/SHA256SUMS.txt`; the
  outer ZIP is covered by `BUNDLE_SHA256SUMS.txt` beside it.

## Observed macOS install and device load

Recorded on 2026-08-19:

- Host: macOS 26.5.2 (25F84).
- Stream Deck app: 7.4.2 (22730); Stream Deck CLI: 1.8.0.
- Packaged installer opened through the normal macOS install flow.
- Installed plugin path:
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.rc.sentry-alerts.sdPlugin`.
- Installed files matched the extracted package; the only extra installed item
  was Stream Deck's runtime `logs` directory.
- Stream Deck logged `[com.rc.sentry-alerts] Plugin connected`.
- An attached Stream Deck Mini profile named `Sentry Alerts` is the device's
  preferred profile and contains all six final action UUIDs in a 3-by-2 layout.

This proves packaged installation, process connection, and the complete
physical-device layout. It does **not** prove that a person pressed every key or
completed the live Sentry, editor, agent, terminal, GitHub, Resolve, Archive,
and Property Inspector workflows.

## Required manual evidence still pending

- Press all six actions on a physical or Virtual Stream Deck.
- With disposable credentials/issues, verify Sentry success, authentication
  failure, rate-limit, timeout, and recovery behavior.
- Verify editor, agent, clipboard, terminal/direct-launch, and GitHub workflows
  on macOS.
- Verify Resolve and Archive confirmations and mutations against a disposable
  issue using a token with `event:write`.
- Verify Property Inspector validation, conditional fields, automatic saving,
  and every public help link in the Stream Deck app.

Do not submit the Marketplace listing until the applicable manual evidence is
recorded.
