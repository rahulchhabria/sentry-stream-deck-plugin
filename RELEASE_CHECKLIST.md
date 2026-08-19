# Marketplace release checklist

This file is the release gate for Sentry Alerts. Do not submit while an
applicable blocking item remains unchecked. Attach evidence in the release or
submission record; automated checks are not substitutes for platform, device,
or legal verification.

## Identity and legal approval

- [ ] Individual publisher confirms the permanent product name `Sentry Alerts` is available in Marketplace.
- [ ] Individual publisher confirms free pricing and `Rahul Chhabria` exactly matches the Marketplace organization identity.
- [ ] Individual publisher controls and approves the permanent UUID `com.rahulchhabria.sentry-human-loop`.
- [ ] Obtain Sentry's permission or documented legal clearance for the exact product name and all Sentry name, mark, and imagery usage. The repository disclaimer is not legal clearance.
- [ ] Individual publisher approves [PRIVACY.md](PRIVACY.md) and any Maker Console privacy disclosure.

## Public resources

- [x] This release's setup documentation is published from [README.md](README.md).
- [x] Support instructions are published from [SUPPORT.md](SUPPORT.md).
- [x] Public issue support is available at <https://github.com/rahulchhabria/sentry-stream-deck-plugin/issues>.
- [x] Privacy disclosure is published from [PRIVACY.md](PRIVACY.md).
- [x] Manifest and Property Inspector product, support, setup, and privacy URLs all resolve anonymously after publication.

## Automated release evidence

- [x] `npm ci` completes using the release lockfile.
- [x] `npm audit` reports no unresolved vulnerabilities.
- [x] `npm run check` passes lint, typecheck, tests, production build, official validation, and package dry-run.
- [x] `npm run pack` creates the versioned `.streamDeckPlugin` installer.
- [x] Extracted installer contains no credentials, local paths, logs, `.env` files, or source maps.
- [ ] Installer and Marketplace-bundle checksums are recorded and verified.

Automated evidence for `0.1.0.0` on 2026-08-19:

- 83 tests passed; lint, typecheck, production build, official validation, and
  package dry-run passed.
- `npm audit` reported zero vulnerabilities.
- Installer SHA-256:
  `edec8d522f2629187a5598274529299676f31e3cdc849b0bb2752883ba57a7ab`.

## Manual platform and workflow certification

- [ ] Clean-install the packaged installer on a supported macOS version.
- [ ] Clean-install the packaged installer on a supported Windows version.
- [ ] Test all six actions together on a physical Stream Deck or Virtual Stream Deck.
- [ ] Verify Sentry success, authentication failure, rate-limit, timeout, and recovery states.
- [ ] Verify macOS editor, agent, clipboard, terminal, and GitHub workflows.
- [ ] Verify Windows editor, agent, clipboard, Windows Terminal, Direct mode, and GitHub workflows.
- [ ] Verify Resolve and Archive confirmations against a disposable issue with `event:write`.
- [ ] Verify the Property Inspector validation, conditional fields, automatic saving, and public help links.
- [ ] Record any demonstration video requested by Maker Console or Marketplace review.

## Submission

- [ ] Confirm the manifest and package versions match the release record.
- [ ] Upload the final installer and media from a freshly generated release bundle.
- [ ] Paste approved listing, privacy, support, and release-note copy into Maker Console.
- [ ] Submit only after every applicable blocking item above has evidence.
