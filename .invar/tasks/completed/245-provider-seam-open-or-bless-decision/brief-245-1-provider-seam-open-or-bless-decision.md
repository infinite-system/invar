# Brief — #245: open the provider seam, prove it with the database plugin

Read first:
`.invar/tasks/in-progress/245-provider-seam-open-or-bless-decision/task-245-*.md`
— the user's decision and the four-part shape are there. Then #222's analysis
documents (its completed folder) and [report-35-structure-navigator-plugin-pane.md](../35-structure-navigator-plugin-pane/report-35-structure-navigator-plugin-pane.md)'s
seam finding. The retired #223 folder holds the folded database-plugin scope.

The shape, compressed: the host carries the phone book, not the
conversations. Promote the `StructureSources` mechanism (register / resolve /
withdraw-on-dispose, reactive, per-workspace, keyed by capability
identifier) into the host as THE one generic provider registry. Interfaces
stay consumer-owned; the host never learns anyone's types. Migrate BOTH
existing rendezvous onto it (`StructureSources`, inline-rewrite's
construct-your-own) and delete them; a census proves no other rendezvous
remains. Then build the database plugin from #223's scope as the proof:
provider interface (connect / query / describe), sqlite real + one fake,
consumed by a peer plugin through the NEW registry only, zero host edits
beyond the seam this task introduces, uninstall/reinstall symmetric both
ways (#35's smoke arm is the rig to extend).

Drive first, contract after (RULE ZERO). The done-tests:

- Census: exactly ONE provider rendezvous in the tree.
- The structure pane still outlines/jumps/degrades through the migrated
  registry (its existing smoke arms stay green untouched).
- The database peer resolves its provider through the registry; swap the
  sqlite implementation for the fake by plugin substitution alone.
- Uninstall each of the four plugins (lsp, structure, database provider,
  database consumer) under the others' gaze; keys ABSENT not stale.

## Invariants in scope

- `src/modules/plugins/` records — the registry record this task adds: *a
  provider rendezvous is host-carried, interface-blind, and withdraws on
  dispose*.
- [src/modules/structure/structure.invariants.md](../../../../src/modules/structure/structure.invariants.md) — source citation moves;
  records survive the migration.
- [src/modules/lsp/lsp.invariants.md](../../../../src/modules/lsp/lsp.invariants.md) — registration clause updates;
  host-never-imports-LSP untouched.
- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — untouched; any diff there is a
  finding.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories — generator drift above all:
you are collapsing two rendezvous into one; any THIRD rendezvous your census
finds is the drift this task exists to kill. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

Full local verification, exact exit codes (tsc, bun test, conventions,
invariants --all --refs with counts, coverage ratchet, file grammar). Drive
the real app for the plugin lifecycle arms. Do not run merge-gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
