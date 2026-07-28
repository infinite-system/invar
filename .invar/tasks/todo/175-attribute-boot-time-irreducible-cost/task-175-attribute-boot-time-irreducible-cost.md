# 175 — attribute the ~300 ms boot and decide what is irreducible

State: TODO — brief not yet written
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

### The measurement

Boot is **~300 ms and UNCHANGED** across the scale work: **308 ms default, 290 ms at 100k lines**. Flat
in document size, which is the interesting part — it means the cost is not the document.

Nobody has attributed where those 300 ms go. That is the task: attribute it, then decide what portion is
irreducible and say so explicitly.

### Why it is the half worth doing

**This is the half that would make the app faster for the USER rather than for the suite.** Most of the
performance work in this period made instruments and gates faster or made scale behaviour correct;
300 ms of boot is felt on every single launch by a human.

### Its relationship to the scale work — a distinction to keep

**Opening may not be fast. Editing should be.**

#186 fixed the EDIT path. Loading 37 MB and splitting it into 500,000 lines is startup work that nobody
has attributed — that is this task. The two were repeatedly conflated when the user reported slowness,
and separating them is what let the edit-path claim be made honestly: *"if the open feels slow, that is
a real and separate finding."*

### Pairing

**#205 would give this a contract to land against** — peak RSS and launch time as gated numbers rather
than observations. Attribution without a contract regresses silently; a contract without attribution
gates a number nobody can explain. They are worth more together than separately.

## Sources

None in this folder — the brief was never written. Detail above recovered from the session transcript
(`faf7e858-…jsonl`).
