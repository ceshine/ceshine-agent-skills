# Output Styles Extension — TDD / Implementation Plan

## Overview

A Pi extension that makes the agent's output style configurable, similar to Claude Code's output styles. The extension supports built-in styles, project-local custom styles via markdown files with YAML frontmatter, and a `/output-style` command for interactive control.

## Configuration

### `settings.json`

The extension reads `outputStyle` from settings with standard Pi precedence:

1. `.pi/settings.json` (project-level, highest priority)
2. `~/.pi/agent/settings.json` (global fallback)
3. `"default"` (built-in fallback)

```jsonc
// .pi/settings.json
{
  "outputStyle": "concise",
}
```

### Style Discovery

Custom styles are discovered from `.pi/output-styles/*.md` in the project root. Global custom styles are not supported — styles live next to the project configuration. To make a style available everywhere, add a `.md` file to the extension's own `builtins/` directory.

---

## Custom Style File Format

Each file in `.pi/output-styles/*.md` uses YAML frontmatter + markdown body:

```markdown
---
name: concise
description: Brief, to-the-point responses
---

Always respond as concisely as possible. Prefer short sentences and bullet points.
Avoid preamble, fluff, or meta-commentary about what you're going to do.
```

**Frontmatter fields:**

| Field         | Required | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| `name`        | Yes      | Style identifier. Must be unique. Collisions shadow built-in styles. |
| `description` | No       | Shown in `/output-style` selector UI.                                |

**Body:** Raw markdown instructions used as the content of the style message sent to the LLM.

---

## Built-In Styles

The `default` style is hardcoded: it injects no style message and acts as a pass-through.

All other built-in styles (`concise`, `verbose`, `teaching`, etc.) are loaded at runtime from `builtins/*.md` files using the same YAML-frontmatter + markdown-body format as custom styles:

```markdown
---
name: concise
description: Brief, to-the-point responses
---

Always respond as concisely as possible...
```

This makes built-ins editable templates and guarantees the parser used for custom styles is also exercised by built-ins.

Custom styles with the same `name` as a built-in style shadow the built-in one.

---

## Interactive Commands

### `/output-style`

Opens a selector dialog showing all available styles (built-in + custom), with the current session default marked.

### `/output-style <name>`

Directly sets the session default style. Errors if the style name is unknown. **No-op if the selected style matches the current `sessionStyle`.**

**Behavior:**

- If `name === sessionStyle`: returns immediately with no state changes.
- Updates `sessionStyle` immediately.
- Persists the override to the session via `pi.appendEntry("output-style", { style: name })` so it survives `/reload`, compaction, and session restore.
- Notifies the user: `Output style set to '<name>'. Takes effect on the next message.`
- The command returns immediately. The new style is injected as a hidden message on the next `before_agent_start`.

---

## Event Lifecycle

```
session_start
  ├── Scan .pi/output-styles/*.md → parse frontmatter → populate custom style cache
  ├── Read latest session entry of type "output-style"
  │     ├── If found: sessionStyle = entry.data.style
  │     └── Else: sessionStyle = settings.json value (project → global → "default")
  └── Reset injectedStyle = undefined

before_agent_start  (once per user prompt, before the agent loop)
  └── If sessionStyle !== "default"
      ├── If sessionStyle !== injectedStyle
      │     ├── injectedStyle = sessionStyle
      │     └── Inject full hidden message (customType="output-style-msg", display=false)
      │         Content: "Use the '<name>' output style.\n\n<full instructions>"
      └── Else (same style as last injected)
            └── Inject short reminder hidden message (customType="output-style-msg", display=false)
                Content: "Reminder: continue using the '<name>' output style."

session_compact
  └── Reset injectedStyle = undefined
      (Ensures style is re-injected after compaction, since the old message may have been summarized away)

/output-style <name>
  ├── Validate name against built-ins + customStyles
  ├── Set sessionStyle = name
  ├── pi.appendEntry("output-style", { style: name })
  └── Notify user (non-blocking)
```

---

## State Management

| Variable       | Scope                        | Source                                                                                    | Mutable By                                        |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `sessionStyle` | Session (in-memory)          | `settings.json` on `session_start`, then restored from persisted session entry if present | `/output-style` command                           |
| `injectedStyle`| Session (in-memory)          | Set in `before_agent_start` after successful message injection                            | Reset on `session_start` and `session_compact`    |
| `customStyles` | Session                      | `.pi/output-styles/*.md` on `session_start`                                               | Rebuilt on reload                                 |

