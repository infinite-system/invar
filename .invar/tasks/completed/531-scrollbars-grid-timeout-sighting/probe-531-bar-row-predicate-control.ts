// Positive control for the #531 scrollbars flake fix.
//
// What it finds out: it replays the REAL frozen frame from the gate-539-r2
// contention timeout (evidence-531-gate-539-r2-contention-scrollbars.log.txt,
// preserved in this folder; .txt suffix because the repo gitignores *.log)
// against two predicates:
//   OLD: line 401 is "vertically visible" when the text `401  ` appears
//        anywhere on the grid.
//   NEW: line 401 is visible only when `401  ` AND `402  ` both appear.
// The frame shows line 401 as the LAST content row, overlaid by the
// lower-half-block horizontal scrollbar, gutter number still painted.
//
// How to run: bun .invar/tasks/in-progress/531-scrollbars-grid-timeout-sighting/probe-531-bar-row-predicate-control.ts
//
// How to read the output: four CHECK lines. The probe exits 0 only when the
// OLD predicate wrongly says "visible" on this frame (the planted defect goes
// red), the end marker is absent (so the smoke's grid wait could never
// resolve), and the NEW predicate correctly says "not visible" (the fix would
// wheel down instead of right). Any CHECK printed as FAIL exits 1.

const evidencePath = new URL(
  'evidence-531-gate-539-r2-contention-scrollbars.log.txt',
  import.meta.url,
).pathname;
const logText = await Bun.file(evidencePath).text();
const gridHeaderIndex = logText.indexOf('Final grid region');
if (gridHeaderIndex < 0) {
  console.error('FAIL: evidence log has no "Final grid region" section');
  process.exit(1);
}
const gridLines = logText
  .slice(gridHeaderIndex)
  .split('\n')
  .slice(1)
  .filter((line) => !line.trimStart().startsWith('at '))
  .join('\n');

let failed = false;
function check(name: string, condition: boolean) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failed = true;
}

const oldPredicate = gridLines.includes('401  ');
const nextLineVisible = gridLines.includes('402  ');
const markerVisible = gridLines.includes('DEEP-WIDEST-END-MARKER');
const barOverlaysLine401 = /401\s+▄+/.test(gridLines);

check(
  'the frozen frame paints the horizontal bar over line 401 text (gutter still shows 401)',
  barOverlaysLine401,
);
check(
  'OLD predicate wrongly reports line 401 visible on the bar-covered frame (planted defect is red)',
  oldPredicate,
);
check(
  'the end marker is NOT paintable on this frame, so the old grid wait could never resolve',
  !markerVisible,
);
check(
  'NEW predicate reports line 401 not yet visible (line 402 gutter absent), so the fix wheels down',
  !(oldPredicate && nextLineVisible),
);
process.exit(failed ? 1 : 0);
