# TASK — Merge the moved main into `feat-filetree-plugin`, adopt the contributor taxonomy, re-verify

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-filetree`
(branch `feat-filetree-plugin`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete —
the conductor lands it. Commit and append a merge section to `/tmp/filetree-plugin-READY.md`.

Main has landed the PLUGIN-KINDS taxonomy since you forked: `ApplicationPlugin` is now
`ApplicationContributor`, `WorkspacePlugin` is `WorkspaceContributor` (file names follow), the forced
application→workspace inheritance is REMOVED, and workspace participation is an explicit optional
`ApplicationContributor.workspaceContributor` port that Git and Markdown opt into with themselves.
The invariant *Plugin boundaries grant one authority* (project.invariants.md) now governs: a
contributor pushes registrations; a provider answers typed questions; a hosted runtime exchanges an
owned stream with one reactive owner.

Your branch implements the file tree as `FileTreePlugin` on the OLD contract names. Steps:

1. `git fetch origin && git merge origin/main`, resolve BY HAND (never script conflict markers).
2. Adopt the taxonomy, not just the spelling: `FileTreePlugin` presumably becomes
   `FileTreeContributor` (or keeps Plugin in its own name only if the taxonomy argues for it — say
   why either way), implements `ApplicationContributor`, and opts into workspace lifecycle through
   the explicit `workspaceContributor` port rather than inheritance. Your primary-dock-fallback field
   must land on the RENAMED contract. File-name-follows-class holds after any rename.
3. Sweep the old names bare: `grep -rn "ApplicationPlugin\|WorkspacePlugin" src scripts` must return
   nothing but justified historical mentions.
4. Re-run everything, exact exit codes: `bun install --frozen-lockfile`, `bunx tsc --noEmit`,
   `bun test`, `bun scripts/check-file-grammar.ts`, both invariant checker passes,
   `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
   `bash scripts/behavioral-contracts.sh`. Re-drive the tree path (open workspace, navigate, open a
   file, switch workspaces) three times, and re-measure activation (5 and 500 directories — the 2-query
   bound must hold). Note Tab now INDENTS in the editor; the host focus chord is Ctrl+Shift+J.
5. Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; leave the tree
   clean; append to the READY report: each conflict, the taxonomy adoption decisions, post-merge exit
   codes and the re-measured numbers.
