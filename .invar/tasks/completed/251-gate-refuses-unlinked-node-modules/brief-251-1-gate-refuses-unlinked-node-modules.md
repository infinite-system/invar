# Brief — #251: the gate refuses a tree whose dependencies are not real

Read first:
`.invar/tasks/in-progress/251-gate-refuses-unlinked-node-modules/task-251-*.md`
— the incident, the mechanism (Bun auto-install masking an empty
node_modules while unlinked binaries broke the real-provider arms), and the
three-part fix are all there.

The shape: a PREFLIGHT in `scripts/merge-gate.sh`, before any step runs
(guards go first). It refuses when the dependency ground truth is absent:
`node_modules` missing or empty beside a `bun.lock`, or the provider
binaries the smokes need absent from `node_modules/.bin`. Derive the binary
list from ONE place (read what the harness actually resolves — do not
hardcode a scatter that rots). The refusal names the repair
(`bun install --frozen-lockfile`) and exits a DISTINCT code so a caller can
auto-repair deliberately.

THE APPARATUS RULE BINDS YOU: a change to the gate needs verification from
OUTSIDE the gate. Prove the preflight in a scratch worktree: plant an empty
node_modules, quote the refusal and its exit code; then a healthy tree,
quote the silent pass; then the distinct-code arm (a wrong-reason failure
must not wear the preflight's code). Do NOT run the full merge gate — the
preflight is separable and your controls prove it alone.

## Invariants in scope

- The gate's preflight contract (merge-gate.sh's header comment states the
  gate's own rules — extend it with the ground-truth clause).
- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — if a record should state "a
  verification run's dependencies are proven present", add it; if that
  belongs at the gate layer instead, say why.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy — you are reading the gate's preflight
neighborhood, where guards-go-first violations have bitten three times; look
for other checks that run after side effects. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

`bash -n` on the script; the three control arms above with exact exit codes
quoted; `bunx prettier --check` on anything touched. Do not run
`scripts/merge-gate.sh` in full. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
