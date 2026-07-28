# TASK — Name the three plugin kinds (#103)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-pluginkinds`
(branch `refactor-plugin-kinds`, forked from main at `bf07aba`).

Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the conductor
does that. Commit to this branch and write your report to `/tmp/plugin-kinds-READY.md`.

## What the user asked for, verbatim

> "language capability is also a plugin, but a different kind of plugin, so it can be decoupled but
> in another way, you know what I mean? Any ideas?"

The conductor's working taxonomy, which you should test rather than assume:

- **Contributors** add SURFACES: panes, gutter decorations, status segments, editor-title actions
  (Git, Markdown — both already inverted into the canvas).
- **Providers** answer QUESTIONS: given a document position, what completions/definitions/diagnostics
  exist (the LanguageProvider contract — today it is a seam but not a plugin).
- **Hosted runtimes** own PROCESSES: the agent backends, the terminal shells.

## The task

1. **Test the taxonomy against every existing citizen**: GitPlugin, MarkdownPlugin, ExtensionsPlugin,
   the LanguageProvider seam, the agent backends, the terminal. If a citizen straddles two kinds or
   fits none, the taxonomy is wrong — refine it and say what you changed. Fewer kinds that hold beat
   three that leak.
2. **Name them in code where the distinction is load-bearing** — likely as separate interfaces or a
   discriminant on the plugin contract in `src/modules/app/ApplicationPlugin.interface.ts` /
   `src/modules/workspace/WorkspacePlugin.interface.ts`. Do NOT invent machinery the distinction does
   not pay for: if the honest answer is "contributors get the existing contract, providers get a
   narrower one, runtimes are not ApplicationPlugins at all", then three small interfaces and a
   paragraph in the invariants file may be the whole change.
3. **Record the invariant** (Scope / Impossible-if-true / Rejected-alternatives) in
   `src/modules/workspace/workspace.invariants.md` or `project.invariants.md` — including what each
   kind CANNOT do (a provider cannot paint; a contributor cannot answer position queries; a runtime
   cannot reach the reactive graph directly). The impossibilities are the content.
4. **Do not move the language capability in this task.** Naming the kind it belongs to is #103;
   actually extracting it is a separate, larger task. If your taxonomy makes the extraction path
   obvious, describe it in the report instead of doing it.

## Rules

- Full descriptive identifier names, no abbreviations. 80 columns, `.prettierrc`.
- ivue conventions: `Static()`/`Reactive()`/raw `= $X` (pick the honest form), `protected` floor,
  `X.interface.ts`, file-name-follows-class. Never read `Class.prototype.<member>`.
- The plugin-boundary check in `scripts/conventions-gate.sh` must stay green — host code naming a
  plugin fails the gate.
- Verification, exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all` and `--refs`,
  `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh`. Run `bun install --frozen-lockfile` first (fresh worktree).
- Declare assertion/wait movement in `project.coverage-deltas.md` (counted grammar, APPEND only).
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the tree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Coordination

A keyboard-invariant branch is landing concurrently; it owns `src/modules/keybindings/` and touches
`src/modules/app/Bootstrap.ts`. Keep any Bootstrap edit minimal; expect to merge a moved main before
you finish and re-run the checks after.
