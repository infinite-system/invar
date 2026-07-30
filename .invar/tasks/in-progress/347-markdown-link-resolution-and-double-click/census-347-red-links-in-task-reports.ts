#!/usr/bin/env bun
// What this finds out: WHICH text the live Markdown preview paints in the theme's ERROR colour
// (the "dead link" red) when a REAL task document from this repository is open, and which text it
// paints in the accent colour (a link that resolves). It drives the real application in the PTY
// harness against this repository, opens one document through Quick Open, waits for the preview to
// finish parsing, then wheels the preview from top to bottom and collects every coloured run.
//
// How to run it (from the repository root):
//   bun .invar/tasks/in-progress/347-markdown-link-resolution-and-double-click/census-347-red-links-in-task-reports.ts <document-basename> [more...]
//
// How to read the output: `RED` lines are runs painted with the error colour — the preview says it
// cannot resolve that link. `ok` lines are runs painted with the accent colour — the preview
// resolved them (or classified them external). Each line also reports whether the authored target
// exists on disk, resolved against the document's own directory. A RED line whose target exists is
// a resolution DEFECT. A RED line whose target is absent is correct paint.
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { ThemePalettes } from '../../../../src/modules/theme/ThemePalettes';

const repositoryRoot = resolve(import.meta.dir, '../../../..');

function packedThemeColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function previewColumnBounds(snapshot: HarnessSnapshot.Model): {
  left: number;
  right: number;
} {
  for (let row = 0; row < snapshot.rows; row++) {
    const text = snapshot.rowText(row);
    const left = text.indexOf('╭─Preview');
    if (left < 0) continue;
    const right = text.indexOf('╮', left + 1);
    return { left, right: right < 0 ? snapshot.columns : right };
  }
  return { left: 0, right: snapshot.columns };
}

/** Every maximal run of cells inside the preview pane painted with `wantedColor`. */
function colouredRuns(
  snapshot: HarnessSnapshot.Model,
  bounds: { left: number; right: number },
  wantedColor: number,
): string[] {
  const runs: string[] = [];
  for (let row = 0; row < snapshot.rows; row++) {
    let current = '';
    for (let column = bounds.left; column < bounds.right; column++) {
      const cell = snapshot.cell(row, column);
      if (cell && cell.foreground === wantedColor) {
        current += cell.characters;
      } else if (current.trim().length > 0) {
        runs.push(current.trim());
        current = '';
      } else {
        current = '';
      }
    }
    if (current.trim().length > 0) runs.push(current.trim());
  }
  return runs;
}

function authoredTargetForLabel(
  markdownText: string,
  label: string,
): string | null {
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let match = linkPattern.exec(markdownText);
  while (match !== null) {
    const authoredLabel = (match[1] ?? '').replace(/`/g, '');
    if (authoredLabel === label || authoredLabel.startsWith(label)) {
      return match[2] ?? null;
    }
    match = linkPattern.exec(markdownText);
  }
  return null;
}

async function censusDocument(documentBasename: string): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-census-347-home-'));
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    JSON.stringify({ theme: 'dark', markdownViewMode: 'split' }),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: repositoryRoot,
    repositoryRoot,
    columns: 200,
    rows: 50,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath, LANG: 'C.UTF-8' },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the application to become ready on this repository',
      (status) => status.ready === true && Boolean(status.activeWorkspace),
    );
    driver.sendKeys('Control+p');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Quick Open to become visible',
      (status) => status.quickOpenOpen === true,
    );
    driver.sendText(documentBasename);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Quick Open to rank ${documentBasename}`,
      (status) =>
        status.quickOpenQuery === documentBasename &&
        Number(status.quickOpenMatches) >= 1,
    );
    // Fuzzy ranking may place a sibling first; step the selection to the exact basename.
    for (let step = 0; step < 20; step++) {
      const selected = String(
        HarnessSmoke.Class.readStatus(statusPath).quickOpenSelectedIdentifier,
      );
      if (selected.endsWith(documentBasename)) break;
      driver.sendKeys('Down');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `Quick Open selection to move past ${selected}`,
        (status) => String(status.quickOpenSelectedIdentifier) !== selected,
      );
    }
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${documentBasename} to open with a parsed preview`,
      (status) =>
        String(status.activeBuffer).endsWith(documentBasename) &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false &&
        Number(status.markdownRevision) === Number(status.bufferRevision),
    );
    const documentPath = String(
      HarnessSmoke.Class.readStatus(statusPath).activeBuffer,
    );
    const markdownText = await Bun.file(documentPath).text();
    const errorColor = packedThemeColor(ThemePalettes.Class.DARK.error);
    const accentColor = packedThemeColor(ThemePalettes.Class.DARK.accent);
    const bounds = previewColumnBounds(driver.snapshot());

    const redRuns = new Set<string>();
    const accentRuns = new Set<string>();
    let previousScrollTop = -1;
    let stalledSteps = 0;
    for (let wheelStep = 0; wheelStep < 600; wheelStep++) {
      const snapshot = driver.snapshot();
      for (const run of colouredRuns(snapshot, bounds, errorColor))
        redRuns.add(run);
      for (const run of colouredRuns(snapshot, bounds, accentColor))
        accentRuns.add(run);
      const scrollTop = Number(
        HarnessSmoke.Class.readStatus(statusPath).markdownPreviewScrollTop,
      );
      // The preview scrolls with momentum, so one wheel notch may land after the next sample.
      // Only a run of samples with no movement means the document bottom is reached.
      stalledSteps = scrollTop === previousScrollTop ? stalledSteps + 1 : 0;
      if (stalledSteps >= 6) break;
      previousScrollTop = scrollTop;
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        column: bounds.left + 5,
        row: 10,
        direction: 'down',
      });
      await Bun.sleep(120);
    }
    console.log(`scrolled to preview row ${previousScrollTop}`);

    console.log(`\n== ${documentPath} ==`);
    const describe = (run: string): string => {
      const target = authoredTargetForLabel(markdownText, run);
      if (target === null) return `${run}  (no authored link matched)`;
      const onDisk = resolve(dirname(documentPath), target.split('#')[0] ?? '');
      return `${run}  -> ${target}  [${existsSync(onDisk) ? 'target-exists' : 'target-absent'}]`;
    };
    for (const run of [...redRuns].sort())
      console.log(`  RED ${describe(run)}`);
    for (const run of [...accentRuns].sort())
      console.log(`  ok  ${describe(run)}`);
    console.log(
      `summary: red-runs=${redRuns.size} accent-runs=${accentRuns.size}`,
    );
  } finally {
    await driver.dispose();
  }
}

for (const documentBasename of Bun.argv.slice(2)) {
  await censusDocument(documentBasename);
}
