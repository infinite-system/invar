# Brief — #233: the wrap contract red and the settings leak (GATE BLOCKER)

Read first: `.invar/tasks/active/233-wrap-contract-red-settings-leak/task-233-wrap-contract-red-settings-leak.md`
— it carries the full evidence chain, three ranked candidates, and the
isolated-arm twist (the bare-HOME run fails with an EMPTY scrollTop, a second
failure mode that must also be explained).

## Order of work

1. Reproduce both modes: real HOME → `scrollTop=151`; bare mktemp HOME →
   `scrollTop=` empty. Quote both.
2. Explain the 151: confirm or refute that the contract's app run reads
   `~/.config/invar/settings.json` and that `wordWrap: false` produces the
   logical-line cap. Plant/remove in an ISOLATED config for both polarities.
3. Explain the empty: what does the probe need that a bare HOME lacks?
4. Fix the instrument: every behavioral-contract and drive run gets a hermetic
   HOME/XDG (complete: config + data + first-run needs). Defaults first is
   doctrine; a contract reading user config is not measuring defaults.
5. Find the writer: what wrote the USER'S real settings file at 01:29:36?
   Enumerate the code paths that persist settings and which harness runs
   execute them against the real HOME. The inverse control: a full contract
   run must leave `~/.config/invar/settings.json` byte-identical (hash before
   and after). DO NOT edit or "fix" the user's settings file — whether
   wordWrap:false is their preference is theirs to say.

## Invariants in scope

- The wrap/scroll record the wrap-mode contract cites (find it; state whether
  it names the defaults assumption) — `scroll.invariants.md` /
  `src/modules/editor/` records.
- `project.conventions.md` defaults-first doctrine.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

Exact exit codes; the repaired contract green under hermetic HOME on plain
main AND red with the planted wordWrap:false; the byte-identical inverse
control quoted. Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored. Scratch tooling in your task folder, full names, headers.
