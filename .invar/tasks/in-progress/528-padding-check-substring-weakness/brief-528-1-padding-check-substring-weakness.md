# Brief 528-1 — the padding check passes a mis-padded button

## In plain words

A smoke checks button padding by finding a spaced word anywhere in the
row. A button with wrong padding still passes because neighboring words
supply the spaces. Measure the button's own painted cells instead.

## The deliverable, twice

CODE: the search smoke asserts the button's exact painted span (start
cell, end cell, padding cells) from the dialog's geometry projection —
matching the quit smoke's established form — not a substring.
VISUAL: none (test-integrity change).

## Evidence

#521 round-2 bycatch (completed): the search smoke asserts one-key
padding via the substring ` Cancel `; a two-cell surface passes it too.
The quit smoke asserts the true span — copy that form.

## The bar

Positive control: shrink the padding in a scratch run and prove the NEW
assertion fails (the old substring assertion would not have). Both
polarities. Full bun test + the search smokes green.

## Invariants in scope

None (harness-integrity). The button one-key-padding doctrine
(ui-design chapter 1/2) is the property being truly checked; state
conformance.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
