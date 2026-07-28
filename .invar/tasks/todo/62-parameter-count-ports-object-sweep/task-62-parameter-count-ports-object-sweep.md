# 62 — parameter-count sweep: >3 args becomes a ports object

State: TODO
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: The hot-path carve-out is a physics argument, not a rule to apply mechanically.

## Outline

Functions with more than three parameters convert to a named ports object. Hot paths exempt. Plus the
convention text and a checker rule.

### The full program (three parts)

1. **An `ast-query` `many-params` census mode** — a structural scan, not a grep.
2. **The conversion sweep**, with `buildRootView` as the flagship. The house idiom already exists: a
   named ports interface like `AppStatusProjectionPorts`, `Pick`-typed where a narrow surface suffices,
   so call sites read as labelled wiring instead of a 20-slot argument train.
3. **The convention codified** — the part that makes it durable.

### The hot-path carve-out, stated as physics rather than taste

An options object in a 60 fps paint walk or a per-cell loop is **allocation you pay every frame**. Those
sites stay positional, with a one-line comment naming the hot path they serve. Everything else with more
than three parameters converts. Stating the exemption as a cost rather than a preference is what stops
it becoming an escape hatch.

The checker rule ships **report-only first**, same ratchet pattern as the grammar campaign, so it can
graduate to enforced module-by-module rather than in a big bang.

### The second rule that belongs here — the getter-shape gap

Found while auditing on-the-class enforcement. A module-level `const CONSTANT = 1` already trips the
`module-variable` rule, gate-blocking across all 22 modules, with a fixture proving `const
detachedData = 1` exits 1. **But once the constant moves onto the class, the checker does not
distinguish `protected static get constant()` from `static readonly constant = 1`.** The getter form is
law in `project.conventions.md` but is not a distinct AST rule, so a static property slips through.

Fold that rule in here, **with care**: namespace-manifest assignments like `static snapshot = $snapshot`
are static properties BY DESIGN. The rule must flag only *literal* initializers.

### Sequencing note from when it was queued

Dispatch after any in-flight builder editing `RootView`/`Bootstrap` has landed — a signature refactor
colliding with their rebases costs more than it saves.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
