# 197 — the LSP size budget guards writes but not reads

State: COMPLETED — 659b649
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

The size budget suppressed document **writes** to the language server but not **reads**:
hover, completion, definition, and references all queried a suppressed **37 MB** document. The user saw
it directly — *"i see some of the types in that file when i hover over different items in the file"* —
on a file the LSP was supposed to have given up on.

### The fix — one guard at the shared seam

```ts
// src/modules/lsp/LanguageClient.ts
protected async transportFor(document, requestRevision) {
  if (this.disposed || !document.path) return null;
  // A document over the size budget answers NO requests. This guard sits ahead of
  // `ensureStarted` on purpose: without it a single hover on a suppressed file starts the very
  // subprocess the suppression exists to avoid...
  if (this.refreshSizeSuppression(document)) return null;
  const state = this.rememberDocument(document);
  if (!(await this.ensureStarted(document.path))) return null;
  ...
}
```

**The placement is the point.** Ahead of `ensureStarted`, not after it — otherwise a single hover on a
suppressed file starts the very `tsgo` subprocess the suppression exists to avoid. One seam covers
`hover`, `completion`, `definition`, and `references`. `pullDiagnostics` was already safe (it requires
`state.opened`).

### The class it belongs to — partial coverage presenting as total

Three instances in a single day:
1. this budget, guarding writes and no reads;
2. a brief's "Repo law" section restating a FRAGMENT of ivue as if it were complete;
3. `EditorFrameAttribution` forwarding everything except `lastLineChange` — a 1.8-second cost.

**The review rule that follows:** when reviewing any wrapper, guard, adapter, or restatement, **do not
ask "does it handle the cases named here."** Enumerate the surface INDEPENDENTLY — from the interface,
from an AST census, from the producer — and diff it against what the boundary covers.

### A measurement-hygiene note from while it was unmerged

On main, a single hover over `huge.ts` started a `tsgo` subprocess. Timing runs during that window had
to `pgrep -x tsgo` first and discard any sample where one appeared.

## Sources

None in this folder — no brief was written. Detail above recovered from the session transcript
(`faf7e858-…jsonl`).
