# Brief — #238: structure shows by default on the right, and markdown gets a TOC

Read first:
`.invar/tasks/in-progress/238-structure-default-right-and-md-toc/task-238-*.md`
— the user's words: "Structure also should be enabled by default and show
at right side of files that need it -> js/ts/css for shortcuts, maybe
table of contents for .md files?"

Build on current main: #35 landed the structure navigator; #245 moved its
source rendezvous to the host ProviderRegistry — consume providers ONLY
through that registry (the census will catch a second rendezvous).

The deliverables:

1. DEFAULT-ON, RIGHT: for documents whose sources answer (ts/js today),
   the structure pane shows by default at the RIGHT side. A contributed
   setting turns the default off. Hand-closing respects the reader for
   that document, like #237's preview rule.
2. MARKDOWN TOC: a structure SOURCE for markdown — headings as the
   outline, document-ordered, nested by level, jump-to-heading through the
   same view contract #35 proved. Register it through the ProviderRegistry
   as its own source (the markdown plugin provides it; the structure pane
   consumes it unchanged — that is the seam earning its keep). No LSP
   involvement.
3. CSS: check whether any installed source answers .css today; if none,
   the pane's stated-affordance line covers it honestly — do NOT build a
   css analyzer in this task; note it as follow-up scope.

Done-test, driven: open a .ts file — outline visible right, unbidden; open
a .md — the TOC lists its headings, Enter jumps; the setting disables the
default; uninstall the markdown plugin — the TOC source withdraws and the
pane states its affordance (#35's degrade arms extend).

## Invariants in scope

- `src/modules/structure/structure.invariants.md` — #35's records must
  survive; the default-visibility record joins them.
- The plugins ProviderRegistry record from #245 — one rendezvous, still.
- `src/modules/markdown/markdown.invariants.md` — the TOC source record;
  presentation through #236's stylesheet only.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories — generator drift
especially (a second rendezvous, a re-rolled outline renderer). The READY
report carries `## Bycatch` even if it reads `None observed`.

## Verification

Full local verification, exact exit codes; drive every done-test arm with
frame evidence; scale check the TOC on the 100k-line markdown fixture from
#236's task folder. Do not run merge-gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
