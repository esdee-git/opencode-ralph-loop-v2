# AGENTS.md

Keep this file short. Facts only.

## Commands

```bash
npm run check   # node --check on the entrypoint
npm test        # node:test; no dependencies, no build, no npm install needed
```

## Layout

- `src/index.js` — V2 plugin entrypoint: default-exports `{ id, setup }`, registers tools/commands via transforms, subscribes to session events. **Intentionally single-file**: users can copy it directly into `~/.config/opencode/plugins/` — that directory loads every direct `.js` as a plugin, so a sibling helper module would itself fail plugin validation.
- `test/` — `node:test`; `test/index.test.js` runs `setup()` against a mocked V2 context
- `skills/` — OPTIONAL progressive context users may copy; the plugin never installs these itself

## V2 gotchas

- The V2 loader validates the **default export shape**: it must be an object with `id` and `effect` or `setup`. The V1 entry form (`export default async function plugin(ctx)`) fails with `Expected object at ["default"]`. Do not regress the entrypoint.
- V1's loader scanned `Object.values(module)` and rejected non-function exports. V2 does not — named exports of plain values are safe, which is why `COMPLETION_TAG`, `parseState`, and `serializeState` can be exported directly from the entrypoint for tests (upstream's `src/completion.ts` sibling existed only for the V1 scan).
- Do NOT add `commands/*.md` or auto-copy files into `~/.config/opencode`: both are V1 mechanisms. V2 registers commands/tools at runtime through `ctx.command.transform` / `ctx.tool.transform`; markdown copies would duplicate or override registrations and go stale.
- State without `sessionId` is never auto-resumed — it may be a leftover V1 file or a hand-edited file, and there is no safe session to continue into.
- Continuation fires only on `session.execution.succeeded`. Failed/interrupted executions and erroring assistant replies leave the loop state untouched (no runaway retries against a broken turn).
- No `/help` command: V1 registered a global `help` command/tool/skill, which collides with user-defined names. This README is the help surface.
- Event loop filters on `event.location.directory` (when present) and `sessionId`; keep both or cross-session leaks return.

## Releases

None wired up. Upstream's `release.yml` publishes to npm via OIDC trusted publishing configured for *their* package/repo; reusing it blindly fails. If this repo is published, configure its own trusted publisher first. The package name `opencode-ralph-loop-v2` is currently unclaimed on npm (verified 2026-10).

No publish is needed for users: `opencode plugin add github:<user>/<repo>` installs straight from the Git repo once pushed. Tag releases (`v0.1.0`) so `#ref` pins and `plugin update` behave predictably — exact versions/commit hashes stay pinned, unpinned installs are checked for updates.
