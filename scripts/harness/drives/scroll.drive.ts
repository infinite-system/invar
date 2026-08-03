// @ts-nocheck — this file is a SNIPPET, not a module: it runs inside the
// drive runner where `app` and `driver` are provided, so the compiler must
// not demand imports for them. The runtime never sees this comment.
// THE SCROLL DEMO — wheel gestures under the green ⇅ mark, verified through
// the graph. Run against a mirrored server (see tour.drive.ts header).
// This is a SNIPPET: no imports — `app` and `driver` are live.
app.humanPace();
const screen = await app.screen();

// Open a real file first (focus the editor by clicking into it — a chord sent
// to a focused terminal pane is eaten by the shell).
await app.click(Math.round(screen.columns * 0.55), 8);
await app.key('Control+p').waitFor('quickOpen.open', true, 8000);
await app.type('Bootstrap');
await app.waitFor('quickOpen.query', 'Bootstrap');
await app.key('Enter').waitFor('quickOpen.open', false);
await app.waitFor('workspaceSet.active.editor.hasDocument', true);

// Aim at the CODE, not at a hardcoded cell: on a 295-column terminal the cell
// that is "the editor" on a 120-column one is the file tree (learned live —
// the wheel worked perfectly, aimed at the wrong pane).
const editorColumn = Math.round(screen.columns * 0.55);
const editorRow = Math.round(screen.rows * 0.4);

// Scroll down under the mark, verify the viewport MOVED through the graph,
// then scroll back and verify the return. The waits are conditions; the
// pacing is animation — the two never mix.
const before = await app.get(
  'workspaceSet.active.editor.viewport.firstVisible',
);
await app.scroll('down', 8, editorColumn, editorRow);
await app.waitForRepaint();
const down = await app.get('workspaceSet.active.editor.viewport.firstVisible');
console.log('scrolled:', before, '->', down);
await app.scroll('up', 10);
await app.waitForRepaint();
console.log(
  'returned to:',
  await app.get('workspaceSet.active.editor.viewport.firstVisible'),
);
