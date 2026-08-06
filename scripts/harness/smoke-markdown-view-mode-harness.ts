#!/usr/bin/env bun
// This smoke proves that Markdown editor/preview mode persists across files and process restarts.
// Run: bun scripts/harness/smoke-markdown-view-mode-harness.ts
// ALL-PASS means preview-only hides source, blocks edits, ignores non-Markdown files, and survives
// two same-HOME restarts. It also means small and 100,000-line previews use the same surface.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Markdown view mode persists across Markdown documents (src/modules/markdown/markdown.invariants.md)
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

async function openFile(
  driver: PtyTestDriver.Model,
  statusPath: string,
  fileName: string,
): Promise<Record<string, unknown>> {
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Quick Open opens for ${fileName}`,
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText(fileName);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Quick Open finds ${fileName}`,
    (status) =>
      status.quickOpenQuery === fileName && Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${fileName} becomes active`,
    (status) => String(status.activeBuffer).endsWith(`/${fileName}`),
  );
}

async function focusEditor(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  driver.sendKeys('F1');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the command palette opens for the editor-focus command',
    (status) => status.paletteOpen === true,
  );
  driver.sendText('View: Focus Editor');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the command palette finds the editor-focus command',
    (status) =>
      status.paletteQuery === 'View: Focus Editor' &&
      Number(status.paletteMatches) === 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the editor owns focus',
    (status) => status.focus === 'editor' && status.paletteOpen === false,
  );
}

function savedMode(settingsPath: string): string {
  return String(
    (JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>)
      .markdownViewMode,
  );
}

async function drivePersistence(): Promise<void> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-markdown-mode-'));
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-markdown-mode-home-'),
  );
  const settingsPath = join(homeDirectory, '.config', 'invar', 'settings.json');
  await Bun.write(join(fixtureRoot, 'a.md'), '# Alpha\n\nAlpha preview.\n');
  await Bun.write(join(fixtureRoot, 'b.md'), '# Beta\n\nBeta preview.\n');
  await Bun.write(join(fixtureRoot, 'c.md'), '# Gamma\n\nGamma preview.\n');
  await Bun.write(join(fixtureRoot, 'plain.txt'), 'plain text\n');

  let driver: PtyTestDriver.Model | null = null;
  let statusPath = join(homeDirectory, 'first-status.json');
  try {
    const startDriver = (statusName: string): PtyTestDriver.Model => {
      driver = new PtyTestDriver.Class({
        workspaceRoot: fixtureRoot,
        columns: 100,
        rows: 30,
        homeDirectory,
        environment: { TUI_STATUS_PATH: join(homeDirectory, statusName) },
      });
      return driver;
    };

    driver = startDriver('first-status.json');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the first process starts in editor mode',
      (status) =>
        status.ready === true &&
        status.markdownViewMode === 'editor' &&
        status.markdownPreviewOpen === false,
    );
    await openFile(driver, statusPath, 'a.md');
    await focusEditor(driver, statusPath);
    const editorRevision = Number(
      HarnessSmoke.Class.readStatus(statusPath).bufferRevision,
    );
    driver.sendKeys('Control+Shift+v');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the toggle selects settled preview-only mode',
      (status) =>
        status.markdownViewMode === 'preview' &&
        status.markdownPreviewOpen === true &&
        status.markdownPaneFocus === 'preview' &&
        status.markdownParsing === false &&
        status.editorSurfaceIdentifier === 'markdown.preview' &&
        status.editorColumnContent === 'markdown.preview',
    );
    const previewSnapshot = await driver.awaitGridCondition(
      'the rendered Alpha preview fills the editor column without source',
      (candidate) =>
        candidate.findText('╭─Preview') !== null &&
        candidate.findText('Alpha preview.') !== null &&
        candidate.findText('  1 ▏# Alpha') === null,
    );
    HarnessSmoke.Class.requireCondition(
      previewSnapshot.findText('╭─Preview') !== null &&
        HarnessSmoke.Class.readStatus(statusPath).editorColumnContent ===
          'markdown.preview',
      'preview-only paints and publishes its rendered pane',
    );
    driver.sendKeys('Control+p');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Ctrl+P opens Quick Open while the Markdown preview owns focus',
      (status) =>
        status.quickOpenOpen === true && status.markdownPaneFocus === 'preview',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Escape returns to the focused Markdown preview',
      (status) =>
        status.quickOpenOpen === false &&
        status.markdownPaneFocus === 'preview',
    );
    driver.sendRawInputWithoutFrameExpectation('x');
    driver.sendKeys('Control+Shift+v');
    const afterEditingKey = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the next semantic frame shows that the editing key changed nothing',
      (status) =>
        status.markdownViewMode === 'editor' &&
        status.editorSurfaceIdentifier === '' &&
        status.editorColumnContent === 'source-text-editor',
    );
    HarnessSmoke.Class.requireCondition(
      Number(afterEditingKey.bufferRevision) === editorRevision &&
        afterEditingKey.dirty === false,
      'an editing key cannot mutate a view-only Markdown document',
    );
    driver.sendKeys('Control+Shift+v');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'preview-only mode is restored after the editing-key probe',
      (status) =>
        status.markdownViewMode === 'preview' &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false,
    );
    HarnessSmoke.Class.requireCondition(
      savedMode(settingsPath) === 'preview',
      'the preview choice is saved under the isolated HOME',
    );

    driver.sendKeys('Control+w');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'closing Alpha removes its tab',
      (status) =>
        !Array.isArray(status.openBuffers) ||
        !status.openBuffers.some((path) => String(path).endsWith('/a.md')),
    );
    await openFile(driver, statusPath, 'b.md');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'a later Markdown file inherits preview-only mode',
      (status) =>
        status.markdownViewMode === 'preview' &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false,
    );
    await openFile(driver, statusPath, 'plain.txt');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'a non-Markdown file ignores preview-only mode',
      (status) =>
        String(status.activeBuffer).endsWith('/plain.txt') &&
        status.markdownViewMode === 'preview' &&
        status.markdownPreviewOpen === false,
    );
    await driver.dispose();
    driver = null;

    statusPath = join(homeDirectory, 'preview-restart-status.json');
    driver = startDriver('preview-restart-status.json');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the second process reloads preview mode',
      (status) =>
        status.ready === true && status.markdownViewMode === 'preview',
    );
    await openFile(driver, statusPath, 'c.md');
    await focusEditor(driver, statusPath);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'preview-only survives a process restart',
      (status) =>
        status.markdownPreviewOpen === true && status.markdownParsing === false,
    );
    driver.sendKeys('Control+Shift+v');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the toggle restores the editor',
      (status) =>
        status.markdownViewMode === 'editor' &&
        status.markdownPreviewOpen === false,
    );
    HarnessSmoke.Class.requireCondition(
      savedMode(settingsPath) === 'editor',
      'the editor choice is saved under the isolated HOME',
    );
    driver.sendRawInput('x');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'editing works after the editor returns',
      (status) => Number(status.bufferRevision) > 1 && status.dirty === true,
    );
    await driver.dispose();
    driver = null;

    statusPath = join(homeDirectory, 'editor-restart-status.json');
    driver = startDriver('editor-restart-status.json');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the third process reloads editor mode',
      (status) =>
        status.ready === true &&
        status.markdownViewMode === 'editor' &&
        status.markdownPreviewOpen === false,
    );
    HarnessSmoke.Class.pass(
      'both Markdown view modes persist across files and restarts',
    );
  } catch (error) {
    if (driver) {
      console.error(driver.snapshot().text());
      try {
        console.error(
          JSON.stringify(HarnessSmoke.Class.readStatus(statusPath), null, 2),
        );
      } catch {
        console.error(`No readable status at ${statusPath}`);
      }
    }
    throw error;
  } finally {
    await driver?.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function drivePreviewScale(lineCount: number): Promise<void> {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `invar-markdown-mode-scale-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-markdown-mode-scale-home-${lineCount}-`),
  );
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    JSON.stringify({ markdownViewMode: 'preview' }),
  );
  await Bun.write(
    join(fixtureRoot, 'scale.md'),
    Array.from({ length: lineCount }, (_unusedValue, lineIndex) =>
      lineIndex === 0 ? `# Scale ${lineCount}` : `Scale row ${lineIndex}`,
    ).join('\n'),
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });
  try {
    await openFile(driver, statusPath, 'scale.md');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line preview-only parse settles`,
      (status) =>
        status.markdownViewMode === 'preview' &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false &&
        Number(status.markdownPreviewContentRows) > 0 &&
        status.editorSurfaceIdentifier === 'markdown.preview' &&
        status.editorColumnContent === 'markdown.preview',
      30_000,
    );
    await driver.awaitGridCondition(
      `${lineCount}-line preview-only surface paints without source`,
      (candidate) =>
        candidate.findText('╭─Preview') !== null &&
        candidate.findText(`Scale ${lineCount}`) !== null &&
        candidate.findText(`  1 ▏# Scale ${lineCount}`) === null,
      30_000,
    );
    HarnessSmoke.Class.pass(
      `${lineCount}-line Markdown uses the preview-only surface`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await drivePersistence();
await drivePreviewScale(10);
await drivePreviewScale(100_000);
console.log('smoke-markdown-view-mode-harness: ALL-PASS');
