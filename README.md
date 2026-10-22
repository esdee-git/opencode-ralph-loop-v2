# OpenCode Ralph Loop — V2 rewrite

**This is an independent rewrite for OpenCode V2 of [charfeng1/opencode-ralph-loop](https://github.com/charfeng1/opencode-ralph-loop).** The original plugin and README are by Charles Feng. This repository is not the upstream project, not its npm package (`opencode-ralph-loop`), and is not affiliated with its maintainer. The original targets OpenCode V1; its plugin entrypoint does not load in V2. This rewrite retains the Ralph Loop concept, state-file format, and command names while using the V2 plugin API.

Minimal Ralph Loop plugin for [OpenCode V2](https://opencode.ai/v2/docs/) — auto-continues a session until task completion. Inspired by [Anthropic's Ralph Wiggum technique](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) for iterative AI development loops.

## Why this plugin?

[oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) offers a feature-rich suite including a Ralph Loop. The [original standalone Ralph Loop](https://github.com/charfeng1/opencode-ralph-loop) keeps just that functionality, but uses OpenCode V1's plugin API. This repository provides a small V2-native alternative.

Upstream mechanisms intentionally **not** ported, because V2 makes them unnecessary or harmful:

- `commands/*.md` files and the first-run auto-copy into `~/.config/opencode` — V2 registers commands and tools at runtime; copied markdown would duplicate or override registrations
- `/help` command, tool, and skill — a plugin-registered global `help` name risks colliding with user-defined commands; this README is the help surface
- TypeScript, vitest, and a lockfile — plain ESM plus `node:test`, zero dependencies
- The upstream release workflow — its npm OIDC trusted publishing is configured for the original package and repo

## Requirements

- OpenCode V2 (uses the V2 `setup`, command/tool transforms, and session event API)
- Node.js 22.13+ for local development and tests; the plugin uses only built-in Node modules and needs no runtime dependencies

## Installation

**Do not install `opencode-ralph-loop` for OpenCode V2:** that name belongs to the V1 original and fails to load. None of the methods below install extra skills or commands — tools and slash commands are registered at runtime.

### From GitHub with the plugin CLI (recommended)

`opencode plugin add` accepts npm-compatible Git package specs and writes the entry into your global config:

```bash
opencode plugin add github:esdee-git/opencode-ralph-loop-v2
```

Pin a branch, tag, or commit with `#ref` (e.g. `github:esdee-git/opencode-ralph-loop-v2#v0.1.0`); HTTPS and SSH forms work too. Check for updates with `opencode plugin check`, apply them with `opencode plugin update`, and remove with `opencode plugin remove`. Restart OpenCode afterwards.

### From npm

After this repository is published, the plain package name works with the same CLI and in config:

```bash
opencode plugin add opencode-ralph-loop-v2
```

### From a local checkout

Add the checkout's **absolute directory path** to the V2 `plugins` array in `~/.config/opencode/opencode.jsonc` (or a project's `opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-ralph-loop-v2"]
}
```

Clone the repository, replace the example path with the clone's real location, and restart OpenCode.

### Single-file copy (no clone, no CLI)

```bash
mkdir -p ~/.config/opencode/plugins
curl -fsSL https://raw.githubusercontent.com/esdee-git/opencode-ralph-loop-v2/master/src/index.js \
  -o ~/.config/opencode/plugins/ralph-loop.js
```

The URL points at the default `master` branch; adjust if you rename it. You can also grab `src/index.js` any other way and place it in that directory. Plain `.js` files in `~/.config/opencode/plugins/` (or a project's `.opencode/plugins/`) are auto-loaded — no config edit needed.

### Migrating from the V1 original

Remove `"opencode-ralph-loop"` from the old `plugin` or new `plugins` list, and remove any older local Ralph Loop rewrite entry or file — running two implementations submits duplicate continuations. The V1 plugin may also have **copied** skills (and, in older versions, commands) into `~/.config/opencode/`; those instruct manual state-file creation, which bypasses session binding. Delete them or replace them with the files in `skills/`.

### Verify

Check with `opencode plugin list` for `ralph-loop.v2` (a broken entry would show no ID). OpenCode watches plugin config and local files, but a restart is a reliable way to pick up changes.

### Optional: progressive-context skills

The plugin works without these. If you want the agent to load Ralph Loop discipline on demand (how the loop works, the completion-honesty rules), copy the two skill folders into a skills directory that OpenCode discovers:

```bash
cp -r skills/* ~/.config/opencode/skills/
```

## Usage

### Start a loop

```text
/ralph-loop Build a REST API with authentication
```

The slash command submits the task and starts a loop bound to **that session**. The `ralph-loop` tool is also available to agents; it accepts `task` and optional `maxIterations` (default: 100). After invoking the tool, the agent should begin the task in the same session.

### Cancel a loop

```text
/cancel-ralph
```

The `cancel-ralph` tool is also available. Cancellation only affects a loop belonging to the current session. If a session is deleted, its loop state is removed. A different session in the same project cannot take over an active loop.

## How it works

1. Starting a loop creates `.opencode/ralph-loop.local.md` in the OpenCode location, including a session ID.
2. When an OpenCode V2 `session.execution.succeeded` event arrives for that session, the plugin checks the latest assistant message.
3. If the message does not contain `<promise>DONE</promise>`, it queues a continuation in the same session.
4. The loop stops when the promise appears, when the maximum number of continuations has been submitted, when the session is deleted, or on `/cancel-ralph`.

The plugin never continues after a failed or interrupted execution, and an assistant reply that carries an error leaves the loop waiting for a clean success — no runaway retries against a broken turn. A file without `sessionId` (for example, an old unbound V1 state file) is not auto-resumed; start a new loop explicitly to replace it.

### Completion promise

When the task is **completely and verifiably finished**, the assistant should output:

```text
<promise>DONE</promise>
```

Do not emit a false completion promise to exit early; cancel the loop instead if work is blocked or requirements change.

## State file

The state is stored in the project directory at `.opencode/ralph-loop.local.md`, with the original project's frontmatter format:

```markdown
---
active: true
iteration: 3
maxIterations: 100
sessionId: ses_abc123
---

Your original task prompt
```

Add `.opencode/ralph-loop.local.md` to each project's `.gitignore` (this repository already ignores its own). The file may include your task prompt; do not commit it if that prompt contains private information.

## Features

- **V2-native**: exports a plugin definition with `id` and `setup`, and registers V2 commands, tools, and events
- **Minimal**: no external runtime dependencies or automatic config-file writes
- **Session-bound**: ignores unbound legacy state and other sessions' events
- **Project-relative**: state stays in the active OpenCode location
- **Completion detection**: checks the final assistant text for the DONE promise
- **Commands and tools**: `ralph-loop` and `cancel-ralph`
- **Optional skills**: `skills/` provides progressive context for agents; never auto-installed

## Architecture

```text
opencode-ralph-loop-v2/
├── src/index.js             # V2 plugin entrypoint, state management (single file by design)
├── test/
│   ├── index.test.js        # Behavior tests against a mocked V2 context
│   ├── completion.test.js   # Completion-promise regex cases
│   └── state.test.js        # State parse/serialize cases
├── skills/                  # Optional progressive context (ralph-loop, cancel-ralph)
├── .github/workflows/ci.yml # Test-only CI (no publish job)
├── package.json             # Entrypoint and metadata for package installs
├── AGENTS.md                # V2 loader/API gotchas for contributors and agents
├── CONTRIBUTING.md
├── LICENSE                  # Upstream MIT license and copyright notice
└── README.md
```

Run `npm test` and `npm run check` before distributing changes. No network access or provider credentials are required to run the tests.

## Credits and license

Based on [charfeng1/opencode-ralph-loop](https://github.com/charfeng1/opencode-ralph-loop) by Charles Feng, which in turn credits [Anthropic's Ralph Wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) and [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode). The original project's MIT license and copyright notice are retained in [LICENSE](LICENSE). This repository is a V2 rewrite, not a V2 release of the original package.
