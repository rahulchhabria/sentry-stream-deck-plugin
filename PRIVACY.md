# Privacy

Sentry Alerts is an independent plugin that runs locally in Stream Deck. It
does not include analytics, advertising, or telemetry operated by the plugin
author.

## Data processed locally

- Stream Deck global settings store the configured Sentry URL, auth token,
  organization, project, repository path, and local-tool preferences.
- The auth token is sent only as a bearer credential to the configured Sentry
  origin. HTTPS is required except for loopback development hosts.
- Issue identifiers, permalinks, status, aggregate issue metadata, and event
  stack frames are read from Sentry.
- Repository paths and editor, agent, and GitHub commands execute locally.
- Agent prompts contain the selected issue short ID and permalink. They do not
  contain the issue title, auth token, event payload, or temporary context files.

The plugin author does not receive Sentry credentials, issue data, repository
source, or command output. Users remain responsible for the policies of Sentry,
GitHub, Stream Deck, and any local editor or coding agent they configure.

For privacy questions, open a support request at
<https://github.com/rahulchhabria/sentry-stream-deck-plugin/issues>.
