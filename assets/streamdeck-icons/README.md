# Stream Deck HITL icons

Each 288×288 SVG uses the same visual grammar as the supplied references:
pure black background, a bold white glyph, and a single-color halo.
Glyphs occupy the upper portion of the key. Labels, counts, and operational
status are rendered directly into each SVG so Stream Deck's native title layer
cannot resize, wrap, or overlap them.

| Key | Glyph | Accent | Glow behavior |
| --- | --- | --- | --- |
| NEW ISSUE | Sentry mark | `#ff375f` | Alternates normal/glow every 600 ms for a new issue |
| INSPECT | Focus brackets | `#a78bfa` | Glows for an unhandled selected issue |
| CODE | Code brackets | `#60a5fa` | Glows while locating and opening a source frame |
| AGENT | Robot | `#ff3d9a` | Glows while launching and after a successful handoff |
| VIEW PR | Pull request | `#38bdf8` | Status-colored glow for draft, CI, failure, or merge |
| RESOLVE | Circled check | `#34d399` | Glows briefly after a successful resolve/archive |

Regenerate both normal and glow SVGs with:

```sh
npm run icons:build
```

The `plugin-*.svg` files are editable sources for the checked-in manifest PNGs
and replace the Elgato template artwork with six-key workflow branding.
