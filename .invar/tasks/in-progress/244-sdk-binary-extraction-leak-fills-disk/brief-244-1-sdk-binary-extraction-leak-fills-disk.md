# Brief — #244: stop the agent-sdk extraction leak; spawn nothing until the agent pane works

Read first:
`.invar/tasks/active/244-sdk-binary-extraction-leak-fills-disk/task-244-sdk-binary-extraction-leak-fills-disk.md`
— it carries the user's decision, the measured rate, and your first
diagnostic thread.

THE USER DECIDED THE SHAPE: lazy. The app must not start any agent-sdk
process — and must not cause the ~200MB binary extraction — until the user
actually works in the agent pane. If the pane needs a face before first use,
a plain PTY shell or an idle placeholder is acceptable. A smoke boot must
never touch the SDK.

The measured facts you build against:

- One merge-gate smoke pool (60 jobs) made 131 extractions, about 26GB, in
  under ten minutes. Two disk-full incidents in one night.
- A process census DURING the pool found zero live processes with an exe
  inside any extraction directory. The eagerly spawned process exits or
  fails immediately. Find WHERE the boot path spawns it and WHY it dies —
  that is your diagnosis section.
- The extraction directories are `/tmp/.<hex>-<counter>.claude-agent-sdk*`.
  The counter suffix suggests each spawn claims a fresh directory.

The work, in order:

1. Diagnose: trace the boot path to the spawn site (`SdkStreamBackend.ts`
   is the known consumer). Name the exact call chain in the report.
2. Fix at the generator: no SDK import, spawn, or extraction until first
   real use of the agent pane. Lazy module loading is acceptable; a config
   flag is not (the default path must be safe without configuration).
3. Backstop: at app exit (and defensively at boot), reap stale sibling
   extraction directories that no live process holds. Bound the sweep to
   the SDK naming pattern — never a general /tmp sweep.
4. Tell the conductor's interim reaper goodbye in the report: your fix
   replaces the loop whose pid sits in `/tmp/sdk-reaper.pid`; do not touch
   the loop itself.

Done-test, both polarities:

- Boot the app, never touch the agent pane, exit: the extraction-directory
  count is unchanged. Run a representative smoke: count unchanged.
- Then USE the agent pane (or drive its first-use path): the SDK spawns,
  works, and its extraction is accounted for — at most one live extraction
  per running app instance.
- Positive control: revert the lazy guard in a scratch tree, boot, quote
  the count growing.

## Invariants in scope

- The agent module's records (add one if none exists: an app boot leaves no
  unreaped binary extraction; the agent backend spawns on first use only).
- `scripts/harness/harness.invariants.md` — smoke boots are disk-bounded.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories — runtime defects especially:
you are reading the boot path and the agent backend, where an
immediately-dying eager spawn already hid for days. Why did nothing report
its death? A spawn that fails silently on every boot is its own finding.
The READY report carries `## Bycatch` even if it reads `None observed`.

## Verification

Full local verification (tsc, bun test, conventions, invariants checker),
exact exit codes quoted. Drive the real app for both done-test polarities —
no isolated-test-only proof. Do not run `scripts/merge-gate.sh` — the gate
is embargoed fleet-wide until this very task lands (your leak is why).
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`.
Prose STE-flavored.
