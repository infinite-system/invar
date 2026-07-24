# Task: Grammar big-bang wave A — convert the `git` module (122 violations)

You are a builder agent in the Invar repo (this worktree, branch `grammar-wave-a-git`, based on main @ e1a10df). Phase 2 of the user-approved grammar big-bang: convert `src/modules/git/` fully to the FILE GRAMMAR and flip it to enforced.

## The law (read first)
- `project.conventions.md` section "Class kinds & file shape" — the FILE GRAMMAR (sequence; no detached behavior/data; protected floor; getters for constants; test colocation; blame hygiene).
- The reference conversion: `git log -p --follow src/modules/syntax/Highlighter.ts` (the pilot — study its $name collapse, protected static getters for tables, cached getters for expensive constructions, the subclass-override test pattern).
- `scripts/check-file-grammar.ts` — your acceptance instrument. `bun scripts/check-file-grammar.ts` prints git's violations (122 at inventory).

## Job
1. Convert every file in `src/modules/git/` until the checker reports git clean: helpers → protected methods; module consts (SHAs, regexes like blame HEADER, tables) → protected static getters (cached `$`-getter where construction is expensive); class-first layout; types below; `__tests__/` strays → colocated (the git module HAS a `__tests__/` directory — migrate it, atomic move+rename commits); no private/#/arrow fields.
2. ZERO BEHAVIOR CHANGE. Existing unit tests + the git harness smokes (git-blame, git-log, git-watch, gutter-diff, diff-overview) define the contract. Watch `this`-capture when converting closures; static vs instance follows what the member reads.
3. Flip `git` into `CONVERTED_MODULES` in `scripts/check-file-grammar.ts` IN THE SAME final commit that completes the conversion (the ratchet contract).
4. Append every grammar-only commit hash to `.git-blame-ignore-revs` (blame hygiene, recorded convention).

## Constraints
Full descriptive names. SKIP_GATE=1 commits, one commit per file-group (reviewable). No merge-gate runs (conductor gates). Check `pgrep -f merge-gate` before ANY smoke run; only run smokes on a quiet machine. No push/deletion. bun at $HOME/.bun/bin.

## Verify
`bun scripts/check-file-grammar.ts` exit 0 with git ENFORCED; tsc; bun test; git-family harness smokes solo 1/1 each (quiet machine): git-blame, git-log, git-watch, gutter-diff, diff-overview; checker --all + --refs clean.

## Done
Write `/tmp/wt-wave-a-READY.md`: files converted, notable decisions ($name collapses, getter cachings, any judgment calls), run tables, tip SHA. Then stop.
