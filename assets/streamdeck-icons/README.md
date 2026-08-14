# Stream Deck HITL icons

Each 288×288 SVG uses the same visual grammar as the supplied references:
pure black background, a bold white glyph, and a single-color halo.

| Key | Glyph | Accent | Glow behavior |
| --- | --- | --- | --- |
| PULSE | Sentry mark | `#ff375f` | Alternates normal/glow every 600 ms for a new issue |
| THIS | Focus brackets | `#a78bfa` | Glows for an unhandled selected issue |
| NEXT | Double chevron | `#60a5fa` | Normal navigation state |
| SEND | Paper plane | `#ff3d9a` | Glows while launching and after a successful handoff |
| LOOP | Circular arrows | `#38bdf8` | Status-colored glow for draft, CI, failure, or merge |
| DONE | Circled check | `#34d399` | Glows briefly after a successful resolve/archive |

Regenerate both normal and glow SVGs with:

```sh
npm run icons:build
```
