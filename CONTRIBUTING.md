# Contributing

Independent V2 rewrite of [charfeng1/opencode-ralph-loop](https://github.com/charfeng1/opencode-ralph-loop). See [README.md](README.md) for what changed and why.

## Setup

No build step, no runtime dependencies, and no `npm install` required — the plugin is plain ESM using only Node built-ins. Tests run on `node:test`.

```bash
git clone <this-repo>
cd opencode-ralph-loop-v2
```

## Local checks

```bash
npm run check
npm test
```

CI runs both on every push and pull request (Node 22 and 24).

## Layout

- `src/` — V2 plugin entrypoint (`index.js`), single file by design (see AGENTS.md)
- `test/` — mocked-V2-context behavior tests plus state/completion unit tests
- `skills/` — optional progressive-context files for users to copy manually
- `AGENTS.md` — V2 loader/API gotchas; read before touching the entrypoint

## PRs

- One concern per PR
- Add or update a test for changes to tool/command registration, state parsing, completion detection, or the event subscription
- Match existing style — minimal, plain ESM, no needless abstraction, no new dependencies without a strong reason
- Test against a real OpenCode V2 (`opencode plugin list` shows `ralph-loop.v2`) when changing lifecycle behavior

## Bug reports

Include OpenCode version, Node version, OS, repro steps, and any `failed to load plugin` lines from `~/.local/share/opencode/log/opencode.log` (redact credentials).

## License

MIT, inherited from the original project — by contributing you agree your changes are licensed the same. See [LICENSE](LICENSE).
