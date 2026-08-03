// @ts-nocheck — this file is a SNIPPET, not a module: it runs inside the
// drive runner where `app` and `driver` are provided, so the compiler must
// not demand imports for them. The runtime never sees this comment.
// THE TOUR — a watchable presentation of the drive verbs (no scrolling; see
// scroll.drive.ts for that). Run against a mirrored server so a human sees it:
//   bun scripts/harness/DriveSession.ts --serve --mirror        (terminal 1)
//   bun scripts/harness/DriveSession.ts --attach-script scripts/harness/drives/tour.drive.ts
// This is a SNIPPET: no imports, no setup — `app` and `driver` are live.
// Geometry-agnostic by rule: ask the screen, aim at text, never invent cells.
app.humanPace();
const screen = await app.screen();

// Act 1 — sweep the activity bar; then stillness, so the wake visibly drains.
await app
  .moveMouse(2, 2)
  .moveMouse(2, Math.min(14, screen.rows - 6))
  .moveMouse(2, 4);

// Act 2 — into the file tree: open a folder, close it again.
await app.moveMouse(10, 6).click();
await app.waitForRepaint();
await app.click(10, 6);

// Act 3 — the bottom panel: glide the tab bar, open the add popup, browse it
// by keyboard, dismiss. Every wait is a graph CONDITION, never a guess.
await app.key('Control+j').waitFor('panelHost.visible', true);
const panelScreen = await app.screen();
const plugin = panelScreen.findText('+ Plugin');
if (plugin) {
  await app.click(plugin.column + 2, plugin.row);
  await app.waitFor('boundedListPopup.open', true, 8000);
  await app.key('Down').key('Up').key('Escape');
  await app.waitFor('boundedListPopup.open', false, 8000);
}

// Act 4 — focus the editor by clicking INTO it (a chord sent while a terminal
// pane holds focus is eaten by the shell — learned live), then Quick Open,
// typed at human cadence, and open the top match.
await app.click(Math.round(screen.columns * 0.55), 8);
await app.key('Control+p').waitFor('quickOpen.open', true, 8000);
await app.type('GraphChannel');
await app.waitFor('quickOpen.query', 'GraphChannel');
await app.key('Enter').waitFor('quickOpen.open', false);
await app.waitFor('workspaceSet.activeEditor.hasDocument', true);

// Curtain — a slow diagonal bow, then the trail fades to nothing.
await app
  .moveMouse(Math.round(screen.columns * 0.3), Math.round(screen.rows * 0.7))
  .moveMouse(Math.round(screen.columns * 0.8), Math.round(screen.rows * 0.2))
  .moveMouse(Math.round(screen.columns * 0.5), Math.round(screen.rows * 0.5));
console.log(
  'tour complete:',
  await app.get('workspaceSet.activeDocument.path'),
);
