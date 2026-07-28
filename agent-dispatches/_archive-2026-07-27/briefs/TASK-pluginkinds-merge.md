# TASK — Merge the moved main into `refactor-plugin-kinds` and re-verify

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-pluginkinds`
(branch `refactor-plugin-kinds`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete —
the conductor lands it. Commit and append a merge section to `/tmp/plugin-kinds-READY.md`.

Your branch (the ApplicationPlugin→ApplicationContributor / WorkspacePlugin→WorkspaceContributor
rename, the removed forced inheritance, the `workspaceContributor` port) forked from `bf07aba`.
Main has since moved: the KEYBOARD INVARIANT landed (`0b7ad0a`: Tab indents in the editor, F-keys
retired for proven chords, terminal pass-through) plus a conductor-log commit (`63a9923`).
`git merge main` conflicts at least in `src/modules/app/Bootstrap.ts` and
`src/modules/workspace/Workspace.ts`.

Steps:
1. `git fetch origin` then `git merge origin/main` and resolve BY HAND (no script rewriting of
   conflict markers — a python conflict resolver produced duplicate object keys here once and only
   tsc caught it). Union both sides' intent: main's keyboard changes are behavioral, yours are
   renames — they compose. Where main added code naming `ApplicationPlugin`/`WorkspacePlugin`,
   apply your rename to the incoming code.
2. After the merge, sweep for the OLD names with no quoting assumption:
   `grep -rn "ApplicationPlugin\|WorkspacePlugin" src scripts --include='*.ts'` must return only
   deliberate historical mentions in comments/invariants (justify any). File-name-follows-class
   must still hold.
3. Re-run EVERYTHING against the merged tree, exact exit codes: `bun install --frozen-lockfile`,
   `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`, both invariant checker
   passes, `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
   `bash scripts/behavioral-contracts.sh`. Re-drive `smoke-keyboard-invariant.sh` once (it landed
   with main and exercises Bootstrap, one of your conflict files) and any smoke touching files you
   resolved, three runs each.
4. Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; leave the tree
   clean. Append to the READY report: each conflict, how you resolved it, post-merge exit codes.
