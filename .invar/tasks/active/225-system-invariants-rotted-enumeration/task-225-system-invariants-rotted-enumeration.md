# 225 — system.invariants.md enumerates its own population, and the list rotted

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Bycatch of #222. Two defects in one record file, both contract edits:

1. `src/modules/system/system.invariants.md` line 3 lists six namespaces; the
   layer holds ten. `Clipboard`, `FrameProbe`, `Momentum`, `TextSegmentation`
   are missing, and *Capability classes are stateless and Static wrapped*
   repeats the same six in its Evidence. This is enumeration-instead-of-
   discovery, one level up, in the contract layer itself. Prefer rewording to
   discovery ("every namespace under src/modules/system/") over refreshing the
   list — a refreshed list rots again.
2. The same header cites "the vendored `Static.ts`", which no longer exists
   (`project.conventions.md` requires `import { Static } from 'ivue/extras'`).

Zero problems from the checker afterward. #222's classification
(`analysis-222-classification.md`) is the evidence base; note Momentum's
purity is pending #224 and word the record so it stays true either way.

## Sources

- `.invar/tasks/completed/222-provider-seam-analysis-and-convention/` — report
  Bycatch items 3 and 4.
