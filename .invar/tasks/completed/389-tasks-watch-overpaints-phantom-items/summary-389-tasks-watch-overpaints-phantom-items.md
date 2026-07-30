# Summary #389 — tasks watch phantom rows

Landed b982c493 (branch 87eaab00), 25m. The brief's shrink hypothesis was
half right: the logical-row diff already cleared removed rows; the real
generator was AUTOWRAP — one logical row occupying several physical rows.
Fix clips to live PTY width with SIGWINCH refresh. Count-based contract +
positive control. Bycatch: one known starvation retry, no conversion.
