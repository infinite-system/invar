# READY report — Markdown syntax rides the provider seam (#492)

## In plain words

Markdown highlighting lived in the core syntax code, so removing the Markdown plugin could
not remove that highlighting. I moved the Markdown tokenizer and file matching into the
Markdown plugin, then published them through the existing document syntax provider. Markdown
headings, previews, and fenced code still work in small and large files, while an absent
provider now gives plain source text.

## Result

Commit `d74c5232431c8e905edd37cbf1f18ae1f123a209` contains the complete change. The worktree
is clean on branch `fleet/492-markdown-syntax-rides-the-provider-seam`.

The [core vocabulary census from core-to-plugin coupling census (#488)](../../completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts)
reported four Markdown syntax sites before this change: two in
[Highlighter.ts](../../../../src/modules/syntax/Highlighter.ts) and two in
[LanguageRegistry.ts](../../../../src/modules/syntax/LanguageRegistry.ts). It now reports
zero Markdown syntax sites in those files. The full vocabulary count fell from 130 sites in
22 files to 126 sites in 20 files. Both census controls passed.

## Change

- [MarkdownSyntaxSource.ts](../../../../src/modules/markdown/MarkdownSyntaxSource.ts) now owns
  Markdown path matching, line tokenization, and the open `markdown` language identifier. It
  implements the consumer-owned `document-syntax-source` interface.
- [MarkdownWorkspace.ts](../../../../src/modules/markdown/MarkdownWorkspace.ts) constructs the
  source through an overridable factory and publishes it in its provider list. The generic
  workspace host registers and withdraws it with the other plugin providers.
- [Highlighter.ts](../../../../src/modules/syntax/Highlighter.ts) no longer contains Markdown
  parsing. Its language identifier type is open because providers own format vocabulary.
- [LanguageRegistry.ts](../../../../src/modules/syntax/LanguageRegistry.ts) no longer maps
  `.md` or `.markdown` in core.
- [MarkdownSyntaxSource.test.ts](../../../../src/modules/markdown/MarkdownSyntaxSource.test.ts)
  covers both extensions, the existing token roles, and plain fallback after provider
  withdrawal. The syntax unit tests now state that an unprovided `markdown` identifier uses
  the plain highlighter.
- [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts) now locks
  the visible source heading color after the Markdown contribution opens. The assertion
  observes the painted source cell, not provider internals.

## Driving evidence

Before the edit, `bun run drive --open` against the
[task brief](brief-492-1-markdown-syntax-rides-the-provider-seam.md) showed the source heading `# Task brief` with
foreground color `12294903`. A second drive opened [project.vision.md](../../../../project.vision.md)
and pressed `Control+Shift+v`. The preview reached `markdownPreviewOpen=true`, revision 1,
and 152 rendered blocks. This established that both source syntax and preview rendering
worked before the seam change.

After the edit, the same small-file drive kept the source heading color and opened the
preview. The Markdown smoke then drove its shared 500-line and 100,000-line fixtures. Its
heading, fenced-code, resize, scroll, theme, and source-versus-preview checks all passed at
both scales.

For a second large-file observation, I opened
[project.conductor.archive.md](../../../../project.conductor.archive.md), a 3,351-line real
file, moved to the end, and opened preview. The source reached maximum scroll row 3,325, the
preview opened, and it rendered 1,127 blocks. Small and large inputs therefore use the same
provider path without a scale-only failure.

## Positive control

I temporarily removed the syntax source from `MarkdownWorkspace.providers` after adding the
locking smoke. The complete Markdown smoke drove its earlier 500-line and 100,000-line arms,
then failed at the new end-state assertion with:

```text
FAIL the Markdown provider highlights the source heading through the document syntax seam
```

The failure was at [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts):1749.
I restored the provider publication before the final verification. This proves that the new
check goes red when the seam is disconnected.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: 2,357 passed, 0 failed, with 72,135 assertions in 354 files.
- `bun scripts/harness/smoke-markdown-harness.ts`: exit 0, including the 500-line and
  100,000-line arms.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,374
  annotations, 266 links, 0 problems.
- `bun scripts/check-conventions.ts`: exit 0.
- Both [import census](../../completed/488-core-to-plugin-coupling-census/census-488-imports.ts)
  and [vocabulary census](../../completed/488-core-to-plugin-coupling-census/census-488-vocabulary.ts):
  exit 0 with their positive and negative controls green.
- `git diff --check`: exit 0.

I did not run the merge gate or `behavioral-contracts.sh`. The task brief forbids the merge
gate, and the primary loop reserves the behavioral contracts for a different final gate.
The commit used the documented `SKIP_GATE=1` pre-commit bypass after the checks above.

## Invariant verdicts

The change passes the relevant contracts. No record needed a waiver or amendment.

[plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md):

- *Peer plugins can have different lifetimes*: **strengthened.** Markdown syntax now joins
  and leaves with the Markdown workspace contribution. The withdrawal test proves that the
  syntax registry returns to plain fallback.
- *Extensions states vendor authority before activation*: **holds and is untouched.** The
  change does not alter extension installation or activation.
- *Provider rendezvous is host carried*: **strengthened.** Syntax owns the interface and
  rendezvous identifier. Markdown supplies the implementation through the one workspace
  provider registry. Neither side imports the other side's concrete class.

[syntax.invariants.md](../../../../src/modules/syntax/syntax.invariants.md):

- *Embedded documents have more than one syntax language*: **holds.** Vue embedding behavior
  is unchanged, and its tests pass. Opening the language identifier type prevents the
  consumer from closing provider-owned vocabulary.
- *Document syntax has one removable host port*: **strengthened.** Markdown now uses that
  exact port, and removing its provider restores the plain fallback.
- *Syntax work follows visible lines and revisions*: **holds.** The moved tokenizer remains
  line-local, and the source reports the current document revision. No whole-document syntax
  pass was added.

[markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md), record by
record:

- *A markdown parse can outlive its source revision*: **holds; untouched.**
- *Parsing starts only after opening*: **holds; untouched.**
- *Applied blocks match the current revision*: **holds; untouched.**
- *Closing releases preview work*: **holds; untouched.**
- *Markdown blocks are compact semantic data*: **holds; untouched.**
- *Preview rendering follows visible rows, not document size*: **holds.** The 500-line and
  100,000-line smoke arms passed.
- *Preview presentation comes from one stylesheet*: **holds.** Theme and fenced-code drives
  passed at both scales.
- *Dead relative links stay ordinary preview text*: **holds; untouched.** The Markdown smoke
  passed.
- *Markdown metadata fields have distinct semantics*: **holds; untouched.** The Markdown
  smoke passed.
- *Markdown tables preserve column alignment*: **holds; untouched.** The Markdown smoke
  passed.
- *Markdown headings expose document structure*: **holds; untouched.** The structure source
  did not change.
- *A Markdown file offers a live source-preview split*: **holds.** Direct drives opened the
  split in both small and 3,351-line files.
- *The preview opens on the configured side*: **holds; untouched.** The Markdown smoke
  passed.
- *Markdown view mode persists by document*: **holds; untouched.** The Markdown smoke passed.
- *A file reference opens its target*: **holds; untouched.** The Markdown smoke passed.
- *An unresolvable link states why*: **holds; untouched.** The Markdown smoke passed.
- *Markdown selection reuses the shared selection state*: **holds; untouched.** The Markdown
  smoke passed.
- *Source and preview panes have independent find state*: **holds; untouched.** The Markdown
  smoke passed.

The project-level rule *Seams are drawn at the shared generator* is strengthened: Markdown
now owns the Markdown tokenizer, while syntax owns only provider selection and the plain
fallback. The public namespace and overridable-construction rules also hold in the new
source and its workspace factory.

## Bycatch

No runtime defect, invariant violation, comment drift, duplicate generator, introduced
variance, plain nonsense, or contract-layer gap was observed in the files and driven paths
for this task.

## Instrument feedback

- **EASY**: `bun run drive` exposed source cell colors, preview state, revision, and rendered
  block counts in one command. The shared scale fixtures let the locking smoke compare 500
  and 100,000 lines without creating large files.
- **CONFUSING**: `Control+g` is a Git chord prefix in this app, while go-to-line is `Alt+g`.
  My first fence-navigation probe timed out honestly until I read the registered binding and
  repeated it with `Alt+g`.
- **MISSING**: none. The drive runner, published graph, scale fixtures, smoke harness, and
  existing census scripts covered this task.

## Scope and delivery

The excluded icon maps in [HoverCard.ts](../../../../src/modules/ui/HoverCard.ts) and
[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) are unchanged. I created no
scratch script or fixture. I did not push, merge, tag, or delete a branch.
