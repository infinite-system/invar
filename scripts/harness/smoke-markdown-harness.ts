#!/usr/bin/env bun
// Byte-level Markdown split-preview contract: preview toggle, rendered links, persisted splitter,
// edge-selection autoscroll/copy/paste, and independent source/preview find all cross the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function previewBorder(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const position = snapshot.findText('╭─Preview');
  if (!position)
    throw new Error(`FAIL preview border missing\n${snapshot.text()}`);
  return position;
}

function sourceBorderColumn(snapshot: HarnessSnapshot.Model): number {
  const preview = previewBorder(snapshot);
  return snapshot.rowText(preview.row).indexOf('╭');
}

function previewMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const previewColumn = previewBorder(snapshot).column;
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot.rowText(row).indexOf(marker, previewColumn);
    if (column >= 0) return { row, column };
  }
  throw new Error(`FAIL preview marker missing: ${marker}\n${snapshot.text()}`);
}

function previewHasMarker(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): boolean {
  const previewPosition = snapshot.findText('╭─Preview');
  if (!previewPosition) return false;
  return snapshot
    .textRows()
    .some((rowText) => rowText.indexOf(marker, previewPosition.column) >= 0);
}

function findPreviewButton(
  snapshot: HarnessSnapshot.Model,
): { row: number; column: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const countMatch = rowText.match(/\d+\/\d+/);
    const countColumn = countMatch?.index ?? -1;
    if (countColumn >= 3 && rowText.includes('README.md')) {
      return { row, column: countColumn - 3 };
    }
  }
  return null;
}

