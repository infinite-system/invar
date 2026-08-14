# READY — 564 describe depth references and verbatim form

## In plain words

Shape answers now come as real TypeScript, verbatim from the source,
doc comments included — and they name every type they point at.
--depth unpacks referenced types in place as a small self-contained
d.ts; circular types stop at a marker instead of looping. JSON stays
one flag away for tools.

## Delivered

- references on every answer (catalog names found in type texts).
- --depth N: TS form appends referenced declarations breadth-first;
  JSON form inlines expanded members; both cycle-guarded.
- Verbatim default: catalog stores each declaration's source text plus
  its leading JSDoc (getText drops leading trivia — extracted from the
  attached jsDoc nodes); classes render from method signatures.
  --json keeps the structured answer; server ?form=typescript.
- 61 tests incl. flat-at-depth-1 silent arm, never-loops arm, doc
  comment arm.

## Invariants in scope (answered)

- One authority, many projections: strengthened — the answer is now
  the authority's own words, not a re-encoding.
- No store/arrow change; #558's no-drift test untouched and green.

## Verification

- Driven: describe tasks.all (verbatim + references trailer),
  --depth 2 (both declarations, mini d.ts), HarnessContributor (doc
  comment rides), HarnessVerbs (class signatures), --json structured.
- FOUR GATE ROUNDS, honestly accounted: r1 red = my tsc cast error +
  stale catalog (real, fixed) + diff-overview (#549 5th sighting
  appended). r2 red = the cycle test — MISATTRIBUTED to my mid-gate
  edits. r3 red on an untouched tree exposed the truth: the cycle
  guard NEVER fired (self-name excluded from reference hunt) and the
  test was red since birth behind tail-cropped test output. Fixed;
  r4 GREEN (GATE_EXIT=0, /tmp/gate-564-r4.log).

## Bycatch

- Measurement lesson (for conductor md + #565's test verb): piping
  test output through tail crops the fail line — a claim of green
  must come from parsed counts, not a glance at the last lines.
- Conductor process lesson: never edit a worktree while its own gate
  runs (r2's confusion was self-inflicted even though the bug was
  real).
