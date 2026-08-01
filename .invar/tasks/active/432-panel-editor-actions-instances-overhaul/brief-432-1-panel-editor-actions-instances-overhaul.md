# Brief 432-1 — panel, editor actions, and instances overhaul

Twenty confirmed items, one surface family. Every mockup below was
confirmed by the user; mockups ARE the specification. Drive first
with the two probes (see task file); all coordinates from a 120x40
drive. Work the items in the order given — later items assume
earlier moves.

## The target, assembled

```
╰──  ↵  ↕  ⇊  ────────────────────────────────╯   editor bottom border owns the actions
─────────────────────────────────────────  ↗  ×    splitter: thin, light, flush; frame fns only
 Terminal ×  Terminal 2 ×       + Plugin  ☰        tabs: padded, reorderable; ☰ = instances toggle
┌────────────────────────┬─────────────────────┐
│  $ echo hi          ×  │  + Terminal ▾       │
│                        │                     │
│                        │  ╭ Terminal         │
│                        │  ├ Terminal 2   ⬓ × │   (hover-only controls)
│                        │  ╰ Terminal (Agent) │
└────────────────────────┴─────────────────────┘
```

## Items

1. SPLITTER FLUSH. After item 2's move, the splitter row's line +
   background start at the panel's left edge (c37, after the `┃`
   divider) and run full width. Driven defect: rest-state c37 bg
   1447454 vs row tone 1710886 (heals on hover, regresses after).
   No leading gap cell; drag hit geometry spans the same extent.
2. EDITOR ACTIONS MOVE into the editor's bottom border, left corner:
   `╰──  ↵  ↕  ⇊  ────╯` — 2 padding cells after `╰`, border line
   INTERRUPTED (not drawn behind), action cells on the EDITOR
   background, hover tone on top as today; tooltips and clicks
   preserved. Ownership flips: the EDITOR renders them whenever an
   editor is open — panel presence irrelevant (today they render on
   the panelSeparator surface only while the panel is open; driven:
   splitter row 22 c37-c48).
3. ACTIONS WORK IN MARKDOWN MODE. Driven: the actions row is present
   with a .md open. First verify what each does in preview today,
   then: wrap toggle, go-to-line, go-bottom all function in preview
   (go-to-line/go-bottom scroll the preview; wrap per markdown
   semantics). State observed->fixed per action in the report.
4. TAB PADDING. Panel tabs: one space after the close glyph —
   `| Terminal × |` not `Terminal ×|`. Driven: tabs row 23, close
   at c47 flush against next tab at c49.
5. TERMINAL CLOSE CONFIRMS via the generic dialog (item 11).
6. SPLITTERS THIN + LIGHT. All splitters (bottom-panel row, dock
   splitters, inter-subwindow) drop the heavy stroke: `━`->`─`,
   `┃`->`│` (or half-block if finer), color flips dark->light
   SUBTLE tone (not standing out), hover highlight similar to
   today's but slightly less bright. Driven: bottom row is heavy ━,
   inter-subwindow heavy ┃ full column.
7. COUNT INDICATOR. (a) Never disappears at 1 instance — icon
   stays, the number may be omitted at 1. Driven: `▦ 2` (pane-list
   control, c106-111) exists only at >=2. (b) It moves OFF the
   splitter row to the tabs row (it IS the instances toggle — see
   item 10); the splitter row keeps ONLY expand `↗` and close `×`;
   the `+` leaves the splitter row entirely.
8. TABS-ROW ADD = `+ Plugin`, offering only Terminal / Database:
   selects which plugin loads into the panel.
9. (folded into 13.)
10. INSTANCES TOGGLE `☰` sits AFTER `+ Plugin`, rightmost on the
    tabs row (user-settled). Tooltip per item 15.
11. GENERIC DIALOG SYSTEM. One dialog/prompt component; the
    quit-confirmation dialog becomes an instance of it; terminal
    close (item 5) is the second consumer; input-carrying prompts in
    scope. Match the quit dialog's driven look (padded, compact,
    centered, Yes/No, keyboard+mouse).
12. (merged into 8.)
13. SUBPANEL ADD IS PLUGIN-CONTEXTUAL: `+ Terminal ▾` in the
    Terminal plugin (dropdown: Terminal / Terminal (Agent) /
    Terminal (Invar agent) — rename from today's driven popup
    "Terminal / AI Agent (Claude) / Invar Agent": everything is a
    terminal variation), `+ Database ▾` in Database (parallel
    instances with different settings). Aligned to the subpanel's
    LEFT edge, far from the tabs-row `+ Plugin`. The same chooser
    serves the per-row split control (item 17) — one popup, two
    entry points, driven: both open "Add window" today.
14. TABS DRAG-REORDER. Panel tabs reorder by drag-and-drop. No
    generic DnD methodology exists (splitter drags are bespoke) —
    CREATE the generic seam; tabs are its first consumer.
15. TOGGLE LABEL: "Show Instances" / "Hide Instances" (tooltip +
    any label surface) — the list is instances of Terminal,
    instances of Database.
16. CONNECTORS CLOSE. Split-family connectors: first ╭, middle ├,
    last ╰ (closure at both ends). Driven now: `├❯ Terminal` /
    `└❯ Terminal 3` — first is open ├, only last closes. Unsplit
    instances keep no connector.
17. SPLIT ICON. The per-row split control adopts the glyph the
    tasks pane uses for "Open the latest brief" (VS-Code-style
    split-pane icon) — pull the slot from ThemeIcons; all three
    tiers.
18. LIST ROWS BARE. No front icon (`❯` dies — driven present on
    every row today), exactly one space before the name (Terminal
    and Invar agent alike). Split + close controls appear ONLY on
    hover, with tooltips; close gets one space right padding.
    Driven now: `▦ ×` always visible, flush.
19. SUBWINDOW CLOSE. Each terminal subwindow gets a single `×` at
    its top-right corner.
20. INVAR AGENT DUALITY. Invar agent appears AS a terminal instance
    (same list, no special icon per 18) but is not a shell: typing
    /exit or /quit hides it and replaces it with a plain terminal
    in the same window slot.

## Ratchets

Every item lands with a driven smoke assertion (condition waits per
[harness.invariants.md](../../../../scripts/harness/harness.invariants.md); the layout/panel-chrome smokes are the homes;
extend, do not proliferate). The moved actions (2), flush splitter
(1), tab padding (4), connectors (16), hover-only controls (18) each
get planted-defect reds proven then removed.

## Invariants in scope
- "Appearance comes only from theme data" + glyph ladder ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)) — new/changed glyphs at all three tiers.
- "Command bar paint and hit geometry are identical" + panel geometry records ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
- "The panel contents list mirrors open content" ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) — items 13/15/16/18 touch it.
- Layout records ([layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)) — items 1/2/6 touch row composition; the #430 absorb rule and #391 bounds record must stay upheld.
- Harness waits observe conditions ([harness.invariants.md](../../../../scripts/harness/harness.invariants.md)).
The layering DISCOVERED here — splitter row = frame functions;
tabs row = plugin layer; subpanel = instance layer; two labeled
adds, one per layer — should enter [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) as a new record.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
