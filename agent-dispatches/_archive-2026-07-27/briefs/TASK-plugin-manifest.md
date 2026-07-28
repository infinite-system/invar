# TASK — Plugins contribute their own settings and keybindings (#100)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-manifest`
(branch `feat-plugin-manifest`, forked from main at `0ec98bd`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete — the conductor lands it. Commit and report to
`/tmp/plugin-manifest-READY.md`. Run `bun install --frozen-lockfile` first (fresh worktree).

## What the user asked for, verbatim

> "since we are extracting plugins, Each plugin needs its own settings in the Settings panel,
> basically each plugin has to have plugin interface to extend settings / keybindings, etc"

## The ground (all landed this session — read before designing)

- The taxonomy: *Plugin boundaries grant one authority* (`project.invariants.md`). Contributors push
  registrations through `ApplicationContributor` / the optional `workspaceContributor` port
  (`src/modules/app/ApplicationContributor.interface.ts`). Three citizens: Git, Markdown, FileTree.
- The keyboard invariant: *Focus owns the keystroke* (`src/modules/keybindings/`). The registry is
  layered; later layers shadow earlier; reserved chords carry warrants; hints must be deliverable
  (`effectiveBindings`, super-never-displaces-floor). `KeybindingRegistry.ts` is the seam.
- Settings: `src/modules/settings/` — schema-driven; the Settings overlay renders from the schema.
- **A debt this task owes**: the keyboard landing REMOVED the repository panel's Tab-to-leave gesture
  rather than smuggle a git-context binding into the host floor (the boundary check ratchets
  source-control coupling in `src/modules/keybindings` at 13 lines). The READY report said: "the
  correct home for a contributed surface's chord is the plugin contributing its own binding — this is
  #100's job." Restoring that gesture THROUGH the new mechanism, with the ratchet count going DOWN or
  flat, is this task's acceptance test.

## The design constraints (the reduction is mostly done; hold these)

1. **Contribution, not configuration.** Settings and keybindings are two more things a contributor
   REGISTERS — same authority as panes and status segments. Extend the contribution context (fields
   on the existing many-customer contract), do not invent a parallel manifest file format. The
   "manifest" the user asked for IS the typed registration surface.
2. **The host learns nothing.** After this lands, the host schema must not name any plugin's setting,
   and the host keybinding floor must not name any plugin's action. The boundary check must be able
   to see a violation (extend `scripts/conventions-gate.sh`'s boundary scan to the settings schema if
   it does not already cover it — with a positive control).
3. **A plugin's bindings live in a plugin LAYER of the existing registry** — later-shadows-earlier
   already gives the right precedence (plugin defaults above the host floor, user rebinds above
   both). Reserved/warranted chords stay host-only: a plugin may not register a reserved binding, and
   the registry should REFUSE one that claims reservation (impossible-if-true material).
4. **Settings panel grouping**: plugin-contributed settings appear under the plugin's own heading in
   the Settings overlay, driven by the schema contribution, not by special-casing in the overlay.
5. **Uninstall symmetry**: whatever a contributor registers must unregister on dispose — settings
   rows disappear, binding layer drops. The Extensions pane's install/uninstall is the natural drive.

## Verification — exact exit codes, never a log tail

- The full checker suite (tsc, bun test, file-grammar, invariants --all/--refs, conventions-gate,
  coverage-ratchet, behavioral-contracts).
- **Drive the real paths**: (a) open Settings and see the Git/Markdown/FileTree headings with their
  settings, change one and observe the effect; (b) the repository panel's restored Tab gesture works
  when the git pane is focused AND Tab still indents in the editor; (c) uninstall Extensions-pane
  drive: contributed settings and bindings disappear. Three runs each.
- The keybindings boundary ratchet: report the source-control line count before and after (must be
  ≤ 13).
- Declare coverage movement in `project.coverage-deltas.md` (counted grammar, APPEND).
- Record the invariant(s): plugin bindings layer below user rebinds and above the host floor; a
  plugin cannot register a reserved chord; the host schema names no plugin setting.

## Rules

Full descriptive names, 80 columns, ivue conventions (`Static()`/`Reactive()`, `protected` floor,
`X.interface.ts`, file-name-follows-class, never `Class.prototype.<member>`). Tab INDENTS in the
editor; the host focus chord is Ctrl+Shift+J. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; leave the tree clean;
`git ls-files | grep '^TASK'` must return nothing.