function previewButton(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const button = findPreviewButton(snapshot);
  if (button) return button;
  throw new Error(`FAIL Markdown preview button missing\n${snapshot.text()}`);
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const markdownLines = [
  '# Rendered heading',
  '',
  'Open `target.ts` or [the target](target.ts).',
  '',
  'Rendered preview find term.',
  '',
];
for (let sectionNumber = 1; sectionNumber < 90; sectionNumber++) {
  markdownLines.push(
    `## Section ${String(sectionNumber).padStart(2, '0')}`,
    `Rendered row ${String(sectionNumber).padStart(2, '0')} carries selectable preview text.`,
    '',
  );
}
markdownLines.push('TRUE MARKDOWN TAIL');
await Bun.write(
  join(fixtureRoot, 'README.md'),
  `${markdownLines.join('\n')}\n`,
);
await Bun.write(
  join(fixtureRoot, 'target.ts'),
  'export const openedFromMarkdown = true;\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness markdown: source opens alone and tab button toggles rendered preview ==',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('README.md') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/README.md') && status.markdownPreviewOpen === false",
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === false,
  );
  HarnessSmoke.Class.pass('Markdown opens source-only by default');
  snapshot = await driver.awaitGridCondition(
    'the README editor tab and Markdown preview button are painted',
    (candidate) => findPreviewButton(candidate) !== null,
  );
  let button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      previewHasMarker(candidate, 'Rendered heading'),
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tab button publishes the Markdown preview as open',
    (status) => status.markdownPreviewOpen === true,
  );
  HarnessSmoke.Class.pass('tab button mounts the preview pane');
  const renderedHeading = previewMarkerPosition(snapshot, 'Rendered heading');
  HarnessSmoke.Class.requireCondition(
    !snapshot
      .rowText(renderedHeading.row)
      .slice(renderedHeading.column - 2)
      .startsWith('# '),
    'preview heading omits raw Markdown punctuation',
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.markdownPreviewOpen === false',
    (status) => status.markdownPreviewOpen === false,
  );
  HarnessSmoke.Class.pass('second click returns to source-only');
  snapshot = await driver.awaitGridCondition(
    'the preview pane is absent and the Markdown preview button is painted',
    (candidate) =>
      candidate.findText('╭─Preview') === null &&
      findPreviewButton(candidate) !== null,
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  snapshot = await driver.awaitSnapshot((candidate) =>
    previewHasMarker(candidate, 'target.ts'),
  );

  console.log(
    '== harness markdown: rendered references hover and Ctrl+Enter open ==',
  );
  let markerPosition = previewMarkerPosition(snapshot, 'target.ts');
  driver.sendMouse({
    kind: 'move',
    column: markerPosition.column,
    row: markerPosition.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.markdownHoveredReference).endsWith('/target.ts')",
    (status) => String(status.markdownHoveredReference).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass(
    'inline-code reference resolves inside the workspace',
  );
  markerPosition = previewMarkerPosition(driver.snapshot(), 'the target');
  driver.sendMouse({
    kind: 'move',
    column: markerPosition.column,
    row: markerPosition.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.markdownHoveredReference).endsWith('/target.ts')",
    (status) => String(status.markdownHoveredReference).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass(
    'standard Markdown link resolves inside the workspace',
  );
  driver.sendRawInput('\x1b[13;5u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/target.ts')",
    (status) => String(status.activeBuffer).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass('Ctrl+Enter opens the hovered reference');

  snapshot = await driver.awaitGridCondition(
    'the target file content is painted before returning to the README tab',
    (candidate) => candidate.findText('openedFromMarkdown') !== null,
  );
  const readmeTabPosition = snapshot.findText('README.md');
  if (!readmeTabPosition) throw new Error('FAIL README tab missing');
  clickCell(driver, readmeTabPosition.column + 2, readmeTabPosition.row);
  snapshot = await driver.awaitSnapshot((candidate) =>
    previewHasMarker(candidate, 'Rendered heading'),
  );

  console.log(
    '== harness markdown: splitter moves and persists across preview remount ==',
  );
  const previewColumnBefore = previewBorder(snapshot).column;
  const ratioBeforeStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown split ratio is published before divider movement',
    (status) => typeof status.markdownSplitRatio === 'number',
  );
  const ratioBefore = Number(ratioBeforeStatus.markdownSplitRatio);
  const dividerColumn = previewColumnBefore - 1;
  const dividerTargetColumn =
    ratioBefore <= 0.3 ? dividerColumn + 10 : dividerColumn - 10;
  const dividerRow = previewBorder(snapshot).row + 7;
  driver.sendMouse({
    kind: 'press',
    column: dividerColumn,
    row: dividerRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: dividerTargetColumn,
    row: dividerRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: dividerTargetColumn,
    row: dividerRow,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot(
    (candidate) => previewBorder(candidate).column !== previewColumnBefore,
  );
  const previewColumnAfter = previewBorder(snapshot).column;
  const persistedRatioStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'divider movement publishes a changed Markdown split ratio',
    (status) =>
      typeof status.markdownSplitRatio === 'number' &&
      status.markdownSplitRatio !== ratioBefore,
  );
  const persistedRatio = Number(persistedRatioStatus.markdownSplitRatio);
  HarnessSmoke.Class.pass(
    `divider moved preview ${previewColumnBefore} to ${previewColumnAfter} and changed the ratio`,
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.markdownPreviewOpen === false',
    (status) => status.markdownPreviewOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the remount action starts from a source-only Markdown editor',
    (candidate) =>
      candidate.findText('╭─Preview') === null &&
      findPreviewButton(candidate) !== null,
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      previewHasMarker(candidate, 'Rendered heading') &&
      previewBorder(candidate).column === previewColumnAfter,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the remounted preview publishes the persisted split ratio',
    (status) => Number(status.markdownSplitRatio) === persistedRatio,
  );
  HarnessSmoke.Class.pass('remounted preview reuses the persisted split ratio');

  console.log(
    '== harness markdown: edge drag autoscrolls, copies, and pastes into source ==',
  );
  const preview = previewBorder(snapshot);
  const selectionColumn = preview.column + 5;
  driver.sendMouse({
    kind: 'press',
    column: selectionColumn,
    row: preview.row + 3,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: 34,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: snapshot.rows - 1,
    button: 'left',
  });
  const selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.markdownPreviewScrollTop) > 0 && Number(status.markdownPreviewSelectionChars) > 100',
    (status) =>
      Number(status.markdownPreviewScrollTop) > 0 &&
      Number(status.markdownPreviewSelectionChars) > 100,
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: selectionColumn,
    row: snapshot.rows - 1,
    button: 'left',
  });
  driver.sendKeysWithoutFrameExpectation('Control+c');
  const copiedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the copied character count matches the completed Markdown preview selection',
    (status) =>
      Number(status.lastCopyChars) > 0 &&
      Number(status.lastCopyChars) ===
        Number(status.markdownPreviewSelectionChars) &&
      Number(status.markdownPreviewSelectionChars) >=
        Number(selectionStatus.markdownPreviewSelectionChars),
  );
  const selectionCharacters = Number(
    copiedStatus.markdownPreviewSelectionChars,
  );
  HarnessSmoke.Class.pass(
    `edge drag scrolled to ${String(copiedStatus.markdownPreviewScrollTop)} and selected ` +
      `${selectionCharacters} rendered chars`,
  );
  HarnessSmoke.Class.requireCondition(
    Number(copiedStatus.lastCopyChars) === selectionCharacters &&
      typeof copiedStatus.lastCopyHash === 'string' &&
      copiedStatus.lastCopyHash.length > 0,
    'Ctrl+C copies exactly the rendered selection range',
  );

  snapshot = driver.snapshot();
  const sourceColumn = sourceBorderColumn(snapshot) + 8;
  clickCell(driver, sourceColumn, previewBorder(snapshot).row + 3);
  const sourceFocusStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown source pane is focused with a published buffer revision',
    (status) =>
      status.markdownPaneFocus === 'source' &&
      typeof status.bufferRevision === 'number',
  );
  const revisionBeforePaste = Number(sourceFocusStatus.bufferRevision);
  driver.sendKeys('Control+v');
  const pastedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.bufferRevision) > revisionBeforePaste && status.markdownPaneFocus === 'source'",
    (status) =>
      Number(status.bufferRevision) > revisionBeforePaste &&
      status.markdownPaneFocus === 'source',
  );
  HarnessSmoke.Class.pass(
    `Ctrl+V pastes into source (${revisionBeforePaste} to ${String(pastedStatus.bufferRevision)})`,
  );

  console.log(
    '== harness markdown: source and preview retain independent Find queries ==',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Aa') !== null);
  driver.sendText('#');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sourceFindQuery === '#'",
    (status) => status.sourceFindQuery === '#',
  );
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'Escape closes source Find and reveals the Markdown preview border',
    (candidate) =>
      candidate.findText('╭─Find') === null &&
      candidate.findText('╭─Preview') !== null,
  );
  const reopenedPreview = previewBorder(snapshot);
  clickCell(driver, reopenedPreview.column + 5, reopenedPreview.row + 2);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.markdownPaneFocus === 'preview'",
    (status) => status.markdownPaneFocus === 'preview',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Aa') !== null);
  driver.sendText('Rendered');
  const findStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sourceFindQuery === '#' && status.markdownPreviewFindQuery === 'Rendered' && String(status.findTarget).endsWith(`markdown-preview:${fixtureRoot}/README.md`) && Number(status.findMatchCount) > 0",
    (status) =>
      status.sourceFindQuery === '#' &&
      status.markdownPreviewFindQuery === 'Rendered' &&
      String(status.findTarget).endsWith(
        `markdown-preview:${fixtureRoot}/README.md`,
      ) &&
      Number(status.findMatchCount) > 0,
  );
  HarnessSmoke.Class.pass(
    `independent preview Find owns ${String(findStatus.findMatchCount)} rendered matches`,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-markdown-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
