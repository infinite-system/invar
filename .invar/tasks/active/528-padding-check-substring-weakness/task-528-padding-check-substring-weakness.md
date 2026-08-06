# 528 — padding check substring weakness

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The search smoke checks button padding by looking for a spaced word in
the whole row. A button with the wrong padding can still pass because the
words around it supply the spaces. Make the check measure the button's
own cells.

## Evidence (from #521 round-2 bycatch, 2026-08-06)

- The search smoke asserts one-key padding via the substring ` Cancel `;
  a two-cell surface also passes. The quit smoke asserts the true span.

## Outline

Assert the button's exact painted span (start cell, end cell, padding
cells) from the dialog's geometry projection, matching the quit smoke's
established form. Positive control: shrink the padding in a scratch run
and prove the new assertion fails.
