# 199 — Find reveal paints the active target line blank at 500k

State: TODO — not yet diagnosed
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: user-directed

## Outline

Find's reveal paints the active target line **blank** at the bottom of the viewport in a 500k-line file.
**The gutter and the cursor are correct** — so the row is being positioned right and only its text is
missing.

### Provenance

**User-reported during the scale testing session**, and confirmed as **real bycatch, pre-existing at the
merge base** — it is not caused by the flyweight work that surfaced it. Filed from #187's landing gate
alongside #198, and carried explicitly into #196's landing decision as one of two caveats on that green.

### Not yet diagnosed

No mechanism has been proposed. The one constraint the observation gives: **whatever positions the row
is working, and whatever fills it is not** — which points at the reveal path's interaction with the
viewport's row materialisation rather than at scroll positioning.

Worth pairing with #202 (tab re-activation re-reads the whole file), since both are places where the
flyweight covers storage but an INTERACTION was not re-measured against it. **When work extends a
subsystem for a new case, re-measure the old case** — the general rule both belong to.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