---

## File Structure

```
output-styles/
├── TDD.md                # This document
├── index.ts              # Extension entry point — wires events and commands
├── settings.ts           # loadSettings(), outputStyle resolution
├── styles.ts             # Built-in style loader + resolution helpers
├── scanner.ts            # Discover & parse .pi/output-styles/*.md
├── frontmatter.ts        # Simple YAML frontmatter parser (key: value only)
└── builtins/
    ├── concise.md        # Built-in concise style
    ├── verbose.md        # Built-in verbose style
    └── teaching.md       # Built-in teaching style
```

---

## Key Design Decisions

| Decision                                                 | Rationale                                                                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Custom styles are project-local**                      | `.pi/output-styles/` lives next to `.pi/settings.json`. Global custom styles add complexity with low ROI.                                                                               |
| **Message-only style instructions**                      | Keeps the system prompt stable (no cache invalidation on style changes). Style directives live in the conversation history as explicit transitions.                                     |
| **Hidden custom messages (`display: false`)**            | Reach the LLM without cluttering the TUI. Treated as part of the conversation context.                                                                                                  |
| **`injectedStyle` gates full vs. reminder messages**     | On style change: inject full instructions. On unchanged style: inject a short reminder. Keeps the style salient in long conversations without repeating verbose instructions.        |
| **Re-inject after compaction**                           | Compaction may summarize or drop the style message. Resetting `injectedStyle` on `session_compact` ensures the current style is re-communicated on the next user prompt.                |
| **Accept occasional duplicate after `/reload`**          | `injectedStyle` is in-memory only; after reload it resets, causing one harmless re-injection. Rare and functionally benign.                                                             |
| **Overrides are persisted as session entries**           | Survives `/reload`, compaction, and `/resume` without polluting `settings.json`.                                                                                                        |
| **`/output-style default` persists a `"default"` override** | Appends a persisted entry with `style: "default"`, resetting the active style to the built-in pass-through. Users can later switch back to a non-default style the same way. |
| **Built-ins can be shadowed**                            | If a custom style has the same `name` as a built-in, the custom one wins — explicit user intent.                                                                                        |
| **Built-in styles live in `.md` files**                  | The same YAML-frontmatter format used for custom styles keeps built-ins editable and ensures the parser is self-testing. Only `default` is hardcoded.                                   |
| **No external dependencies by default**                  | A small hand-rolled YAML parser covers 99% of use cases. Add `gray-matter` only if nested frontmatter is needed.                                                                        |
| **Settings use `"outputStyle"` camelCase key**           | Consistent with other Pi settings (`allowedExternalPaths`, `readOnlyPaths`).                                                                                                            |

---

## V2 Enhancement Ideas

- **Style preview**: `/output-style preview <name>` shows instruction text before applying.
- **Combination styles**: Allow `output_style: ["concise", "code"]` in frontmatter to merge multiple instruction sets.
- **File-type-specific styles**: Frontmatter key `output_style_for: "*.rs"` auto-applies when editing matching files.
- **Per-model defaults**: Different default styles per model in `settings.json`.

---

## Testing Checklist

- [ ] `settings.json` resolution: project overrides global.
- [ ] Unknown `outputStyle` in settings falls back to `"default"`.
- [ ] Custom style files in `.pi/output-styles/` are discovered on session start.
- [ ] Custom style with duplicate name shadows built-in.
- [ ] Built-in styles (except `default`) load from `builtins/*.md` on startup.
- [ ] Frontmatter block is stripped from transformed message.
- [ ] `/output-style` command lists all styles and marks current default.
- [ ] `/output-style <name>` directly sets session default.
- [ ] Full style message is injected on style change in `before_agent_start`.
- [ ] Short reminder message is injected on unchanged style in `before_agent_start`.
- [ ] No duplicate full instruction message when `sessionStyle` has not changed.
- [ ] Style message is hidden from TUI (`display: false`) but visible to LLM.
- [ ] Mid-session `/output-style` change updates state immediately; injection occurs on next `before_agent_start`.
- [ ] `/output-style` persists an entry; session restore picks up the latest persisted style.
- [ ] `/output-style default` persists a `default` entry and stops injecting style messages.
- [ ] After compaction, style is re-injected on the next user prompt.
- [ ] Style precedence: mid-session override > project `settings.json` > global `settings.json` > built-in `"default"`.
