# 222 — the convention text, the gate rule, and the migration cost

Analysis only. The convention text below is ready to paste. The gate rule is written, run, and
proved with five controls. No production file is committed by this task.

## Part 1 — convention 12, ready for [AGENTS.md](../../../../AGENTS.md)

Paste after convention 11 in the "Non-negotiable conventions" list in [AGENTS.md](../../../../AGENTS.md), and add the
matching paragraph to [project.conventions.md](../../../../project.conventions.md) under a new "Capability access" heading.

> 12. **An EFFECTFUL capability is reached through a getter. A PURE one is called directly. The
>     `Class` slot stays the global default.**
>
>     A capability namespace is EFFECTFUL when its own module imports a `node:*` builtin or reads
>     one of `process`, `Bun`, `Date`, `performance`, `globalThis`, or when it imports a sibling
>     that already is. `Files`, `Processes`, `Clock`, `Clipboard`, `Environment`, `Logging`,
>     `StatusChannel`, `FrameProbe` are effectful. `TextSegmentation`, `UndoStore`,
>     `TextCoordinates`, `TextEditing`, `ScrollbarGeometry` are pure. The folder does not decide.
>     The effect decides. The gate discovers the list; do not maintain one by hand.
>
>     A consumer of an effectful capability declares one late-dependency getter and reads through
>     it:
>
>     ```ts
>     protected get Files() {
>       return Files.Class;
>     }
>     // static consumers use `protected static get Files()`; the call site is `this.Files` in both.
>     ```
>
>     A consumer of a pure generator calls `TextSegmentation.Class.graphemes(text)` directly. A
>     getter around a pure function buys nothing and costs a lookup on every read.
>
>     **The getter and the slot are both, not either.** The getter selects PER REGION: one
>     subclass, one test, one connection, one workspace. The mutable `Class` slot selects for the
>     PROCESS: a kernel or a plugin installs a different default for everything that did not
>     choose. A getter with no slot cannot state a global default. A slot with no getter cannot
>     hold two choices at once. Two live database connections on two engines is the case that
>     needs both.
>
>     **INTERFACE HONESTY.** Convention 2's tell applies to a provider seam without change: if a
>     provider must SUPPRESS the seam's core to fit, the interface is wrong and the shared thing
>     is a sub-part. A provider that returns an empty list, throws "not supported", or ignores an
>     argument for its whole life is that tell. Peripheral configuration is exempt. When it fires,
>     split the seam. Do not add a capability flag and keep going: a flag turns every consumer
>     into a branch, which is the cost the seam was drawn to remove.
>
>     **A capability with its own test hook is a capability with no seam.**
>     `Clock.freeze` exists only because nothing could substitute `Clock`. Delete the hook when
>     the seam lands.

### Why the getter and not the slot alone

Recorded so the next reader does not relitigate it.

- The slot is process-wide. Two connections on two engines cannot both hold it.
- The slot must be restored after a test. A getter override is scoped to the subclass and cannot
  leak.
- The tree already votes for the getter. 42 seam getters exist in production. The slot is
  assigned in two test files, neither of them a capability. `mock.module` and `spyOn` appear zero
  times.
- `extends X.Class` is already forbidden (gate rule 1.8) for the same reason: a mutable slot read
  eagerly pins a generation. A getter is the late read the invariant *Imported dependencies are
  read late* ([project.invariants.md](../../../../project.invariants.md)) already requires.

The convention adds no new mechanism. It names one that four modules invented separately.

## Part 2 — the gate rule

**Rule 1.58, EFFECT-SEAM BOUNDARY.** Subject is source text, so it belongs in
`scripts/conventions-gate.sh`, per the "where a check belongs" rule in [project.conventions.md](../../../../project.conventions.md).

Two files are proposed, both written and run in this worktree, neither committed to production:

- `scripts/check-effect-seams.ts` — the checker. A copy is in this task folder as
  `proposed-222-check-effect-seams.ts`.
- `scripts/effect-seam-baseline.txt` — the shrinking baseline, 71 rows. A copy is in this task
  folder as `proposed-222-effect-seam-baseline.txt`.

### The design, and the two rules it obeys

**It DISCOVERS its population.** The effectful set is computed by parsing the capability roots and
applying the criterion, then closing over sibling imports. There is no list of effectful
namespaces in the script. [project.conventions.md](../../../../project.conventions.md) says a population test that enumerates its
population reports green over a shrinking fraction of it. An effectful capability added tomorrow
is governed on the day it is added.

**It is a SHRINKING BASELINE, not a zero.** 254 bare sites exist today. `--require-zero` would
fail on day one and be switched off, which is worse than no rule. The baseline is the mechanism
`scripts/plugin-boundary-baseline.txt` already uses: a file and namespace pair with bare sites
must carry a row with a maximum. A pair with NO row fails on its first bare site. So new coupling
blocks today while the known sites convert task by task, and a decrease prints tightenable slack
instead of failing an improvement.

Completeness guards, both from a source independent of the discovery:

- refuse to pass having inspected zero capability files;
- refuse to pass when the discovered effectful set is empty, and say the criterion cannot be
  right.

### The gate hunk

