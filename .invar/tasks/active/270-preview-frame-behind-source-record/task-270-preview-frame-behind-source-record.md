# 270 — a settled frame showed the preview one revision behind the source

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: correctness-vs-record

## Outline

Bycatch of #268, seen once: in the probe's SETTLED frame the editor showed
the typed edit ("AX tiny project…") while the auto-opened preview still
painted the pre-edit paragraph ("A tiny project…"). The markdown split
record lists "editing source while the visible preview remains on an older
revision" under Impossible-if-true — so either:

- the observation is a real record violation (the settled frame is the
  user-visible state; a stale preview in it is exactly what the record
  forbids), or
- the record's wording means "indefinitely stale" and a one-frame debounced
  reparse is intended — in which case the record must SAY so (bounded
  staleness, the bound named), and the settled-frame contract (#266's
  territory: debounced work not in the settle condition) is the actual
  defect.

Reproduce first (probe committed in #268's folder:
`probe-268-wrap-off-grid.ts`); decide which of the two; fix the code or
sharpen the record — never both vague. Coordinate with #266 (drive settle
ignores debounced parse) — if #266 lands first, its quiescence keys may
make this reproduction impossible, which IS the fix; verify and close with
that evidence.

## Update 2026-07-29 08:5x (conductor)

#266 LANDED (2dd57fee): the Drive settle now requires
`markdownRevision === bufferRevision`, so the settled-frame REPRODUCTION
of this defect is impossible at the instrument. What remains of this task
is ONLY the record question: the markdown split record's
Impossible-if-true clause says "editing source while the visible preview
remains on an older revision" — decide whether that means indefinitely
stale (then the record stands and the debounced one-frame lag needs the
record to name its bound) or whether the wording must be sharpened.
#266 explicitly did not edit the record. Scope shrank: record
reconciliation only, no instrument work.

## Invariants in scope

- [src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md) — the split record's
  Impossible-if-true clause; [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) —
  the settled-frame contract.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- [report-268-editor-smoke-vs-auto-open-red-main.md](../../completed/268-editor-smoke-vs-auto-open-red-main/report-268-editor-smoke-vs-auto-open-red-main.md), Bycatch 3; #266.
