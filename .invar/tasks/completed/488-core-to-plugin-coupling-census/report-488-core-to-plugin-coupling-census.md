# READY report — #488 (core-to-plugin coupling census)

## In plain words

Core files still know the names of things that live behind the plugin seam. I counted every
such place, two ways: files core imports from plugin folders, and plugin words (command ids,
pane kinds, labels) written inside core files. The import arm found 15 lines in 6 files.
The vocabulary arm found about 115 real sites in 20 files. One file, Bootstrap.ts, holds
more than half of all of it, and most of that is the agent pane, which is not a plugin yet.

Analysis only. Zero code changes. Two committed census scripts reproduce every number here.

## Method and controls

Tier definition, read from the code. PLUGIN tier = the 13 module folders whose contributors
[DefaultPlugins.ts](../../../../src/modules/plugins/DefaultPlugins.ts) registers (filetree, git,
markdown, lsp, vue, database, media, terminal, inline-rewrite, editor, structure,
tasks-dashboard, monitoring), plus the Extensions files inside `plugins/`, plus `agent` as a
PENDING plugin (#356, the agent pane becomes a decoupled module, files it as one). CORE =
every other module folder plus `src/main.ts`. DefaultPlugins.ts itself is the sanctioned
composition root and is reported separately.

Two scripts in this task folder run the census. Each proves both arms inside its own run and
exits 1 if a control fails:

- [census-488-imports.ts](census-488-imports.ts) — AST import walk over core.
  Positive control: it must find the seeded Bootstrap agent import. Negative control: core has
  42 imports of the `vue` PACKAGE, and the scanner must report none of them as module hits.
  Both passed.
- [census-488-vocabulary.ts](census-488-vocabulary.ts) — harvests plugin ids from plugin
  source (mechanical for dotted and kebab ids, curated for single words and labels, listed
  with provenance in the script), then walks every string literal in core. Positive control:
  it must find 'git.togglePanel' in ShortcutHelp.ts and 'Terminal (Agent)' in Bootstrap.ts.
  Negative control: 'media.showTorus' is harvested and has zero core hits, and a fabricated
  term has zero hits. Both passed.

Raw counts: 15 offending import lines (11 to agent, 4 to editor) and 129 vocabulary sites.
I classified all 129 by hand. 12 are false positives (listed at the bottom), 2 are sanctioned
rendezvous ids, leaving about 115 real sites.

## The inventory — worst sites first

Blast radius = how many plugins one site couples to, and whether the coupling blocks a clean
install or removal of a plugin.

| # | Site | Plugins coupled | Form | Count | Blocks removal? | Removing seam |
|---|---|---|---|---|---|---|
| 1 | [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) | agent, terminal, database, editor | 8 imports + ~60 vocabulary sites (kinds, labels, capability ids, action ids) | ~68 | YES — agent has no off switch; terminal/database branches are load-bearing | #356 for the agent cluster; pane-kind metadata from the runtime/factory registrations (#404/#405) for the rest |
| 2 | [KeybindingDefaults.ts](../../../../src/modules/keybindings/KeybindingDefaults.ts), [KeybindingPlatform.ts](../../../../src/modules/keybindings/KeybindingPlatform.ts), [CommandDefaults.ts](../../../../src/modules/commands/CommandDefaults.ts) | agent, terminal, structure, database | agent context bindings, agent./terminal. action ids, 'Agent' category, context union type naming 'agent'/'structure'/'database' | 16 | YES — chords and a palette command survive an absent surface | `registerKeybindings` + `commands` on the contribution context (filetree, database, lsp already use them); widen the context type |
| 3 | [Settings.ts](../../../../src/modules/settings/Settings.ts), [SettingsPanel.ts](../../../../src/modules/settings/SettingsPanel.ts) | agent, terminal | 9 agent*/terminal* schema fields with defaults, `AgentProvider` type DECLARED in core, panelContentOrder default `['agent','terminal']`, 'Agent'/'Terminal' section labels | ~18 | YES — settings for an absent plugin still render | `registerSetting` (SettingContribution — git, lsp, markdown already use it) |
| 4 | [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts), [PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts), [PanelContentsList.ts](../../../../src/modules/ui/PanelContentsList.ts) | terminal, database | two-value kind tables and labels ('database' else 'terminal') | 14 | YES — a third bottom-panel kind is forced into a wrong space and label | #405 (one kind-to-label map), inside #404's panel redesign |
| 5 | [StatusBar.ts](../../../../src/modules/ui/StatusBar.ts) + [Theme.ts](../../../../src/modules/theme/Theme.ts)/[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) | terminal, agent | hardcoded buttons keyed on kind strings; `terminalIcon`/`agentIcon` members in core theme | 2 + 4 identifier-level | partial — dead buttons remain | `statusBarSegments` contribution (already on the context) |
| 6 | [ShortcutHelp.ts](../../../../src/modules/ui/ShortcutHelp.ts) | git, markdown, filetree | 'git' context order, category map (git, diff, markdown, tree), 'git.togglePanel' fallback title | 7 | no — degrades to a stale label | command metadata from CommandRegistry; plugins register the missing command titles, or keybinding contributions carry titles |
| 7 | [RootView.ts](../../../../src/modules/ui/RootView.ts):20,32, [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts):7, [DiffView.ts](../../../../src/modules/diff/DiffView.ts):20, Bootstrap.ts:74 | editor | 4 value imports of editor classes (AgentPaneContent also at RootView:20) | 4 | YES — the editor plugin is structurally unremovable | move the shared generators (EditorWrap math, ReadOnlyTextBuffer, EditorFrameAttribution, EditorSourceTextViews) into core, or port them; NEW TASK |
| 8 | [Highlighter.ts](../../../../src/modules/syntax/Highlighter.ts), [LanguageRegistry.ts](../../../../src/modules/syntax/LanguageRegistry.ts) | markdown | builtin markdown tokenizer, `LangId` union member, extension map | 4 | no — but asymmetric: vue syntax rides the provider seam, markdown syntax is hardwired | 'document-syntax-source' provider (VuePlugin is the model); NEW TASK |
| 9 | [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts) | agent, terminal | 2 agent imports, 'terminal' focused-kind check, 'tool-result' transcript role | 4 | YES (agent part) | #356 + `statusProjectionContributions` (already on the context) |
| 10 | [NarrationProjection.ts](../../../../src/modules/narration/NarrationProjection.ts):19 | agent | 1 type-only import of AgentSession | 1 | type-level only | narration moves with the agent plugin (#356-adjacent) |
| 11 | RootView.ts:241 'Files', ShortcutHelp 'Files', [HoverCard.ts](../../../../src/modules/ui/HoverCard.ts) + ThemeIcons markdown language maps | filetree, markdown | sidebar border title, language-id icon/fence maps | ~7 | no — cosmetic drift only | dock-content title from the contribution; language-id maps are weak coupling, lowest priority |

Sanctioned, not findings: DefaultPlugins.ts (14 composition imports, by design) and the
'document-language-service' capability id in
[DocumentLanguageService.interface.ts](../../../../src/modules/workspace/DocumentLanguageService.interface.ts)
and [LanguageProviderRouter.ts](../../../../src/modules/workspace/LanguageProviderRouter.ts) —
the consumer owns that interface and id per the provider-rendezvous record.

Negative space, which proves the seam pattern works: media, vue, inline-rewrite,
tasks-dashboard, monitoring, structure, and extensions have ZERO real vocabulary sites in
core (structure and database appear once each, in the keybinding context union). Every plugin
that uses the contribution context fully is invisible to core.

## Proposed decoupling order

1. **#356 (agent pane is a decoupled module)** — already filed, covers the largest cluster:
   Bootstrap's 8 agent imports and createAgent wiring, the 'Terminal (Agent)' label matching,
   AppStatusProjection's agent ports, StatusBar's agent button, narration's type import, and
   the RELOCATION targets of rows 2 and 3 (agent chords, agent commands, agent settings move
   into the new AgentPlugin through the existing context seams).
2. **#405 (PanelHost hardcoded kind tables) inside #404's panel redesign** — covers row 4,
   and Bootstrap's terminal/database kind branches (part of row 1). Check #404 first, as
   #405's own brief says.
3. **NEW TASK — chord and command relocation sweep** (row 2 remainder after #356): terminal.*
   platform chords and the context union type. Small, mechanical, seam already exists. The
   task file names a "chord relocation" wave; no task number exists yet.
4. **NEW TASK — editor shared generators move home** (row 7): EditorWrap, ReadOnlyTextBuffer,
   EditorFrameAttribution, EditorSourceTextViews are consumed by core (and by the markdown
   plugin) from the editor folder. Until they move, the editor plugin is nominal.
5. **NEW TASK — markdown syntax rides the provider seam** (row 8): the vue plugin already
   shows the shape.
6. **NEW TASK (small) — ShortcutHelp and cosmetic labels** (rows 6 and 11): fallback maps
   shrink as plugins register real command titles.
7. **Ratchet**: once waves 1-2 land, wire [census-488-imports.ts](census-488-imports.ts) into
   the conventions gate with an allowlist of the remaining sites, so the count can only fall.
   A measured census that runs on demand is not enforcement (MEASURED ≠ ENFORCED).

## Invariants in scope — record by record

[system.invariants.md](../../../../src/modules/system/system.invariants.md), *The composition
graph reaches every installed contributor*: **holds; nothing contradicts it.** The census
found no membership list anywhere in core. Boundary note: the agent pane is not an installed
contributor at all, so the record does not cover that surface today. #356 brings it under the
record with no further work, which is an argument for #356 going first.

[plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md):

- *Peer plugins can have different lifetimes*: **stressed.**
  [MonitoringPlugin.ts](../../../../src/modules/monitoring/MonitoringPlugin.ts):31 value-imports
  `LanguageServerProcessRegistry` from the lsp plugin and reads
  `LanguageServerProcessRegistry.Class.entries()` at line 123. A module-level import ties
  load lifetimes: the record holds only under the unstated assumption that a peer's static
  registry is exempt from plugin lifetime. Same shape:
  [MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts):13 value-imports
  `ReadOnlyTextBuffer` from the editor plugin.
- *Extensions states vendor authority before activation*: **holds; no census finding touches
  it.**
- *Provider rendezvous is host carried*: **stressed, and one refinement suggested.** The
  interface imports the census saw (lsp imports inline-rewrite's RewriteProvider.interface,
  markdown and lsp import structure's StructureSource.interface) are the DESIGNED shape: the
  consumer owns the interface and the provider imports it. But monitoring's direct static
  read of the lsp registry is a peer exchange outside the workspace ProviderRegistry — a
  second rendezvous channel in function, even though nothing is constructed. Refinement:
  `AgentProviderRegistry` (agent module) is a registry by name in a different domain (engine
  backends, not workspace capabilities). When agent becomes a plugin, the record should say
  explicitly whether engine registries count, or the "second provider registry"
  impossible-if-true clause will read as violated on a name match.

[app.invariants.md](../../../../src/modules/app/app.invariants.md):

- *Boot checks ivue static getter caching*: **holds; untouched by any finding.**
- *External plugin discovery precedes application boot*: **holds.** DefaultPlugins.ts is
  confirmed as the one composition import site.
- *Rendering is one coarse frame effect*: **holds; untouched.**
- *Render load is attributed at the contribution boundary*: **holds, but the coupling blocks
  its benefit for one surface.** The agent pane raises renders without being a contribution,
  so its load lands on the host — exactly the "quietest plugin" failure mode the record's
  rationale warns about. Not a violation (the record scopes itself to contributions); #356
  closes the gap.
- *Quit requires explicit confirmation*: **holds; untouched.**
- *Owned resources release in reverse order*: **holds; untouched.**

## Bycatch (per the [AGENTS.md](../../../../AGENTS.md) taxonomy)

- **Distillation possibility**: `ReadOnlyTextBuffer` is consumed from the editor folder by
  core diff ([DiffView.ts](../../../../src/modules/diff/DiffView.ts):20) and by the markdown
  plugin (MarkdownSplitView.ts:13). One read-only text-buffer generator, living in a plugin
  folder, with two cross-boundary consumers. It belongs in a core text module. Not fixed
  (seam call is a design decision).
- **Generator drift / introduced variance**: monitoring bypasses the ProviderRegistry seam to
  reach lsp state directly (MonitoringPlugin.ts:31,123) — a consumer diverging from the one
  rendezvous seam its peers use. Not fixed.
- **An invariant violated in function**: none observed. Stresses are reported above, in the
  invariants section.
- **Comment drift**: none observed in the files this census read.
- **Plain nonsense**: none observed.
- **Contract-layer gaps**: the property this census measures — core carries no plugin
  vocabulary — has no invariant record anywhere. Once the decoupling wave lands, a record
  (project scope or app scope) plus the ratcheted census script should guard it. Gap
  reported, record not authored (out of task scope).

## Instrument feedback

- **EASY**: the ast-query skill's parse-don't-grep pattern. Both census scripts are ~25-line
  walkers around `ts.createSourceFile`, they run in under a second over all of core, and
  string-literal walking cannot be fooled by comments or import specifiers.
- **CONFUSING**: the plugins/ folder mixes tiers — ProviderRegistry and DefaultPlugins are
  core, ExtensionsPlugin is a plugin — so any folder-based tier rule needs a per-file
  exception list. Worth splitting when convenient.
- **MISSING**: ast-query has no `imports <module>` mode (who imports from module X) and no
  string-literal census mode. I wrote bespoke walkers; both would be one-predicate additions
  to `scripts/ast-query.ts`.

## False positives excluded (12 sites, all verified by reading the use)

- 'focus.toggle' (×3), 'go.definition' (×2), 'editor.completion' (×1): core-owned action ids
  that Bootstrap implements and CommandDefaults registers. Plugins BIND them, which is the
  reverse direction and healthy.
- QuickOpen.ts:316 'git': the git binary in a subprocess argument vector, not the plugin.
- TaskConfiguration.ts 'tasks.json' (×2) and 'Tasks' labels (×3, with Tasks.ts:82): the core
  tasks module's own file name and label. The tasks-dashboard plugin only displays them.

## Rules compliance

No source changes. I did not run the merge-gate on purpose, but the pre-commit hook started
it on my first commit attempt and the attempt timed out mid-gate. The commit was then redone
with the hook's documented SKIP_GATE=1 bypass, which is honest for a task-folder-only commit
under a no-gate brief. Scripts and report committed on branch
`fleet/488-core-to-plugin-coupling-census`. Both census scripts exit 0 with all four controls
green as committed.

One observation from that aborted hook run belongs in bycatch: the contention scrollbars
harness (`scripts/harness/smoke-scrollbars-harness.ts`) FAILed while every other completed
job passed. Not reproduced a second time (the run was aborted). #461 (scrollbar deep-wheel
drive fails under load) already tracks that family.