```diff
--- a/scripts/conventions-gate.sh
+++ b/scripts/conventions-gate.sh
@@
 # 1.57) CHANGE-FACT BOUNDARIES: a document wrapper must forward the edit delta as well as the
 #       familiar line/count/revision surface, or downstream incremental paths silently rebuild.
 if ! "$bun_binary" scripts/ast-query.ts document-change-fact-boundary-census \
   --require-zero; then
   echo "CONVENTIONS FAIL: document wrapper drops the change fact"
   fail=1
 fi
+
+# 1.58) EFFECT-SEAM BOUNDARY: an EFFECTFUL capability is reached through an overridable getter,
+#       never through the bare `X.Class` slot. A PURE generator stays direct. The effectful
+#       population is DISCOVERED by parsing the capability roots for a `node:*` import or an
+#       ambient capability global, never enumerated, so a capability added tomorrow is governed
+#       on the day it is added. Existing coupling is held by a SHRINKING baseline
+#       (scripts/effect-seam-baseline.txt), the same mechanism the plugin-canvas boundary uses:
+#       a file/namespace pair with no row fails on its FIRST bare site.
+if ! "$bun_binary" scripts/check-effect-seams.ts; then
+  echo "CONVENTIONS FAIL: effect-seam boundary"
+  fail=1
+fi
```

Regenerate the baseline after a conversion with
`bun scripts/check-effect-seams.ts --print-baseline > scripts/effect-seam-baseline.txt`, and
review the diff. The file only shrinks.

### Positive controls — planted, run, quoted, removed

Green before every plant and after every removal:

```text
effect seam: 9 effectful of 11 capability namespaces; 254 bare site(s) across 71 file/namespace pair(s)
exit 0
```

**Control 1 — new coupling to a namespace this file does not use.** Added
`if (Files.Class.exists('/tmp')) return 0;` to `copySelection` in `src/modules/ui/HoverCard.ts`,
which has a `Clipboard` row and no `Files` row.

```text
CONVENTIONS FAIL: effect seam — Files is EFFECTFUL (imports node:fs, imports node:path, imports node:os) and is reached bare, with no baseline row:
  src/modules/ui/HoverCard.ts:569  Files.Class
  Add a seam getter — protected get Files() { return Files.Class; } — and read it through this.
exit 1
```

**Control 2 — an existing pair grows.** Added `void Clipboard.Class.lastBackend;` beside the
existing `Clipboard` site in the same file.

```text
CONVENTIONS FAIL: effect seam — src/modules/ui/HoverCard.ts	Clipboard rose to 2 bare site(s), above its baseline of 1
exit 1
```

**Control 3 — the discovery under-finds.** Cut `capabilityRoots` down to
`['src/modules/storage']`, which leaves one pure namespace and nothing effectful.

```text
CONVENTIONS FAIL: effect-seam check found no effectful capability among 1 files — the criterion cannot be right
exit 1
```

This is the control that matters most. It is the guard against the failure the rule is designed
to avoid: a discovery that silently finds nothing and reports green.

**Control 4 — the rule must NOT fire on a pure namespace.** Added
`void TextSegmentation.Class.graphemes(text);` to the same method.

```text
effect seam: 9 effectful of 11 capability namespaces; 254 bare site(s) across 71 file/namespace pair(s)
exit 0
```

A rule that flags everything is not a rule about effects. This control proves the pure and
effectful split is live.

**Control 5 — a conversion is recognised.** Replaced the bare `Clipboard.Class.copy(text)` with a
`protected get Clipboard()` getter plus `this.Clipboard.copy(text)`.

```text
effect seam: src/modules/ui/HoverCard.ts	Clipboard is tightenable — 0 bare site(s), baseline 1
effect seam: 9 effectful of 11 capability namespaces; 253 bare site(s) across 70 file/namespace pair(s)
exit 0
```

The count fell by one and the row became tightenable. The rule rewards the conversion it asks
for.

Every plant was removed with `git checkout`. `git status` shows no modified tracked file.

## Part 3 — the migration cost

One getter per class, then one rewrite per bare site. Zero sites sit at module level, so no site
needs restructuring. The "new getters" column subtracts the classes that already declare one.

| namespace | files to touch | new getters | sites to rewrite | verdict for #223 |
| --- | ---: | ---: | ---: | --- |
| `Clock` | 2 | 2 | 2 | CONVERT — first |
| `Processes` | 6 | 7 | 9 | CONVERT — second |
| `Files` | 22 | 22 | 98 | CONVERT — third, and the real work |
| `Clipboard` | 8 | 8 | 12 | DEFER |
| `Logging` | 11 | 11 | 18 | DEFER |
| `Environment` | 4 | 4 | 19 | DEFER |
| `StatusChannel` | 7 | 7 | 26 | DEFER |
| `FrameProbe` | 1 | 1 | 1 | DEFER |
| `Momentum` | 10 | 10 | 72 | DO NOT CONVERT — fix the default instead |
| `TextSegmentation` | 4 | 0 | 0 | PURE — stays direct |
| `UndoStore` | 1 | 0 | 0 | PURE — stays direct |
| **whole sweep** | **51** | **72** | **254** | |

The `Processes` new-getter count is 7 against 6 files because
`src/modules/system/Clipboard.ts` is inside the capability layer. The checker excludes it and the
task's own count of 6 external consumers is the one to use for #223.

The reasoning for each verdict is in [analysis-222-minimal-conversion-set.md](analysis-222-minimal-conversion-set.md).

The whole sweep is 51 files and 254 sites. The user judged it excessive up front. The measurement
agrees. The three-namespace minimal set is 26 distinct files and 106 sites once the overlaps are
removed, and #223 only needs the part of it that its own code touches. Reproduce the union with:

```sh
for N in Files Processes Clock; do
  bun census-222.ts uses $N | grep 'bare=[1-9]' | grep -v 'src/modules/system/' | cut -f1
done | sort -u | wc -l    # 26
```
