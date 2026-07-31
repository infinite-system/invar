# READY — PanelHeading rot remainder sweep

## Result

Repointed every requested stale name to the current `PanelTabBar` and `ThemeIcons` artifacts.
The exact sweep fell from six matches to zero.

Commit: `0ea584b3b8bab48209be4b4b0cbde9a93e075b5e`

The commit changes only these contract files:

- [project.invariants.md](../../../../project.invariants.md)
- [theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)

## Invariants in scope

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Appearance is data with a capability fallback](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback) | Upheld after repair | Its scope now names `PanelTabBar`. Its existing evidence cites both `PanelTabBar` projection methods. |
| [Appearance comes only from theme data](../../../../src/modules/theme/theme.invariants.md#appearance-comes-only-from-theme-data) | Upheld after repair | Its scope now names `PanelTabBar` controls. [ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) remains the only glyph-literal home. |
| [The glyph ladder degrades icons single-cell and legible](../../../../src/modules/theme/theme.invariants.md#the-glyph-ladder-degrades-icons-single-cell-and-legible) | Upheld after repair | Mechanism and Evidence now name `INTERFACE_GLYPH_VOCABULARIES`. The table supplies all three glyph tiers. |
| [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content) | Upheld after repair | Evidence now cites [PanelTabBar.ts](../../../../src/modules/ui/PanelTabBar.ts), [ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts), and [PanelTabBar.test.ts](../../../../src/modules/ui/PanelTabBar.test.ts). |

No record needed a statement change, status change, or refinement proposal.

## Sweep evidence

Command:

```text
rg -n -i 'panel-heading|PanelHeading|interfaceGlyphVocabularies' --glob '*.invariants.md' --glob '*.lattice.md' .
```

Before:

```text
./src/modules/theme/theme.invariants.md:120:decorations, and the tasks dashboard, including activity-bar, panel-heading,
./src/modules/theme/theme.invariants.md:280:task row actions, staging checkboxes, activity-bar items, panel-heading
./src/modules/theme/theme.invariants.md:286:`$interfaceGlyphVocabularies` each map EVERY key at each level, so selection
./src/modules/theme/theme.invariants.md:315:`$actionIcons`, `$taskActionIcons`, `$checkboxIcons`, `$interfaceGlyphVocabularies`,
./src/modules/ui/ui.invariants.md:538:The row close, panel-heading close, and tab close all read the `panelClose` slot from the active
./project.invariants.md:981:alike), syntax colors, git/diagnostic decorations, gutter, activity-bar items, and panel-heading
```

After:

```text
(no output)
```

A broader spaced-name sweep found three more references in the panel contents record.
Those references now name `PanelTabBar` panel and content-tab controls.

The broader sweep still finds “panel headings” in [text.invariants.md](../../../../src/modules/text/text.invariants.md).
That phrase describes current per-cell headings, not the removed `PanelHeading` class.
[RootView](../../../../src/modules/ui/RootView.ts) still mounts one heading-and-body container per visible cell.

## Verification

- `bun test src/modules/theme/ThemeIcons.test.ts src/modules/ui/PanelTabBar.test.ts src/modules/ui/PanelContentsList.test.ts`: 36 pass, 0 fail, 407 assertions.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: all contracts pass.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,302 annotations and 259 lattice links resolve, with 0 problems.
- `git diff --check`: clean before commit.
- Final requested sweep: 0 matches.
- Task worktree after commit: clean.

The first commit attempt invoked the repository pre-commit merge gate automatically.
The hook stopped before creating a commit.
The final commit used the documented `SKIP_GATE=1` bypass because the brief forbids that gate.

## Bycatch

The invariant checker repeated 15 pre-existing punctuation notes at baseline and after the change.
These names do not use the current canonical record-name charset:

- [agent.invariants.md](../../../../src/modules/agent/agent.invariants.md): `An agent session is a structured event stream, not a screen` and `The agent pane is a PaneContent citizen, not a special case`.
- [git.invariants.md](../../../../src/modules/git/git.invariants.md): `Current-line blame is a cached lookup, not a per-move git spawn` and `An unblamable file degrades to no blame, never an error`.
- [markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md): `Markdown headings are the document's structure`.
- [narration.invariants.md](../../../../src/modules/narration/narration.invariants.md): three record names contain commas.
- [structure.invariants.md](../../../../src/modules/structure/structure.invariants.md): `A structure source answers or declines, never blanks`.
- [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md): two record names contain apostrophes.
- [text.invariants.md](../../../../src/modules/text/text.invariants.md): `The dirty marker is derived from content, never asserted`.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md): `The editor column's default occupant is a contribution`.
- [vendors.invariants.md](../../../../src/modules/vendors/vendors.invariants.md): `Installed code can run with the user's authority`.
- [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md): `The editor surface answers capabilities, not plugin modes`.

[theme.invariants.md](../../../../src/modules/theme/theme.invariants.md#appearance-comes-only-from-theme-data) records one known appearance breach.
[TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts) hard-codes `●` at lines 97, 218, and 416.
Source inspection reproduced this once.
This task did not change code.
