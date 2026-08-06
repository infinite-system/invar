# Brief 534-1 — workspace search backend (Find/Replace milestone 3)

## In plain words

Build the engine that finds text across the whole workspace: streaming
results, include and exclude filters, ignore rules, a match cap,
cancellation, and overlays from open unsaved files. No visible panel in
this task — milestone 4 builds it. The deliverable is code plus driven
proof; the visual deliverable is "no visible change".

## Source of truth

[project-find-replace-design.md](../../../../project-find-replace-design.md)
sections 4, 13 (Milestone 3), 14. Milestone 1 landed (#521: FindInBuffer
returns TextEdits, query options), Milestone 2 landed (#532: arena,
patches, coordinator). Reuse their generators — query compilation is
SHARED with FindInBuffer, not a second engine.

## Scope (Milestone 3 verbatim)

- Add `WorkspaceSearchWorkspace` and the streaming ripgrep backend.
- Add query compilation and replacement expansion shared with
  `FindInBuffer`.
- Add include, exclude, ignore, cancellation, and the 20,000-match cap.
- Overlay live open-document results on disk results.
- Drive 10-line and 100,000-line workspace fixtures.

## The bar

DRIVE ADVERSARIALLY. Both polarities everywhere: the cap must trip on a
planted 20,001st match; cancellation must provably stop the stream
mid-flight (count-based, not time-based); the overlay must show an
unsaved edit's match that disk does not have AND hide a disk match the
unsaved edit removed; ignore rules must both include and exclude on
command. Scale parity: same assertions at 10 and 100,000 lines. If
ripgrep is not present on this machine, that is a finding to report, not
to code around silently.

## Invariants in scope

- [search.invariants.md](../../../../src/modules/search/search.invariants.md)
  — answer record by record.
- "Seams are drawn at the shared generator"
  ([project.invariants.md](../../../../project.invariants.md)) — one
  query compiler for in-file and workspace search.
- The design's four proposed records remain proposals — do not apply.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
