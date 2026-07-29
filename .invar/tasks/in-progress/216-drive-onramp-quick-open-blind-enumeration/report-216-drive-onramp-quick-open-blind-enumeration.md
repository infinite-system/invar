# READY — #216 (Drive on-ramp and Quick Open blind enumeration)

Commit: `d3d3ada149c11b1191d1b179df811a4b63b1b37e`

The worktree is clean. I did not run `scripts/merge-gate.sh`. I did not push,
merge, tag, or delete a branch.

## Result

Quick Open no longer reports an empty Git fallback as complete when ripgrep is
unavailable. It publishes `degraded` with this message:

`enumeration degraded — install ripgrep or open a git-tracked folder`

The empty degraded view shows that message instead of `(no matching files)`.
The input row keeps a warning icon without repainting the long message over the
result body.

Drive now creates default, file-copy, scale, and home directories under the
system temporary directory. It removes generated workspaces after each run.
It resolves the repository from `Drive.ts`, so the caller's cwd cannot redirect
the app root.

The existing Quick Open PTY smoke now removes ripgrep from `PATH`. Its Git repo
contains only an ignored file. The smoke checks the published state, message,
painted text, and absence of the ordinary empty-match text.

## Reproduction

The default large drive passed before the change because this Codex environment
adds ripgrep to `PATH`.

I removed that path entry without uninstalling anything. Both baseline drives
then reproduced the defect:

- `env PATH=/home/parallels/.bun/bin:/usr/bin:/bin bun run drive --size 10 --key Control+End`
  exited `1`.
- The same command with `--size 100000` exited `1`.
- Both grids showed `(no matching files)`.
- Both timed out at `Quick Open to rank the requested file`.
- `git check-ignore` named `.gitignore:33:tmp/` as the exclusion source.

After the Quick Open state fix, the ignored workspace published `degraded` and
painted the recovery message. After the Drive fix, both no-ripgrep scale drives
exited `0` and reached their last line.

## Scale and front-door drives

- No ripgrep, 10 lines: exit `0`, cursor reached line 10.
- No ripgrep, 100,000 lines: exit `0`, cursor reached line 100,000.
- Ripgrep present, 100,000 lines: exit `0`, cursor reached line 100,000.
- Caller cwd `/tmp`, 100,000 lines: exit `0` through the absolute `Drive.ts`
  path.

Each generated workspace root was under `/tmp/invar-drive-fixture-*`, outside
the repository.

## Positive controls

I forced the empty Git branch back to `state: 'complete'`. The gated Quick Open
smoke exited `1` at:

`Timed out waiting for grid condition: Quick Open to publish and paint the degraded empty Git fallback`

Its final grid showed `(no project files)`. This proves the smoke detects the
old false-complete behavior. I restored the degraded branch, and the smoke
reported `ALL-PASS`.

The original no-ripgrep Drive runs were the on-ramp control. They failed inside
the ignored repository path before the fix. The repaired command passed from
the worktree and from `/tmp`.

## One-sighting probe

I ran this exact command three times:

`bun run drive --key Control+p --key s --key c --key a --key l --key e`

All three attempts exited `0`. Quick Open stayed open and the final query was
`scale`. I could not reproduce the one-sighting, so I left it parked.

## Final verification

One final pass produced these exact results:

- `bunx tsc --noEmit`: exit `0`.
- `bun test`: exit `0`, 1,754 passed, 0 failed, 67,871 expectations.
- `bash scripts/conventions-gate.sh`: exit `0`.
- `bunx prettier --check .`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit `0`, 958 annotations, 67 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit `0`, 322 files inspected.

The change strengthens `File enumeration failures stay visible`. The harness
keeps condition-based waits and the real PTY path. Invariant verdict: PASS.

## Bycatch

No out-of-scope bug was observed.
