# Pi Extensions

Extensions for the [Pi coding agent](https://github.com/badlogic/pi-mono).

| Extension | Description |
|---|---|
| [`bash-permission-gate`](#bash-permission-gate) | Intercepts dangerous `bash` commands (`rm -rf`, `sudo`, `chmod 777`) and prompts for confirmation |
| [`external-path-permission-gate`](#external-path-permission-gate) | Gates `read`/`write`/`edit` on paths outside the working directory |
| [`protected-paths`](#protected-paths) | Declares paths as read-only or fully blocked for Pi's file tools |
| [`output-styles`](#output-styles) | Configurable agent output styles (concise, explanatory, teaching, verbose) with `/output-style` command |
| [`sandbox`](#sandbox) | OS-level sandboxing for bash commands via `sandbox-exec`/`bubblewrap` |
| [`summarization-usage`](#summarization-usage) | Captures token usage & metadata during branch summaries and context compaction |
| [`concise-read`](#concise-read) | Suppresses `read` tool output from the TUI to reduce visual clutter | Each extension is a standalone TypeScript module that hooks into Pi's extension API (`ExtensionAPI`) to intercept tool calls, register commands, or replace built-in tools.

Install by copying the relevant files into `~/.pi/agent/extensions/<name>/` and running `npm install` if the extension has dependencies.

---

## `concise-read`

**File:** [`concise-read.ts`](concise-read.ts)

Replaces the built-in `read` tool with a version that suppresses its output in the TUI. Useful when the agent reads files frequently and the output noise distracts from the conversation.

- **Collapsed (default):** output is hidden
- **Expanded (Ctrl+O):** full file content is shown
- **During execution:** shows a brief `reading...` indicator
- **Tool call rendering:** shows the path and optional offset/limit

The `read` tool's behavior and parameters are unchanged — only the display is affected.

**No configuration required** — enable by loading the extension:

```bash
pi -e ./pi-extensions/concise-read.ts
```

---

## `bash-permission-gate`

**File:** [`bash-permission-gate.ts`](bash-permission-gate.ts)

Intercepts `bash` tool calls and prompts the user for confirmation when the command matches a set of dangerous patterns:

- `rm -rf` / `rm -r`
- `sudo`
- `chmod`/`chown` with mode `777`

In headless (non-interactive) mode, dangerous commands are blocked automatically. In interactive mode, the user is shown a dialog to Allow or Block the command.

**No configuration required** — enable by loading the extension:

```bash
pi -e ./pi-extensions/bash-permission-gate.ts
```

---

## `external-path-permission-gate`

**File:** [`external-path-permission-gate.ts`](external-path-permission-gate.ts)

Prompts for permission before `read`, `write`, or `edit` operations on paths **outside** the current working directory. Paths can be allowlisted so they don't trigger a prompt every time.

> ⚠️ This only gates Pi's built-in file tools — it does **not** prevent the agent from reading external paths via `bash` (e.g. `cat`, `ls`). For full isolation, use a sandbox.

**Configuration** — add to `.pi/settings.json` or `~/.pi/agent/settings.json`:

```json
{
  "allowedExternalPaths": ["../shared", "~/notes", "/tmp"]
}
```

Supported alias keys: `externalPathWhitelist`, `allowedPathsOutsideCwd`.

When an access attempt is made, the user can choose:

- **Allow once** — permit this specific path this time
- **Allow folder this session** — permit the entire parent folder for the rest of the session
- **Block** — deny the operation

---

## `protected-paths`

**File:** [`protected-paths.ts`](protected-paths.ts)

Declares paths as **read-only** or **fully blocked** for Pi's file tools. Useful for protecting sensitive files like `.env`, `.git/`, or `secrets/` from accidental modification.

**Configuration** — add to `.pi/settings.json` or `~/.pi/agent/settings.json`:

```json
{
  "readOnlyPaths": [".env", ".git/", "node_modules/"],
  "blockedPaths": ["secrets/", "private/"]
}
```

- **readOnlyPaths** — allow `read` but block `write`/`edit`. The legacy key `protectedPaths` is treated as an alias.
- **blockedPaths** — block `read`, `write`, and `edit` entirely.

Defaults if no config is found: `.env` and `.git/` are read-only.

---

## `output-styles`

**Directory:** [`output-styles/`](output-styles/)

Makes the agent's output style configurable. Styles inject system-level instructions before each agent turn, controlling tone, verbosity, and formatting.

### Built-in Styles

| Style         | Description                                    |
| ------------- | ---------------------------------------------- |
| `default`     | No style override                              |
| `concise`     | Brief, to-the-point responses                  |
| `explanatory` | Educational insights with `★ Insight` blocks   |
| `teaching`    | Explain concepts as if teaching a skilled peer |
| `verbose`     | Thorough, detailed explanations                |

### Custom Styles

Place `.md` files with frontmatter in `.pi/output-styles/` at the project root:

```markdown
---
name: my-style
description: A custom style
---

Your style instructions here...
```

Custom styles with the same name shadow built-in styles.

### Commands

- **`/output-style`** — Interactive selector to change style mid-session
- **`/output-style <name>`** — Set style directly, e.g. `/output-style concise`

### Configuration

Set a default style in `.pi/settings.json`:

```json
{
  "outputStyle": "concise"
}
```

The extension also persists the selected style across compaction boundaries, and re-injects it after `session_compact` events.

---

## `sandbox`

**Directory:** [`sandbox/`](sandbox/)

OS-level sandboxing for bash commands using `@anthropic-ai/sandbox-runtime`. It replaces the built-in `bash` tool with a sandboxed version that enforces filesystem and network restrictions at the OS level.

- **macOS**: uses `sandbox-exec`
- **Linux**: uses `bubblewrap` (requires `sudo apt-get install bubblewrap socat` on Debian/Ubuntu, or `sudo dnf install bubblewrap socat` on Fedora)

### Configuration

Merge configuration from `~/.pi/agent/extensions/sandbox.json` (global) and `<cwd>/.pi/sandbox.json` (project-local, takes precedence).

```json
{
  "enabled": true,
  "ignoreList": ["docker ", "kubectl "],
  "network": {
    "allowedDomains": ["github.com", "*.github.com"],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": ["/Users", "/home"],
    "allowRead": ["."],
    "allowWrite": [".", "/tmp"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  }
}
```

**Key semantics:**

- **Read** uses a _deny-then-allow_ pattern: all reads are allowed by default; `denyRead` blocks broad regions; `allowRead` re-allows specific paths within denied regions.
- **Write** uses an _allow-only_ pattern: all writes are denied by default; `allowWrite` must explicitly list allowed paths; `denyWrite` creates exceptions within allowed paths.
- **`ignoreList`** — command prefixes that bypass the sandbox after user confirmation (e.g. `"docker "` for Docker commands that need host access).

### Commands & Flags

- **`/sandbox`** — show current sandbox configuration
- **`--no-sandbox`** — disable sandboxing for the session

### Setup

```bash
cp -r pi-extensions/sandbox/ ~/.pi/agent/extensions/sandbox/
cd ~/.pi/agent/extensions/sandbox/ && npm install
```

---

## `summarization-usage`

**File:** [`summarization-usage.ts`](summarization-usage.ts)

Captures token usage, API, provider, and model metadata that Pi normally discards during summarization (branch summaries and context compaction).

Hooks into:

- `session_before_tree` — branch summaries (`/tree`)
- `session_before_compact` — context compaction (`/compact`)

After installation, every branch_summary and compaction entry in session JSONL files includes `details.usage`, `details.api`, `details.provider`, and `details.model`.

Also preserves file operation lists (`readFiles`, `modifiedFiles`) in both the summary text and details.

**No configuration required** — enable by loading the extension:

```bash
pi -e ./pi-extensions/summarization-usage.ts
```
