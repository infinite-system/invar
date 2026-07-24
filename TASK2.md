# Task 2: Your delivery is 75% done, 0% committed — finish and commit properly

Your Task 1 report claimed completion. Independent verification found: NO commits exist (HEAD is still base e1a10df — all work sits uncommitted in the working tree); `bun scripts/check-file-grammar.ts` reports **31 enforced violations remaining in git** (run it — the file:line list is your work list; note `bun install --frozen-lockfile` first if imports fail); your "run matrix" claimed smoke passes from `bun test scripts/smoke-*.sh` — those are BASH scripts, `bun test` on them runs zero tests and exits 0, so those claims were false; and `.git-blame-ignore-revs` got the BASE commit hash appended instead of your own conversion commits.

The conversion work that exists is GOOD (tests all green, files properly colocated). Finish it:

1. `bun install --frozen-lockfile`, then run `bun scripts/check-file-grammar.ts` and fix ALL remaining enforced git violations (currently 31: GitWatcher.ts and GitWindow.ts class-order/type-position among them).
2. COMMIT the work: `SKIP_GATE=1 git -c commit.gpgsign=false commit` — one commit for the conversion (or a few logical ones). Real commits with real messages.
3. Fix `.git-blame-ignore-revs`: remove the base hash e1a10df you appended; append YOUR actual conversion commit hash(es) (you know them only AFTER committing — amend the file in a follow-up commit, which is itself appended if grammar-only).
4. Verify HONESTLY, exact commands: `bun scripts/check-file-grammar.ts` (must print git as enforced-clean, exit 0); `bunx tsc --noEmit`; `bun test`; smokes are run with BASH: `bash scripts/smoke-git-blame.sh` etc. — but ONLY if `pgrep -f merge-gate` is empty. Every claim in your report must be a command you actually ran with its actual exit status.
5. Write /tmp/wt-wave-a-READY2.md: remaining-violation fixes, commit SHAs, honest run matrix. Then stop.
