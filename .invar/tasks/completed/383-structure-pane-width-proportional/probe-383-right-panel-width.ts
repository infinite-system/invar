// probe-383-right-panel-width.ts
//
// What it finds out: whether the right panel (right dock) is ever WIDER than
// the editor column, at each of several terminal geometries. Task #383 (the
// right panel is proportional) reported the inversion on small screens.
//
// How to run it (from the repo root):
//   bun .invar/tasks/in-progress/383-structure-pane-width-proportional/probe-383-right-panel-width.ts
//
// It drives the real app with `bun run drive` at each geometry, opens a
// TypeScript file so the structure pane has content, and reads the published
// `layoutSlots` key. That key is the layout the app really used.
//
// How to read the output: one line per geometry.
//   80x24  editor=14 rightDock=28 ratio=0.35 INVERTED
// `editor` and `rightDock` are cell widths. `ratio` is the right dock width
// divided by the total columns. `INVERTED` means the right dock is at least as
// wide as the editor, which is the defect. `OK` means the editor is wider.
// A non-zero exit code means at least one geometry is INVERTED.

const GEOMETRIES = ['200x50', '160x48', '120x36', '100x30', '80x24'];
const OPEN_PATH = 'src/modules/layout/LayoutModel.ts';

let failures = 0;

for (const geometry of GEOMETRIES) {
  const process = Bun.spawn(
    ['bun', 'run', 'drive', '--open', OPEN_PATH, '--geometry', geometry],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await new Response(process.stdout).text();
  await process.exited;
  const line = output
    .split('\n')
    .find((candidate) => candidate.startsWith('layoutSlots='));
  if (!line) {
    console.log(`${geometry}  NO layoutSlots PUBLISHED — drive failed`);
    failures += 1;
    continue;
  }
  const slots = JSON.parse(line.slice('layoutSlots='.length));
  const editorColumns = Number(slots.editorCenter.width);
  const rightDockColumns = Number(slots.rightDock.width);
  const totalColumns = Number(geometry.split('x')[0]);
  const ratio = (rightDockColumns / totalColumns).toFixed(2);
  const inverted = rightDockColumns >= editorColumns;
  if (inverted) failures += 1;
  console.log(
    `${geometry}  editor=${editorColumns} rightDock=${rightDockColumns} ` +
      `ratio=${ratio} ${inverted ? 'INVERTED' : 'OK'}`,
  );
}

console.log(`${failures} geometry(ies) inverted`);
process.exit(failures === 0 ? 0 : 1);
