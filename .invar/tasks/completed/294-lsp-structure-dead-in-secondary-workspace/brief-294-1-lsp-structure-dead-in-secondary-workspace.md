# Brief — #294: LSP + structure + types dead in a secondary workspace — USER-DIRECTED, top priority

Read first: [task-294-lsp-structure-dead-in-secondary-workspace.md](task-294-lsp-structure-dead-in-secondary-workspace.md)
— the user hit this live; his verbatim symptom is in the record.

Reproduce first, in the real app: create a second workspace pointing at
a TS project OUTSIDE the default tree (a temp fixture project with its
own tsconfig + a type-bearing import), open a .ts file there. Expected
per the symptom: structure pane empty, no hover types, no diagnostics —
while the default workspace works in the same session. Quote the
reproduction (status keys + frame evidence).

Then MEASURE the wiring before diagnosing — ranked suspects (report the
measurement even for the ones you clear):

1. LSP server project root / rootUri / cwd captured from the default
   workspace at boot; tsconfig discovery keyed once. "Types not
   loading" strongly implicates this — and structure feeds off the same
   analyzer.
2. Structure provider's supportsPath / watch bound to workspace #0's
   root.
3. The per-workspace plugin surface never re-binding language seams on
   WorkspaceSet.open / workspace switch.

Fix at the per-workspace generator, ONCE — not one patch per symptom.
Both polarities driven: the secondary workspace gains structure + hover
types + diagnostics; the default workspace stays fully intact; a
workspace switch re-targets cleanly in BOTH directions (and back).
Positive control: re-plant the single-root capture — the secondary-
workspace arm must go red.

## Invariants in scope

The LSP/TypeScript provider records; the structure records
([structure.invariants.md](../../../../src/modules/structure/structure.invariants.md)
— answers-or-declines must hold: a genuinely unsupported file still
declines, it does not hang); the workspace confinement records in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) or their
actual home — locate, don't assume; plugin lifetime records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: reproduction quoted, suspect measurements ranked, one
generator fix, both polarities + switch both directions driven, planted
regression red, green `bun test` + structure/manifest/editor smokes.
The conductor gates at landing.
