# Brief — #237: the preview sits LEFT of the markdown source, and opens itself

Read first:
`.invar/tasks/in-progress/237-markdown-preview-left-and-auto-open/task-237-*.md`
— the user's words are the requirement: "make .md preview be on the left
side of .md file in editor by default (can be a setting to set it to the
right side if needed) and make it open automatically if markdown editor
plugin is enabled". Reading is the new writing.

Drive first (RULE ZERO): open a real .md file, watch what happens today,
then change, then watch again. The deliverables:

1. AUTO-OPEN: when the markdown plugin is enabled and a .md file becomes
   the active document, the preview opens without a keystroke. Closing it
   by hand stays closed for that document (respect the reader's choice);
   switching to another .md re-applies the default.
2. PLACEMENT: preview LEFT of the source by default. A setting
   (contributed through the markdown plugin's own settings, the #222
   convention) flips it right. The split ratio persists through the
   existing MarkdownSplitView persistence — do not re-roll it.
3. #236's stylesheet just landed in the same module — build on current
   main, and touch presentation ONLY through the stylesheet seam (the
   census test will red you otherwise, which is correct).

Done-test, driven: a fresh workspace, open README.md — the preview is
open, on the left, styled; flip the setting — right; disable the plugin —
no auto-open, no stale pane. Uninstall/reinstall symmetry per #220's law
(the manifest smoke's markdown arm extends if it does not cover auto-open).

## Invariants in scope

- `src/modules/markdown/markdown.invariants.md` — the stylesheet record
  (#236) must survive; add the auto-open/placement record where it
  belongs.
- The settings records for contributed settings; MarkdownSplitView's
  persisted-ratio record.
- `src/modules/ui/ui.invariants.md` — untouched; a diff there is a
  finding.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Verification

Full local verification, exact exit codes; drive the real app for every
done-test arm with frame evidence. Do not run merge-gate. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
