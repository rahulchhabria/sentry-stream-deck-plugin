# Support

## Before reporting a problem

1. Confirm Stream Deck 7.1 or newer is installed.
2. Open any Sentry Alerts action and resolve all validation messages in
   the Property Inspector.
3. Confirm the Sentry token has `event:read` and `project:read`; resolving or
   archiving additionally requires `event:write`.
4. Use an absolute repository path for Code, Agent, and View PR.
5. On Windows, install Windows Terminal for Terminal launch mode or select
   Direct launch mode.
6. Run `npm run check` when testing a source checkout.

Report reproducible problems at
<https://github.com/rahulchhabria/sentry-stream-deck-plugin/issues>. Do not post
auth tokens, private issue payloads, repository source, or Stream Deck settings.

Include the operating system, Stream Deck version, plugin version, affected
action, displayed key state, and sanitized plugin-log excerpt.
