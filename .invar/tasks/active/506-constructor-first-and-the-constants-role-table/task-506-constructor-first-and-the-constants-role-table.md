# Task 506 — constructor first, and the constants role table

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words (user-blessed 2026-08-05)

Two monoform rules. First: a class with a constructor puts it FIRST
(after the class line; comments/annotations may precede) — 85 of 113
classes currently violate; sweep them and enforce in the file
grammar. Second: constants have one form PER ROLE, written down with
the REASON (subclass getter overrides dispatch correctly even during
parent construction; field overrides only apply after — the
mechanism, not taste).

## The constants role table (write into project.conventions.md + the ivue skill)

1. Tunable or overridable class constants -> `static get
   SCREAMING_CASE` (the house form, 161 sites; read via the receiving
   class per the ivue static ladder).
2. Protocol/byte constants in hot paths, never overridden -> `static
   readonly` field (the 24 TerminalEmulator-family sites); each gets
   a one-line comment naming the hot-path justification.
3. Contributor/pane identity data -> instance `readonly camelCase`
   field (53 sites; interface data, not tunables).
4. Extensible construction -> field initialized from a `createX()`
   factory METHOD (prototype dispatch makes it construction-safe —
   same mechanism as rule 1; say so in the doc).
5. Anything else pretending to be a constant is a defect.

## The sweep

- Move 85 constructors to the top (order after the move: statics ->
  constructor -> state getters -> prop getters -> derived getters ->
  methods, per the blessed order). Semantically safe (field
  initializers keep their own textual order), but bun test + tsc are
  the net, and spot-drive TerminalInstance + one pane class.
- Add `constructor-first` to check-file-grammar's class-file-order
  family, enforced for converted modules like its siblings; both
  arms proven (a planted violation reds; the swept tree greens).
- Triage the 13 PLAIN never-touched scalar fields (requestId,
  generation, nextTicket ...): each is either mutated in a form the
  census missed (then leave, add readonly if honest), missing
  readonly, or DEAD (then remove, declare coverage if a test dies).
  Report the 13 verdicts in a table.

## Invariants in scope

Check project.invariants.md public-namespace/overridable-construction
records and layout/terminal contracts for records citing member
order; answer record by record. The ivue skill's spacing section is
DOC, update it in the same change.
