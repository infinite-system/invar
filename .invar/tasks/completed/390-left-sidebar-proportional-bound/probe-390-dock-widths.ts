// probe-390-dock-widths.ts
//
// What it finds out: whether the editor is wider than both complete dock groups, and whether each
// dock's content is at most 30 percent of the row, at 80x24, 100x30, and 120x36.
//
// How to run it from the repository root:
//   bun .invar/tasks/in-progress/390-left-sidebar-proportional-bound/probe-390-dock-widths.ts
//
// How to read its output: each line reports the three actor widths and both dock shares.
// `INVERTED` means a dock group is at least as wide as the editor. `OVER-BOUND` means a dock group
// exceeds 30 percent of the row. A non-zero exit code means at least one geometry failed.

const geometries = ['80x24', '100x30', '120x36'];
const openPath = 'src/modules/layout/LayoutModel.ts';

let failures = 0;

for (const geometry of geometries) {
  const childProcess = Bun.spawn(
    ['bun', 'run', 'drive', '--open', openPath, '--geometry', geometry],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await new Response(childProcess.stdout).text();
  await childProcess.exited;
  const layoutSlotsLine = output
    .split('\n')
    .find((candidate) => candidate.startsWith('layoutSlots='));
  if (!layoutSlotsLine) {
    console.log(`${geometry}  NO layoutSlots PUBLISHED`);
    failures += 1;
    continue;
  }

  const layoutSlots = JSON.parse(layoutSlotsLine.slice('layoutSlots='.length));
  const totalColumns = Number(geometry.split('x')[0]);
  const sidebarColumns = Number(layoutSlots.sidebar.width);
  const primaryDockGroupColumns =
    Number(layoutSlots.activityBar.width) +
    sidebarColumns +
    Number(layoutSlots.sidebarSplitter.width);
  const editorColumns = Number(layoutSlots.editorCenter.width);
  const rightDockColumns = Number(layoutSlots.rightDock.width);
  const rightDockGroupColumns =
    Number(layoutSlots.rightDockSplitter.width) +
    rightDockColumns +
    Number(layoutSlots.rightActivityBar.width);
  const primaryDockShare = sidebarColumns / totalColumns;
  const rightDockShare = rightDockColumns / totalColumns;
  const inverted =
    primaryDockGroupColumns >= editorColumns ||
    rightDockGroupColumns >= editorColumns;
  const overBound = primaryDockShare > 0.3 || rightDockShare > 0.3;
  if (inverted || overBound) failures += 1;

  console.log(
    `${geometry}  left=${primaryDockGroupColumns}(${sidebarColumns} content) ` +
      `editor=${editorColumns} right=${rightDockGroupColumns}(${rightDockColumns} content) ` +
      `leftShare=${primaryDockShare.toFixed(2)} ` +
      `rightShare=${rightDockShare.toFixed(2)} ` +
      `${inverted ? 'INVERTED' : overBound ? 'OVER-BOUND' : 'OK'}`,
  );
}

console.log(`${failures} geometry(ies) failed`);
process.exit(failures === 0 ? 0 : 1);
