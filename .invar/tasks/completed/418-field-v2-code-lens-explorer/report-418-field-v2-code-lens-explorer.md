# READY — Field v2 record explorer with code lenses

## Outcome

The work in the [Field v2 record explorer brief](brief-418-2-field-v2-code-lens-explorer.md)
is complete.

Selecting a field dot or record row now opens one full record lens. The lens
shows the name and invariant first. It then exposes every remaining record
field as its own accordion. It includes the ten-row rank calculation, lattice
memberships with their emergent guarantees, directed dependencies, and sibling
records. Every relationship can change the active record or composition.

Evidence, Mechanism, and enforcement-annotation references now open the real
repository source in a popup. Shiki 4.3.1 highlights TypeScript and Vue SFC
spans on the server. Annotation spans keep the matching `invariant:` comment
line visible and marked as the focus line. Missing references open an honest
unresolved state.

The scanner owns reference extraction and resolution. The client does not
parse contract prose. Exact paths stay exact. Only a bare filename can use a
unique-basename match. This rule prevents an absent
`src/modules/editor/TextDocument.ts` citation from silently rebinding to
`src/modules/text/TextDocument.ts`.

The new code endpoint accepts GET only. A write returns 405 with `Allow: GET`.
The endpoint confines current-tree reads by lexical path and real path, so a
symlink cannot escape the repository. It restricts historical reads to commit
hashes already present in the Field store. An outside-root request returns
403. A missing in-root file returns 404. The endpoint does not write any file.

## Commit

Commit `dbf81267b31df032e60d7e9e3d6dba9201f5aa4a` contains the complete change:
`feat(field-v2): add the record code lens explorer (#418)`.

The commit has 22 changed files, with 2,478 insertions and 98 deletions. The
worktree is clean. I did not push, merge, tag, or delete a branch.

The v1 diff is empty. The change does not touch
`tools/invariant-field-v2/ui/FieldView.vue`, which remains owned by the
parallel Field view task.

## Browser drive

The committed
`418-record-code-lens-browser-drive.ts` instrument drove real headless Chromium
against the current 377-record snapshot.

- It rendered 377 selectable record rows.
- It opened *Cost tracks the actively observed set*.
- It found nine field accordions after the invariant essence. Together they
  exposed all ten fields on that record.
- It opened all ten rank component rows.
- It found five relationship groups.
- It followed the directed dependency to *The terminal shows a bounded
  viewport*, then returned to the original record.
- It opened an enforcement annotation at line 8. The focus line contained the
  `invariant:` comment and one highlighted token.
- It opened the absent
  `src/modules/ui/PanelHeading.ts` citation on *Appearance is data with a
  capability fallback*. The popup said that the cited file does not resolve.
- It opened the absent
  `src/modules/editor/TextDocument.ts` citation on *Undo records deltas not
  whole-document snapshots*. The popup gave the same honest unresolved state.
- A TypeScript span contained 30 highlighted tokens.
- A Vue SFC span contained 39 highlighted tokens.
- An outside-root request returned HTTP 403.

The first drive exposed the exact-path rebinding defect. The scanner resolved
the dead editor path to the live text-module file by basename. The final drive
passed after exact paths stopped using basename fallback.

## Verification

- `bun test tools/invariant-field-v2` passed: 36 tests, 0 failures, and 177
  expectations.
- The tests cover present and absent spans, lexical and symlink confinement,
  GET-only behavior, deterministic TypeScript and Vue output, exact dead-path
  handling, complete record data, relationship navigation, and unresolved
  popup state.
- Root `tsc`, Field v2 `vue-tsc`, the known-bad Vue typecheck control,
  Prettier, file grammar, exported capabilities, design-token checks, and
  conventions passed.
- The invariant checker passed all contract structures. It resolved 1,286
  annotations and 231 lattice links with 0 problems.
- The one final commit-hook merge gate reported `GATE_EXIT=0`. It completed in
  4m12s. All 66 parallel PTY drives, behavioral contracts, three serial
  checks, and five input-order sessions passed. No step needed a retry.
- `git diff HEAD^ HEAD --stat -- tools/invariant-field` produced no output.
- `git diff HEAD^ HEAD --name-only --
  tools/invariant-field-v2/ui/FieldView.vue` produced no output.

## Positive controls

- Changing the outside-root endpoint response from 403 to 404 made
  `CodeLens.test.ts` fail with `Expected: 403` and `Received: 404`.
- Restoring the old basename fallback made the exact dead-citation test fail.
  It received the live `src/modules/text/TextDocument.ts` path instead of the
  unresolved `src/modules/editor/TextDocument.ts` path.
- Changing the annotation source label made the browser drive fail with
  `The selected record has no annotation lens.`

I removed each planted defect before the green verification pass.

## Invariant verdict

- [Cost tracks the actively observed set](../../../../project.invariants.md)
  remains upheld. The server creates the highlighter only on demand and starts
  no watcher, timer, or recurring scan.
- The scanner and generated store remain the source of record facts. The UI
  consumes exact reference and relationship identities instead of
  re-deriving them.
- The new endpoint invariant is upheld: source access is read-only and
  confined to the repository root.
- Parser and checker parity remains green.

No invariant changed status.

## Bycatch

- **GAP — no tool-local contract.** `tools/invariant-field-v2/` still has no
  colocated invariant record or lattice. The root cost record, parser parity,
  and this task's tests govern parts of the tool, but no local contract unifies
  the scanner, server, ranking, relationship, and code-lens promises.

No separate runtime bycatch was observed.
