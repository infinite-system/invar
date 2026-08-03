# Summary #469 — drive reads the app class graph

Landed: 22ee54d5 (get/waitFor) + 7f72091a (set), direct on main, conductor-executed
(user: "no, don't dispatch").

What happened vs the brief: everything in the brief shipped as specified —
GraphChannel beside StatusChannel under the same enablement, ports object as
the root namespace, refs unwrapped in the resolver, loud misses with
did-you-mean. The torn-read disagreement resolved as a SPLIT: no memory tear
(single-threaded JS), but between-frame transients are real — so waitFor
samples only at frame settle and the servicer requests the frame, while get
answers now. The brief's READ-ONLY rule was then re-chosen by the user the
same day: set exists as a separate explicit shape, experiment-only, and the
new record "Graph observation reads and never mutates" was refined to carry
that decision instead of being deleted.

What the conductor got wrong: the brief claimed the read-only invariant "is
written nowhere" as if it were the user's rule — it was the conductor's own,
and the user overrode it within hours. Also claimed methods would be excluded
from discovery lists; on ivue classes engine-bound methods surface as
prototype getters, so they appear (harmless, never evaluated).

Left undone: nothing from the brief. The #466 --gesture layer deletion in
Drive.ts remains a separate open item.
