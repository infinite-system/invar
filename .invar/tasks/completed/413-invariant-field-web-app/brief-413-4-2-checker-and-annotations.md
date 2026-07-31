# Brief 413-2 — reuse the checker's algorithm; annotations are rank data

Addendum to brief 413-1. Scope unchanged; two inputs you must know.

## 1. The canonical parser/validator already exists

.claude/skills/invariants/scripts/check_invariants.mjs — single-file
Node, zero dependencies, --help prints usage. It IS the authoritative
algorithm for the contract layer:

- Parses every canonical record (schema, field presence, slug rules,
  kind derivation from section membership, legacy numbered headings).
- --all validates every contract in the checkout; --refs resolves every
  code annotation and lattice link; --score emits mechanical component
  JSON. Exit codes 0/1/2. CRLF/BOM normalized; fenced blocks inert.

Do NOT reinvent record parsing from scratch. Either import/adapt its
parsing (read the script; it is readable) or run it and consume its
output — but your scanner must agree with it about what a record IS.
Divergence between your parser and the checker is a bug in yours.
Note for your timeseries walk: the script validates the CURRENT tree;
for historical snapshots you run your parser over git-show'd file
contents — keep the parsing logic shared so history and present agree.

## 2. Code annotations are a rank component

Enforcement points carry comments: `invariant: <exact record name>
(<contract path>)`. The --refs run resolves them and prints coverage
lines for records with NO annotation, plus coverage-exempt records
(`Enforcement: review-time`). Statistics to extract and feed the rank:

- annotation count per record (reverse pointers = enforcement
  evidence; a record enforced at real code sites is closer to R than
  a paper-only record);
- coverage-exempt status (legitimate, but weaker than annotated);
- orphaned annotations at a snapshot (drift — outward pressure).

Annotation counts over TIME are also part of the timeseries: a record
gaining enforcement points is migrating inward.

## End state

Round-1 end state unchanged, plus: your READY names how your scanner
relates to check_invariants.mjs (shared/adapted/consumed) and the rank
formula shown in-app includes the annotation-coverage component.

## Invariants in scope

Unchanged from brief 413-1.

## Bycatch expected

Unchanged from brief 413-1.
