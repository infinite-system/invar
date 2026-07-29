# Brief — #216: fix drive's on-ramp and make empty enumeration visible

Read first: [.invar/tasks/active/216-drive-onramp-quick-open-blind-enumeration/task-216-drive-onramp-quick-open-blind-enumeration.md](task-216-drive-onramp-quick-open-blind-enumeration.md).
It carries both defects with their mechanism. Reproduction is deterministic:
`bun run drive --size 100000 --key Control+End` on an unmodified tree.

## The two fixes, in order

1. **The invariant first: an empty scan must not report complete.** When
   ripgrep is absent AND the git fallback returns zero files,
   `enumerateProjectFiles` currently returns `state: 'complete'` with zero
   files. Make that state `degraded` (or equivalent existing vocabulary), and
   make Quick Open SAY it ("enumeration degraded — install ripgrep or open a
   git-tracked folder"), not "(no matching files)". The cited record is *File
   enumeration failures stay visible* — read it before choosing the vocabulary.
2. **The on-ramp: drive's scratch workspace moves out of the ignored path.**
   `tmp/drive/...` is inside `.gitignore`, so the git fallback cannot see it by
   construction. Put the scratch workspace outside the repo (mktemp-based, the
   way `scripts/make-scale-workspace.ts` builds its corpora) so the on-ramp
   works with or without ripgrep. Do not add an rg install requirement — the
   fallback must be honest instead.

Also reproduce-or-park the one-sighting: `--key <letter>` after `Control+p`
reported `quickOpenOpen=false` once (#122's report names the exact
invocation). Three attempts; if it will not reproduce, record the attempts in
the report and leave it.

## Positive controls — both fixes

- Plant the degraded condition (rg absent + ignored dir): the UI must say
  degraded, and the smoke asserting it must go red when you force
  `state: 'complete'` back.
- The repaired on-ramp: `bun run drive --size 100000 --key Control+End` exits
  0 on this machine, and a second run from a DIFFERENT cwd also exits 0.

## Verification

Exact exit codes: tsc, bun test, conventions-gate, prettier --check,
check_invariants (at or above 957/67/0), coverage ratchet. Drive the real
Quick Open path with and without rg on PATH (PATH surgery in the harness, not
uninstalling anything).

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Leave the tree
clean. Prose per [.claude/skills/ste-expression/SKILL.md](../../../../.claude/skills/ste-expression/SKILL.md), flavored. Report
bycatch explicitly.
