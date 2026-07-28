# 202 — the flyweight covers storage but not the switch interaction

State: TODO
Created: 2026-07-28

## Outline

The user diagnosed this themselves: "switching a tab to it, there is slight delay because i guess it
scans the whole file again."

Correct, and the code says so. `Editor.ts:352-355`: a clean background tab is dehydrated and its
document RELEASED; re-activation recreates it. `Editor.ts:380` — "the file was just reloaded into a
fresh document." So re-activating runs `openFile` → `loadFromFile`, a full re-read, and it invalidates
the wrap index for free because `EditorWrap.$wrapIndexByDocument` is a WeakMap keyed on the document
INSTANCE — a fresh document is a cache miss by construction.

**NOT the cause**, so nobody re-derives it: switching does not itself invalidate the wrap index. That
index survives activations for a retained document, and the empty-fold case uses a shared singleton so
the identity comparison cannot false-miss.

**Falsifiable check, run FIRST:** dirty tabs are never dehydrated. Type one character, switch away,
switch back — must be instant, while the same round trip on a clean tab pays the reload. If that
asymmetry is absent, this diagnosis is wrong.

**Why it is a defect and not a trade:** the substrate invariant forbids an INTERACTION whose cost is
O(total). A tab you switch to is observed, and switching is an interaction. The flyweight was applied to
background STORAGE — correctly, that is why idle memory is bounded — but re-hydration was left at
O(bytes).

Repairs ranked:
1. **A bounded hydrated set.** Keep the N most-recently-active documents hydrated. Alternating between
   two files — the dominant real pattern — becomes free, and memory stays bounded by N rather than tab
   count.
2. **Persist the derived geometry** across dehydration, keyed on path + size + mtime. The key is
   load-bearing: a stale cache here mis-renders silently.
3. **Streaming / lazy line index** so `loadFromFile` is O(viewport). The deepest fix, already the user's
   own suggestion, and the only one that also addresses launch (~621 ms) and RSS (~680 MB) at 1M.

Contract on COUNTS, not milliseconds: full-document reads per switch cycle must not grow with file size,
and for a re-activated recent buffer should be zero. Include a positive control — a check that counts
reloads can only fail toward "pass" if its counter is never incremented.

## Sources

None. Only the subject line above survives — no brief was written for this task.
