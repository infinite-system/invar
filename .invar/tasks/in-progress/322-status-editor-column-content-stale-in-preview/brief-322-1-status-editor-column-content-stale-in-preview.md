# Brief #322-1 — status lies about the painted surface (two instances, one seam)

Read the [task record](task-322-status-editor-column-content-stale-in-preview.md)
first. Two observed instances of one defect family: the published status
fields describe a surface that is not the one painted.

1. Preview-only mode (#308): `editorColumnContent` stays
   `source-text-editor` while `editorSurfaceIdentifier` is
   `markdown.preview` and the grid holds only the preview.
2. Media demo (#324): `terminalVisible/terminalFocused/terminalColumns/
   terminalRows` report terminal state while the bottom panel's active
   content is `media-demo`. The "Bottom panel / terminal state" comment
   beside it carries the same drift.

Fix at the projection seam (`src/modules/app/AppStatusProjection.ts`),
not per-field. The generator of both lies is the same: fields derived
from a component's existence instead of from the painted content set.

## Order of work (drive first, always)

1. REPRODUCE BY DRIVING both instances before any change: enter
   preview-only mode, read the session's `status-<session>.json` via the
   harness `field` channel; open the 3D demo at 100x30, read the
   terminal fields. No assertion yet.
2. Iterate drive -> change -> drive. One instrument at a time. Do NOT
   run the contract suite while iterating.
3. Both polarities, per field family: the truthful value appears when
   the surface is active; the stale value does NOT appear; a planted lie
   goes red. Also drive the return path (preview back to editor; demo
   back to terminal) — restoration is half the contract.
4. Contracts only after the symptom is gone: unit assertions in
   `AppStatusProjection.test.ts` + a driven smoke assertion folded into
   an existing harness smoke (avoid a new smoke file unless the surface
   is genuinely new).
5. One verification pass at the END: `bunx tsc --noEmit; echo TSC=$?`,
   `bun test`, invariants checker `--all --refs` zero problems,
   conventions gate. Then the normal commit hook.

Scale parity: status projection is not per-row work, but drive both a
small and a large document open while switching surfaces. The
projection must not repaint or recompute per row.

## Invariants in scope

- Rendering is one coarse frame effect:
  [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md).
  Projection changes must not add render-path effects.
- Boot checks ivue static getter caching: same record. Binds if you
  touch `$`-getters in the projection class.
- NOTE a contract-layer gap: no record states "status tells the truth
  about the painted surface". If your fix earns one, propose it in the
  report (do not author a new record file without flagging it); if the
  gap belongs to a lattice, say so. Answer this section record by
  record in the READY report: upheld / violated / needs refinement,
  plus any record this list missed.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations in function, comment drift (the "Bottom panel / terminal
state" comment is already one instance; fix it as part of the task since
it names the defect's own fields), distillation possibilities, generator
drift, plain nonsense). Carry a `## Bycatch` section even if it reads
"None observed".

## End state (mechanically checkable)

A report file named `report-322-<slug>.md` (this task's slug) exists in
this folder, READY on line 1, with the commit hash of a clean
worktree whose enforcing hook printed GATE_EXIT=0. Do not push, merge,
or tag. The conductor lands.
