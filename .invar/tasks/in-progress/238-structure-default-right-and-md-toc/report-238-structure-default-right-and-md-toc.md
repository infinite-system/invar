# READY — #238: structure shows by default on the right, and markdown gets a TOC

Branch: `fleet/238-structure-default-right-and-md-toc`. Round-1 commit: `f32a17e6`.
Round-2 merge commit: `31874403` (main absorbed, #237 included). Tree clean.

## Round 2 — main merged, conflicts resolved

Merge commit `31874403` brings main (through `afc6eecf`) into the branch. #237 (preview
LEFT + auto-open, landed as `d42f2af0`) is absorbed, not undone. Four unmerged paths, all
resolved by me as both-intents-kept:

- `src/modules/markdown/MarkdownWorkspace.ts` (two hunks): the constructor keeps BOTH
  additions — my structure-source registration through `workspace.providers` AND #237's
  sync-flush auto-open watch; `disposed()` keeps all three releases — my
  `disposeStructureSource()` + `structureSource.dispose()` AND main's `$stopEffects()`.
- `src/modules/markdown/MarkdownWorkspace.test.ts`: both imports kept
  (`ProviderRegistry` from my round 1, `EditorSurfaceClaim` type from #237).
- `scripts/harness/smoke-plugin-manifest-harness.ts`: both fixtures kept — my
  `outline.md` (TOC arm) and #237's `z-auto-notes.md` (auto-open symmetry arm).
- `.invar/tasks/in-progress/238-…/probe-238-outline-watch-chain.ts`: main moved the task
  folder from `active/` to `in-progress/`; my probe follows the move (kept at the
  in-progress path).

Coexistence, driven: a fresh `.md` shows the rendered preview LEFT, the source middle, and
the structure TOC RIGHT — all unbidden in one frame (`Alpha/Beta/Gamma` rendered left,
`▤ Alpha :1 … ▤ Omega :17` outlined right, `structureStatus="ready"`).

Round-2 verification (exact exit codes): `bun test` 1852 pass, 0 fail — exit 0;
`bunx tsc --noEmit` — exit 0; invariants checker — 1058 annotations, 0 problems — exit 0;
rendezvous census `--require-one` — total 1 — exit 0;
`bun scripts/harness/smoke-plugin-manifest-harness.ts` — ALL-PASS (my structure arms and
#237's auto-open arms both green) — exit 0; `bash scripts/smoke-markdown.sh` — ALL-PASS —
exit 0. The known main red on `smoke-editor-harness` (#268's wrap-off rows) was not
touched and not run as part of my ownership; nothing I own is red.

Round-2 bycatch: none observed beyond round 1's list (the conductor has since filed
#259-#262 from those items; no new defects surfaced during the merge or the re-drives).

## What landed

1. **Default-on, right.** The structure pane moved from the primary dock to the right dock.
   A new policy, `src/modules/structure/StructureDefaultVisibility.ts`, reveals the pane
   when an installed source answers for the active document. The reveal never takes the
   keyboard (`PanelHost.revealContent`, new). The contributed setting
   `structureShowByDefault` (label: "Show structure for supported files", default on) turns
   the default off. A hand-close is respected per document, like #237's preview rule: the
   closed document stays closed, and another supported document re-applies the default. The
   `view.showStructure` command re-endorses the pane for the active document.
2. **Markdown TOC.** `src/modules/markdown/MarkdownStructureSource.ts` serves the document
   headings: document-ordered, nested by level, each anchored at its heading line with its
   section extent. It reuses the module's own `MarkdownParser`, so a `#` comment inside a
   fenced code block is not a heading. The markdown plugin registers it per workspace
   through the host `ProviderRegistry` under the same `structure` capability — zero
   structure-module edits for the new source, and the pane consumes it unchanged.
   `ProviderRegistry` gained `resolveAll`; the outline asks the newest registered source
   whose `supportsDocument` answers. The rendezvous census still counts ONE registry.
3. **CSS.** Negative result, as the brief predicted: only `TypeScriptProvider` exists
   (`.ts/.tsx/.js/.jsx/.mjs/.cjs`). No installed source answers `.css`. The pane states
   "No installed source answers for this file type." — driven, frame-verified. A css
   structure source is follow-up scope; none was built here.

Host edits, all generic: the contribution context carries `rightDockHost` and
`registerRightDockContent`; the right-dock key path in `Bootstrap` resolves a focused
content's keybinding context before raw `handleKey` (the primary dock's contract); no host
file names the structure module (the citizen grep still prints nothing).

## A latent #35 bug, found by driving and fixed

The outline's fingerprint watch fired only on CHANGE. At boot the document is already open
and the pane is already revealed before the outline is constructed, so the initial
fingerprint was also the final one, and no refresh ever ran — the pane sat on "No file is
open." forever. #35 never saw this because the pane started hidden and the show gesture
flipped the fingerprint. The watch is now `immediate`, and refresh() itself still gates on
observation, so the fix costs nothing while hidden. Evidence chain:
`.invar/tasks/active/238-structure-default-right-and-md-toc/probe-238-outline-watch-chain.ts`
(the isolation probe) plus the temporary in-app trace described in the probe header's
purpose; the fix is one option object in `StructureOutline.ts`.

Two focus defects fixed on the same path: symbol activation now blurs the right dock, so
the keyboard follows the jump into the editor (both the Enter and the click paths); and
`view.showStructure` pulls workspace focus off the primary pane and blurs that dock first —
before the fix, Enter after Ctrl+Shift+U routed to the focused Extensions pane and toggled
a plugin (the manifest smoke caught this).

## Done-test, driven (frame evidence in the drive transcripts)

- Open a `.ts` — the outline is visible at the RIGHT, unbidden: `rightDockVisible=true`,
  `rightDockActiveContent="structure"`, `structureStatus="ready"`, `structureRows=104` on
  `StructureOutline.ts`; the frame shows the Structure box beside the editor.
- Open a `.md` — the TOC lists headings nested and document-ordered
  (`▤ Alpha :1 / ▤ Beta :5 / ▤ Gamma :9 …`). Enter on a row jumps
  (`cursorLineIndex=8` for `### Gamma`) and focus returns to the editor
  (`rightDockFocused=false`). A row click jumps too (`cursorLineIndex=16` for `# Omega`).
- The setting disables the default: with `{"structureShowByDefault": false}` in the
  workspace `.invar/settings.json`, opening `code.ts` leaves `rightDockVisible=false`, and
  the setting row appears in the Settings panel.
- Hand-close respect, per document: close on `notes.md` (Ctrl+Alt+B) → open `code.ts` →
  the pane returns (`rightDockVisible=true`) → return to `notes.md` → it stays closed
  (`rightDockVisible=false`).
- Uninstall the markdown plugin — driven by the manifest smoke: the TOC source withdraws
  and the pane states the file-type affordance; uninstalling Language Intelligence too
  yields "No structure source"; both reinstall symmetrically, and the plugin's own
  uninstall/reinstall arm now asserts through `rightDockContentIds`.
- Scale (SCALE PARITY): the #236 generator's 100,000-line markdown fixture gives
  `structureRows=10000` from `structureRequests=1`, status ready. One TOC refresh parses in
  ~158ms (measured directly), behind the 350ms edit debounce and the observation gate. The
  10-line and 100k-line files show the same behavior.

## Verification (exact exit codes)

- `bun test` — 1844 pass, 0 fail (287 files). Exit 0.
- `bunx tsc --noEmit` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1050
  annotations resolved, 0 problems. Exit 0.
- `bun .invar/tasks/completed/245-provider-seam-open-or-bless-decision/census-245-provider-rendezvous.ts --require-one`
  — "provider rendezvous total: 1". Exit 0.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — ALL-PASS, exit 0, including the
  new arms: default-on reveal, TOC, Markdown + Language withdrawal ladder, reinstalls.
- `bun scripts/harness/smoke-layout-harness.ts` — ALL-PASS, exit 0.
- `bun scripts/harness/smoke-activitybar-harness.ts` — ALL-PASS, exit 0.
- Merge-gate: not run, per the brief. Commit used `SKIP_GATE=1`.

## Contract changes

- `structure.invariants.md`: the citizen record now names the right dock and the setting;
  the answers-or-declines record gains the per-file-type multi-source component; NEW record
  "The structure pane shows itself for a supported document"; the jump record notes the
  dock blur.
- `markdown.invariants.md`: NEW record "Markdown headings are the document's structure".
- `plugins.invariants.md`: the rendezvous record gains the "A consumer can enumerate"
  component (`resolveAll`); evidence updated; the census path corrected from
  `tasks/active/245-…` to `tasks/completed/245-…` (it had rotted when #245 completed).
- `ui.invariants.md`: the right-dock toggle record's scope and generates now name the
  first occupant and the content-context key routing.

## Bycatch

- FIXED (in the task commit, in-scope record): `plugins.invariants.md` cited the #245
  census at `tasks/active/…` after the folder moved to `tasks/completed/…` — comment
  drift; both citations corrected.
- Generator drift risk, named: `Bootstrap.ts` now holds two near-copies of the
  focused-dock key ladder (primary dock ~line 1985, right dock ~line 2162). The shared
  generator is "a focused dock content resolves its own keybinding context, then raw
  handleKey". A third dock would make the distillation due. Not unified here — seam call.
- Same family, not mine to fix: `RootView.ts:399-407` — the right-dock click handlers blur
  `panelHost` but not `primaryDockHost`. A right-dock click while the primary dock is
  focused leaves BOTH docks focused, and the primary dock wins the key ladder — the same
  double-focus shape that broke Enter in the smoke. Reproducible; a host seam another
  builder owns.
- Suspect, reproduced twice: the FIRST pointer click of a drive session lands nowhere (the
  global mouse status records it; no renderable handler fires). The second and later
  clicks work. Seen on a file-tree/tab click and on a right-dock row click. Not verified
  against main; likely a harness or mouse-mode warm-up, possibly related to
  #86 (wheel-first-frame fixed latency).
- Suspect, pre-existing: `Ctrl+Shift+U` does nothing in the `bun run drive` harness (also
  in the pre-change baseline), while the SAME chord works in the manifest smoke's PTY. The
  two harness key encoders likely disagree on shifted-control letters.
- Leftover affordance: `StructurePaneContent.activityAction` ("view.showStructure") now
  has no consumer — the activity bar serves the primary dock only, and the structure pane
  left it. Harmless field; a cleanup candidate.
- The boot frame can show the pane's "No file is open." headline for the first ~30ms
  before the debounced first refresh lands (the drive's settled-boot print catches it).
  Transient and honest afterward; noted in case a later smoke asserts the boot frame.

## Follow-up scope (named, not built)

- A css structure source (selectors as the outline) behind the same seam.
- Distill the two dock key ladders in `Bootstrap.ts` when a third consumer appears.
