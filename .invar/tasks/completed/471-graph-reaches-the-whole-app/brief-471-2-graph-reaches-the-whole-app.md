# Brief #471 round 1 — the graph reaches the whole app

## In plain words

The harness can read the app's live state by path, but some parts of the app
are not reachable: the file tree and git counts live only in local variables.
Make everything reachable from the graph roots, and add short getters so
paths are short. Then prove it by driving the real app.

## Read first, in this order

1. [task-471](task-471-graph-reaches-the-whole-app.md) — the specification.
   Do not re-derive it.
2. [.claude/skills/drive-pty/SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md) — you will USE this instrument to
   verify your own work. The headless primary loop at the top is your loop.
3. [.claude/skills/ivue/SKILL.md](../../../../.claude/skills/ivue/SKILL.md) — the getters you add are ivue domain code.
4. `src/modules/system/GraphChannel.ts` and the ports object at
   `src/modules/app/Bootstrap.ts` near line 1420.
5. The census records that name the gap:
   [the census](../../active/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md)
   — search for "no model path".

## The work

1. **Reach the contributors.** `FileTreeContributor` (see
   src/modules/filetree/FileTreeContributor.ts:138) and `GitPlugin`
   (src/modules/git/GitPlugin.ts:460) hold state the graph cannot reach,
   because their instances exist only as Bootstrap locals. Make them owned
   members of a real object that the graph roots reach. Do not hand-curate a
   list of contributors — a membership list is a future gap. The rule: what
   the app's code can reach, the observer can reach.
2. **Shortcut getters.** Add REAL getters on the classes (never aliases in
   the channel): `workspaceSet.activeEditor`, `workspaceSet.activeDocument`,
   and any getter your own verification wants. ivue plain getters cost zero
   bytes. The channel stays a dumb mirror of the app.
3. **Keep reads surgical.** The resolver must keep evaluating only the
   getters a path names. Reach grows; evaluation must not.
4. The enablement gate is unchanged: a shipped binary exposes nothing.

## Invariants in scope

- [Graph observation reads and never mutates](../../../../src/modules/system/system.invariants.md) — your changes widen what it covers; it must stay true.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md).
- The ivue conventions (the skill) govern every getter you add.
- Any record this list MISSED is a finding about the conductor's map — say so.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the `## Bycatch` section even when it
reads `None observed`.

## PTY usability — the conductor is tracking this

Use the drive-pty loop for all verification: one warm server in YOUR worktree
(`--serve`, checkout-keyed), attach probes, `--reload` when state is dirty,
`--stop` when done. Your report MUST carry a `## PTY usability` section:
what was easy, what was confusing, what was MISSING that you wanted. Ask for
anything — the user wants this list.

## Verification

- Both arms, driven: a file-tree row count and a git changed count resolve
  through the graph AND track a live change you cause by real gestures; a
  wrong path still fails loudly naming the dead node.
- Re-check each census "no model path" item against your widened graph and
  list which are now migratable.
- `bun test` in FULL, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## End state

A report file in this folder, number-first per the task system naming, opening with `## In plain words`, carrying the invariants answered record by
record, the bycatch section, and the PTY usability section.
