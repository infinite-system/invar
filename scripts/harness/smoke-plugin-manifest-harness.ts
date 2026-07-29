#!/usr/bin/env bun
// Plugin settings, keybindings, and uninstall symmetry through the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

async function selectSetting(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
): Promise<void> {
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the settings selection publishes its current label',
    (candidate) => typeof candidate.settingsSelectedLabel === 'string',
  );
  for (
    let navigationStep = 0;
    navigationStep < 50 && status.settingsSelectedLabel !== label;
    navigationStep += 1
  ) {
    const previousLabel = status.settingsSelectedLabel;
    driver.sendKeys('Down');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `settings navigation advances toward ${label}`,
      (candidate) => candidate.settingsSelectedLabel !== previousLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    status.settingsSelectedLabel === label,
    `${label} is contributed to the live settings schema`,
  );
  await driver.awaitGridCondition(
    `${label} is visible and selected in Settings`,
    (snapshot) => snapshot.findText(`› ${label}`) !== null,
  );
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-plugin-manifest-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-plugin-manifest-home-'));

const statusPath = join(homeDirectory, 'status.json');

mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ 'inlineRewrite.enabled': true }),
);

await Bun.write(join(fixtureRoot, 'manifest.ts'), 'manifest-line\n');

await Bun.write(
  join(fixtureRoot, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['*.ts'],
  }),
);

await Bun.write(
  join(fixtureRoot, 'z-language.ts'),
  [
    'export const languageProbe = 42;',
    'const brokenValue: string = 1;',
    'languageProbe;',
    '',
  ].join('\n'),
);

await Bun.write(join(fixtureRoot, '.hidden-marker'), 'hidden\n');

// A file no structure source supports — the structure arm proves the stated degrade on it.
await Bun.write(join(fixtureRoot, 'notes.txt'), 'plain notes\n');

// A Markdown file for the auto-open uninstall-symmetry arm.
await Bun.write(
  join(fixtureRoot, 'z-auto-notes.md'),
  '# Z auto notes\n\nThe preview of this file opens itself.\n',
);

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

HarnessSmoke.Class.runGit(fixtureRoot, ['add', 'manifest.ts']);

HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.name=plugin-manifest-smoke',
  '-c',
  'user.email=plugin-manifest@example.test',
  'commit',
  '-qm',
  'base',
]);

await Bun.write(join(fixtureRoot, 'manifest.ts'), 'manifest-line\nchanged\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
  command: [
    process.execPath,
    `--preload=${join(
      process.cwd(),
      'scripts/harness/inline-rewrite-mock-provider-preload.ts',
    )}`,
    'src/main.ts',
    fixtureRoot,
  ],
});

try {
  console.log(
    '== plugin manifest: contributed settings headings and live effect ==',
  );
  await driver.awaitGridCondition(
    'the default plugin file tree renders before manifest drives begin',
    (snapshot) => snapshot.findText('manifest.ts') !== null,
    15_000,
  );
  const initialStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the default plugin settings sections and file tree are published',
    (status) => {
      const sections = status.settingsSections as string[] | undefined;
      return (
        sections?.includes('File Tree') === true &&
        sections.includes('Git') &&
        sections.includes('Markdown') &&
        sections.includes('Language') &&
        sections.includes('Inline Rewrite') &&
        Number(status.treeRows) > 2
      );
    },
  );
  const initialTreeRows = Number(initialStatus.treeRows);
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings opens over the contributed plugin schema',
    (status) => status.settingsOpen === true,
  );
  await selectSetting(driver, statusPath, 'Show hidden files');
  await driver.awaitGridCondition(
    'the File Tree heading is painted above its contributed setting',
    (snapshot) =>
      snapshot.findText('File Tree') !== null &&
      snapshot.findText('Show hidden files') !== null,
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'hiding dot entries changes the real file tree projection',
    (status) =>
      status.settingsSelectedValue === 'off' &&
      Number(status.treeRows) < initialTreeRows,
  );
  HarnessSmoke.Class.pass(
    'the File Tree setting live-applies by removing hidden rows',
  );

  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the first Git setting is selected',
    (status) => status.settingsSelectedLabel === 'Changes/log split',
  );
  await driver.awaitGridCondition(
    'the Git heading is painted above its contributed setting',
    (snapshot) =>
      snapshot.findText('Git') !== null &&
      snapshot.findText('Changes/log split') !== null,
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second Git setting is selected',
    (status) => status.settingsSelectedLabel === 'Previous/current split',
  );
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown setting is selected',
    (status) => status.settingsSelectedLabel === 'Source/preview split',
  );
  await driver.awaitGridCondition(
    'the Markdown heading is painted above its contributed setting',
    (snapshot) =>
      snapshot.findText('Markdown') !== null &&
      snapshot.findText('Source/preview split') !== null,
  );
  HarnessSmoke.Class.pass(
    'Git and Markdown settings render under their contributed headings',
  );
  driver.sendKeys('Escape');
  const closedSettingsStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes back onto the file tree',
    (status) => status.settingsOpen === false,
  );
  HarnessSmoke.Class.requireCondition(
    closedSettingsStatus.focus === 'files',
    `Settings returns focus to Files (${String(closedSettingsStatus.focus)})`,
  );

  console.log('== plugin manifest: Git Tab leaves while editor Tab indents ==');
  driver.sendKeys('Enter');
  const openedEditorStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the fixture opens in the editor',
    (status) =>
      status.focus === 'editor' &&
      typeof status.activeBuffer === 'string' &&
      status.activeBuffer.length > 0,
  );
  const editorRevisionBeforeTab = Number(openedEditorStatus.bufferRevision);
  driver.sendKeys('Tab');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Tab indents the editor buffer',
    (status) =>
      status.focus === 'editor' &&
      (status.cursor as { col?: number } | undefined)?.col === 2 &&
      status.dirty === true &&
      Number(status.bufferRevision) > editorRevisionBeforeTab,
  );
  await driver.awaitGridCondition(
    'the editor tab paints its dirty mutation marker',
    (snapshot) => snapshot.findText('manifest.ts ●') !== null,
  );
  HarnessSmoke.Class.pass('Tab remains editor indentation');

  driver.sendKeys('Control+Shift+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Git plugin chord focuses its repository pane',
    (status) => status.sidebarView === 'git' && status.focus === 'git',
  );
  driver.sendKeys('Tab');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contributed Git Tab binding returns focus to the editor',
    (status) => status.sidebarView === 'git' && status.focus === 'editor',
  );
  HarnessSmoke.Class.pass('Git owns and restores its Tab-to-leave gesture');

  console.log(
    '== plugin manifest: Extensions uninstall removes schema and binding ==',
  );
  driver.sendKeys('Control+Shift+x');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Extensions opens with keyboard focus',
    (status) =>
      status.sidebarView === 'extensions' && status.focus === 'extensions',
  );
  await driver.awaitGridCondition(
    'Extensions lists the installed default plugins',
    (snapshot) =>
      snapshot.findText('[x] File Tree') !== null &&
      snapshot.findText('[x] Git') !== null &&
      snapshot.findText('[x] Markdown') !== null &&
      snapshot.findText('[x] Language Intelligence') !== null &&
      snapshot.findText('[x] Inline Rewrite') !== null,
  );
  driver.sendKeys('Down');
  await driver.awaitGridCondition(
    'Git is selected in Extensions',
    (snapshot) => snapshot.findText('› [x] Git') !== null,
  );
  driver.sendKeys('Space');
  const disabledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall removes Git settings while Extensions stays active',
    (status) =>
      status.sidebarView === 'extensions' &&
      !(status.settingsSections as string[] | undefined)?.includes('Git'),
  );
  HarnessSmoke.Class.requireCondition(
    !(disabledStatus.settingsLabels as string[]).includes(
      'Changes/log split',
    ) &&
      !(disabledStatus.settingsLabels as string[]).includes(
        'Previous/current split',
      ),
    'uninstall removes every contributed Git settings row',
  );

  driver.sendKeysWithoutFrameExpectation('Control+Shift+g');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the removed Git chord cannot switch away before Settings opens',
    (status) =>
      status.settingsOpen === true &&
      status.sidebarView === 'extensions' &&
      !(status.settingsSections as string[] | undefined)?.includes('Git'),
  );
  HarnessSmoke.Class.pass(
    'uninstall removes both the settings schema and keybinding layer',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes back onto Extensions before reinstall',
    (status) => status.settingsOpen === false && status.focus === 'extensions',
  );

  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the Git settings schema',
    (status) =>
      (status.settingsSections as string[] | undefined)?.includes('Git') ===
      true,
  );
  driver.sendKeys('Control+Shift+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the Git keybinding layer',
    (status) => status.sidebarView === 'git' && status.focus === 'git',
  );
  HarnessSmoke.Class.pass('Extensions reinstall restores both registrations');

  console.log(
    '== plugin manifest: Language provider disable has a legible fallback ==',
  );
  symlinkSync(
    join(process.cwd(), 'node_modules'),
    join(fixtureRoot, 'node_modules'),
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the language provider disable drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('z-language.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the language-provider fixture',
    (status) =>
      status.quickOpenQuery === 'z-language.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  const openedLanguageStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File closes after activating the language-provider fixture',
    (status) => status.quickOpenOpen === false,
  );
  HarnessSmoke.Class.requireCondition(
    String(openedLanguageStatus.activeBuffer).endsWith('/z-language.ts'),
    'the language-provider fixture opens in the editor',
  );
  driver.sendKeys('Control+Shift+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the installed provider starts and publishes diagnostics',
    (status) =>
      status.focus === 'editor' &&
      typeof status.lspProvider === 'string' &&
      status.lspProvider.length > 0 &&
      Number(status.diagnosticsCount) > 0,
  );
  driver.sendKeys('Control+Shift+x', 'Down', 'Down');
  await driver.awaitGridCondition(
    'Language Intelligence is selected in Extensions',
    (snapshot) => snapshot.findText('› [x] Language Intelligence') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall releases the provider and withdraws its settings',
    (status) =>
      !(status.settingsSections as string[] | undefined)?.includes(
        'Language',
      ) &&
      status.lspProvider === null &&
      Number(status.diagnosticsCount) === 0,
  );
  driver.sendKeys('Control+Shift+j');
  const providerUnavailableStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'focus returns to the editor after language-provider uninstall',
    (status) =>
      status.focus === 'editor' &&
      String(status.activeBuffer).endsWith('/z-language.ts'),
  );
  await driver.awaitGridCondition(
    'the status bar explains the missing provider',
    (snapshot) => snapshot.findText('Language features unavailable') !== null,
  );
  const cursorBeforeUnavailableGestures = providerUnavailableStatus.cursor;
  const revisionBeforeUnavailableGestures = Number(
    providerUnavailableStatus.bufferRevision,
  );
  driver.sendKeys('Control+Space', 'Control+]');
  const languageProbePosition = driver.snapshot().findText('languageProbe;');
  if (!languageProbePosition) {
    throw new Error('Language hover probe is not visible');
  }
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: languageProbePosition.column + 2,
    row: languageProbePosition.row,
    button: 'none',
  });
  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the later Extensions action proves the inert gestures and hover left the app live',
    (snapshot) => snapshot.findText('› [ ] Language Intelligence') !== null,
  );
  const unavailableGestureStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    unavailableGestureStatus.completionOpen === false &&
      JSON.stringify(unavailableGestureStatus.cursor) ===
        JSON.stringify(cursorBeforeUnavailableGestures) &&
      Number(unavailableGestureStatus.bufferRevision) ===
        revisionBeforeUnavailableGestures &&
      String(unavailableGestureStatus.activeBuffer).endsWith('/z-language.ts'),
    'completion and definition gestures stay inert without mutating or navigating',
  );
  HarnessSmoke.Class.pass(
    'diagnostics clear and completion, definition, and hover degrade without a crash',
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the Language settings and provider process',
    (status) =>
      (status.settingsSections as string[] | undefined)?.includes(
        'Language',
      ) === true,
  );
  HarnessSmoke.Class.pass('Extensions reinstall restores the LSP provider');

  console.log(
    '== plugin manifest: Inline Rewrite disable and re-enable are symmetric ==',
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the Inline Rewrite manifest drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('manifest.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the dirty manifest fixture',
    (status) =>
      status.quickOpenQuery === 'manifest.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter', 'Control+Shift+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the dirty manifest regains editor focus',
    (status) =>
      String(status.activeBuffer).endsWith('/manifest.ts') &&
      status.focus === 'editor',
  );
  // Walk to the row by LOOKING for it, not by counting keypresses: the extension list grows as
  // plugins are contributed, and an ordinal Down would silently land on a neighbour.
  driver.sendKeys('Control+Shift+x');
  driver.sendKeysWithoutFrameExpectation(
    ...Array.from({ length: 12 }, () => 'Up'),
  );
  await driver.awaitGridCondition(
    'the Extensions selection is anchored on its first row',
    (snapshot) => snapshot.findText('› [x] File Tree') !== null,
  );
  for (
    let selectionStep = 0;
    selectionStep < 12 &&
    driver.snapshot().findText('› [x] Inline Rewrite') === null;
    selectionStep++
  ) {
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  await driver.awaitGridCondition(
    'Inline Rewrite is selected in Extensions',
    (snapshot) => snapshot.findText('› [x] Inline Rewrite') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall removes the Inline Rewrite setting schema',
    (status) =>
      !(status.settingsSections as string[] | undefined)?.includes(
        'Inline Rewrite',
      ),
  );
  driver.sendKeys('Control+Shift+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'focus returns to the editor with Inline Rewrite disabled',
    (status) => status.focus === 'editor',
  );
  driver.sendKeysWithoutFrameExpectation('Control+Shift+r');
  await Bun.sleep(500);
  HarnessSmoke.Class.requireCondition(
    Number(
      HarnessSmoke.Class.readStatus(statusPath).inlineRewriteMockRequestCount ??
        0,
    ) === 0,
    'uninstall removes the Inline Rewrite command and keybinding',
  );

  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the disabled Inline Rewrite row remains selected for reinstall',
    (snapshot) => snapshot.findText('› [ ] Inline Rewrite') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the Inline Rewrite setting schema',
    (status) =>
      (status.settingsSections as string[] | undefined)?.includes(
        'Inline Rewrite',
      ) === true,
  );
  driver.sendKeys('Control+Shift+j', 'Control+Shift+r');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'reinstall restores the Inline Rewrite command and keybinding',
    (status) => Number(status.inlineRewriteMockRequestCount) === 1,
  );
  HarnessSmoke.Class.pass(
    'Extensions reinstall restores every Inline Rewrite registration',
  );

  // The RUNTIME positive control: with no terminal runtime installed, the host must degrade — the
  // panel affordance opens nothing, the Add menu stops offering the kind, terminal status is simply
  // absent, and the application stays live. Then reinstall must bring all of it back.
  console.log(
    '== plugin manifest: Terminal runtime disable leaves the host live ==',
  );
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the terminal runtime opens its pane before being uninstalled',
    (status) =>
      status.terminalVisible === true &&
      status.terminalObservedEventCount !== undefined,
  );
  driver.sendKeys('Control+j', 'Control+Shift+x');
  // Anchor on the FIRST row (repeated Up saturates at the top), then walk down until the Terminal
  // row is the selected one — every step then moves toward it, so each wait observes a real change.
  driver.sendKeysWithoutFrameExpectation(
    ...Array.from({ length: 12 }, () => 'Up'),
  );
  await driver.awaitGridCondition(
    'the Extensions selection is anchored on its first row',
    (snapshot) => snapshot.findText('› [x] File Tree') !== null,
  );
  for (
    let selectionStep = 0;
    selectionStep < 12 && driver.snapshot().findText('› [x] Terminal') === null;
    selectionStep++
  ) {
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  await driver.awaitGridCondition(
    'Terminal is selected in Extensions',
    (snapshot) => snapshot.findText('› [x] Terminal') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstalling the Terminal runtime withdraws its status projection',
    (status) => status.terminalObservedEventCount === undefined,
  );
  // Uninstall must leave NO live pane behind. An orphaned pane keeps rendering and holding the
  // panel's keyboard focus, so it swallows chords on behalf of a runtime that no longer exists.
  await driver.awaitGridCondition(
    'the uninstalled runtime leaves no pane in the panel',
    () =>
      !(
        HarnessSmoke.Class.readStatus(statusPath).panelCellIds as
          string[] | undefined
      )?.includes('terminal'),
  );
  HarnessSmoke.Class.pass(
    'the Terminal runtime uninstalls, releasing its pane and its status projection',
  );

  driver.sendKeys('Control+Shift+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'focus returns to the editor with the Terminal runtime disabled',
    (status) => status.focus === 'editor',
  );
  const bufferBeforeInertToggle = String(
    HarnessSmoke.Class.readStatus(statusPath).activeBuffer,
  );
  driver.sendKeysWithoutFrameExpectation('Control+j');
  await Bun.sleep(500);
  const statusAfterInertToggle = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    statusAfterInertToggle.terminalObservedEventCount === undefined &&
      String(statusAfterInertToggle.activeBuffer) === bufferBeforeInertToggle &&
      statusAfterInertToggle.focus === 'editor',
    'the panel affordance is inert without a terminal runtime and nothing crashes',
  );
  HarnessSmoke.Class.pass(
    'Ctrl+J opens no pane and leaves the editor untouched without a runtime',
  );

  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the disabled Terminal row remains selected for reinstall',
    (snapshot) => snapshot.findText('› [ ] Terminal') !== null,
  );
  driver.sendKeys('Space');
  driver.sendKeys('Control+Shift+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'focus returns to the editor with the Terminal runtime reinstalled',
    (status) => status.focus === 'editor',
  );
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstalling the Terminal runtime restores its pane and status',
    (status) =>
      status.terminalVisible === true &&
      status.terminalObservedEventCount !== undefined,
  );
  HarnessSmoke.Class.pass(
    'Extensions reinstall restores the Terminal runtime and its pane',
  );

  // The CONTRIBUTOR positive control for the editor column itself. The source-text editor is an
  // ordinary contribution now, so uninstalling it must release BOTH what it painted (its gutter and
  // code renderables) and what it held (every view its workspaces' provider made), leave the column
  // with a stated affordance rather than a blank pane, and leave the application live.
  console.log(
    '== plugin manifest: the source-text editor uninstalls and reinstalls ==',
  );
  // Close the terminal panel before driving anything the host must answer. With the panel OPEN and
  // the workspace focus back on the editor, Ctrl+P never reaches Quick Open — a pre-existing defect
  // (see the #220 report's bycatch), reproduced on the unmodified tree, and not this arm's subject.
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the terminal panel closes before the editor-contribution drive',
    (status) => status.terminalVisible === false,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the editor-contribution drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('manifest.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the manifest fixture again',
    (status) =>
      status.quickOpenQuery === 'manifest.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the manifest fixture is open again before the editor-contribution drive',
    (status) => status.quickOpenOpen === false,
  );
  // Save first. A view holding UNSAVED edits is not released, because the edits live in the view and
  // nowhere else — so an unsaved buffer would measure the exception rather than the rule.
  driver.sendKeys('Control+s');
  const editorInstalledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the installed editor contribution occupies the column and holds a saved view',
    (status) =>
      status.dirty === false &&
      status.editorColumnContent === 'source-text-editor' &&
      Number(status.sourceTextViewsForOpenBuffers) > 0,
  );
  HarnessSmoke.Class.requireCondition(
    Number(editorInstalledStatus.matchingBracketLine) === -1,
    'the editor contribution projects its bracket-match keys while installed',
  );
  await driver.awaitGridCondition(
    'the installed editor paints the fixture text',
    (snapshot) => snapshot.findText('manifest-line') !== null,
  );

  driver.sendKeys('Control+Shift+x');
  driver.sendKeysWithoutFrameExpectation(
    ...Array.from({ length: 12 }, () => 'Up'),
  );
  await driver.awaitGridCondition(
    'the Extensions selection is anchored on its first row',
    (snapshot) => snapshot.findText('› [x] File Tree') !== null,
  );
  for (
    let selectionStep = 0;
    selectionStep < 12 &&
    driver.snapshot().findText('› [x] Source Text Editor') === null;
    selectionStep++
  ) {
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  await driver.awaitGridCondition(
    'Source Text Editor is selected in Extensions',
    (snapshot) => snapshot.findText('› [x] Source Text Editor') !== null,
  );
  driver.sendKeys('Space');
  const editorUninstalledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstalling the editor empties the column and releases every open-buffer view',
    (status) =>
      status.editorColumnContent === null &&
      Number(status.sourceTextViewsForOpenBuffers) === 0,
  );
  HarnessSmoke.Class.requireCondition(
    editorUninstalledStatus.matchingBracketLine === undefined &&
      editorUninstalledStatus.matchingBracketColumn === undefined,
    'uninstall withdraws the editor status projection instead of projecting a stale match',
  );
  // An empty column must SAY it is empty. A blank pane reads as an empty document, which is the
  // blank lie this affordance exists to prevent.
  await driver.awaitGridCondition(
    'the empty editor column states its affordance',
    (snapshot) =>
      snapshot.findText('No editor content is installed.') !== null &&
      snapshot.findText('manifest-line') === null,
  );
  HarnessSmoke.Class.pass(
    'the editor contribution uninstalls, releasing its surfaces and its views',
  );

  const bufferBeforeInertEditorGestures = String(
    HarnessSmoke.Class.readStatus(statusPath).activeBuffer,
  );
  driver.sendKeysWithoutFrameExpectation('Control+Shift+j', 'Down', 'Down');
  await Bun.sleep(500);
  const inertEditorGestureStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    String(inertEditorGestureStatus.activeBuffer) ===
      bufferBeforeInertEditorGestures &&
      inertEditorGestureStatus.editorColumnContent === null &&
      Number(inertEditorGestureStatus.sourceTextViewsForOpenBuffers) === 0,
    'editor gestures stay inert with no editor installed and nothing crashes',
  );
  HarnessSmoke.Class.pass(
    'the application stays live and honest with an empty editor column',
  );

  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the disabled Source Text Editor row remains selected for reinstall',
    (snapshot) => snapshot.findText('› [ ] Source Text Editor') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall puts the editor contribution back in the column',
    (status) =>
      status.editorColumnContent === 'source-text-editor' &&
      status.matchingBracketLine !== undefined,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens after the editor contribution is reinstalled',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('manifest.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the manifest fixture after reinstall',
    (status) => Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the reinstalled editor builds a fresh view for the reopened buffer',
    (status) =>
      status.quickOpenOpen === false &&
      Number(status.sourceTextViewsForOpenBuffers) > 0,
  );
  await driver.awaitGridCondition(
    'the reinstalled editor paints the fixture text again',
    (snapshot) =>
      snapshot.findText('manifest-line') !== null &&
      snapshot.findText('No editor content is installed.') === null,
  );
  HarnessSmoke.Class.pass(
    'Extensions reinstall restores the editor column and its views',
  );

  console.log(
    '== plugin manifest: the structure navigator outlines, jumps, degrades, and reinstalls ==',
  );
  // Walk the Extensions selection to a named row by LOOKING for it (the list grows as plugins
  // are contributed; an ordinal Down would silently land on a neighbour).
  const selectExtensionsRow = async (rowLabel: string): Promise<void> => {
    driver.sendKeys('Control+Shift+x');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Extensions opens before selecting ${rowLabel}`,
      (status) => status.sidebarView === 'extensions',
    );
    driver.sendKeysWithoutFrameExpectation(
      ...Array.from({ length: 12 }, () => 'Up'),
    );
    await driver.awaitGridCondition(
      'the Extensions selection is anchored on its first row',
      (snapshot) => snapshot.findText('› [x] File Tree') !== null,
    );
    for (
      let selectionStep = 0;
      selectionStep < 12 &&
      driver.snapshot().findText(`› ${rowLabel}`) === null;
      selectionStep++
    ) {
      driver.sendKeys('Down');
      await driver.awaitScreenChange();
    }
    if (driver.snapshot().findText(`› ${rowLabel}`) === null) {
      throw new Error(`Extensions row is not reachable: ${rowLabel}`);
    }
  };

  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the structure drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('z-language.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the language fixture for the structure drive',
    (status) => Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the language fixture opens before the structure pane shows',
    (status) =>
      status.quickOpenOpen === false &&
      String(status.activeBuffer).endsWith('/z-language.ts'),
  );
  driver.sendKeys('Control+Shift+u');
  const outlineReadyStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the structure pane shows and the real server answers an outline',
    (status) =>
      status.sidebarView === 'structure' &&
      status.focus === 'structure' &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0,
  );
  await driver.awaitGridCondition(
    'the structure pane paints the outline rows',
    (snapshot) =>
      snapshot.findText('Structure') !== null &&
      snapshot.findText('languageProbe :1') !== null,
  );
  HarnessSmoke.Class.pass(
    'the structure pane lists the real documentSymbol outline',
  );

  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'activating the selected symbol jumps the editor to its name',
    (status) => {
      const cursor = status.cursor as { line: number; col: number } | null;
      return (
        status.focus === 'editor' &&
        cursor !== null &&
        cursor.line === 0 &&
        cursor.col === 13
      );
    },
  );
  HarnessSmoke.Class.pass(
    'Enter jumps the editor to the symbol through the view contract',
  );

  const requestsAfterOutline = Number(
    HarnessSmoke.Class.readStatus(statusPath).structureRequests,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the unsupported-file degrade',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('notes.txt');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the unsupported fixture',
    (status) => Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the structure pane states the unsupported-file degrade',
    (status) =>
      status.sidebarView === 'structure' &&
      status.structureStatus === 'unavailable' &&
      String(status.structureNotice).includes('file type'),
  );
  await driver.awaitGridCondition(
    'the unsupported degrade is painted, never a blank pane',
    (snapshot) => snapshot.findText('No structure available.') !== null,
  );
  const requestsAfterUnsupported = Number(
    HarnessSmoke.Class.readStatus(statusPath).structureRequests,
  );
  HarnessSmoke.Class.requireCondition(
    requestsAfterUnsupported === requestsAfterOutline,
    'an unsupported file costs zero structure requests',
  );
  HarnessSmoke.Class.pass(
    'an unsupported file states its affordance at zero request cost',
  );

  // Cross-plugin symmetry: uninstalling Language Intelligence withdraws the SOURCE while the
  // PANE stays installed — it must degrade to a stated notice, and come back on reinstall.
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the source-withdrawal drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('z-language.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the language fixture again',
    (status) => Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await selectExtensionsRow('[x] Language Intelligence');
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'Language Intelligence uninstalls under the structure pane',
    (snapshot) => snapshot.findText('› [ ] Language Intelligence') !== null,
  );
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the pane without a source states it, never a blank',
    (status) =>
      status.sidebarView === 'structure' &&
      status.structureStatus === 'unavailable' &&
      String(status.structureNotice).includes('No structure source'),
  );
  await selectExtensionsRow('[ ] Language Intelligence');
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'Language Intelligence reinstalls under the structure pane',
    (snapshot) => snapshot.findText('› [x] Language Intelligence') !== null,
  );
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the reinstalled source feeds the pane an outline again',
    (status) =>
      status.sidebarView === 'structure' &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) > 0,
  );
  HarnessSmoke.Class.pass(
    'the pane degrades and recovers with the source plugin lifecycle',
  );

  // The plugin's own uninstall symmetry, with the reinstall arm — the fourth-verse lesson.
  await selectExtensionsRow('[x] Structure Navigator');
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall removes the structure pane and withdraws its projection',
    (status) =>
      !(status.sidebarViewIdentifiers as string[]).includes('structure') &&
      status.structureStatus === undefined,
  );
  driver.sendKeysWithoutFrameExpectation('Control+Shift+u');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the removed structure chord cannot switch away before Settings opens',
    (status) =>
      status.settingsOpen === true && status.sidebarView === 'extensions',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes back onto Extensions before the structure reinstall',
    (status) => status.settingsOpen === false && status.focus === 'extensions',
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the structure pane registration',
    (status) =>
      (status.sidebarViewIdentifiers as string[]).includes('structure'),
  );
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the reinstalled structure pane outlines the fixture again',
    (status) =>
      status.sidebarView === 'structure' &&
      status.focus === 'structure' &&
      status.structureStatus === 'ready' &&
      Number(status.structureRows) === Number(outlineReadyStatus.structureRows),
  );
  HarnessSmoke.Class.pass(
    'the structure navigator uninstalls and reinstalls symmetrically',
  );

  console.log(
    '== plugin manifest: the database provider and consumer withdraw and reinstall independently ==',
  );
  driver.sendKeys('Control+Shift+y');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the database consumer resolves the installed SQLite provider',
    (status) =>
      status.sidebarView === 'database' &&
      status.databaseConsumerStatus === 'ready' &&
      status.databaseProviderIdentifier === 'sqlite' &&
      status.databaseQueryValue === '42',
  );
  await driver.awaitGridCondition(
    'the database pane paints the bounded query and lazy schema results',
    (snapshot) =>
      snapshot.findText('Provider: sqlite') !== null &&
      snapshot.findText('Query value: 42') !== null &&
      snapshot.findText('Schema: provider_seam_probe') !== null,
  );

  await selectExtensionsRow('[x] SQLite Provider');
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'the SQLite provider uninstalls while the consumer stays installed',
    (snapshot) => snapshot.findText('› [ ] SQLite Provider') !== null,
  );
  driver.sendKeys('Control+Shift+y');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the database consumer states that no provider remains',
    (status) =>
      status.sidebarView === 'database' &&
      status.databaseConsumerStatus === 'unavailable' &&
      status.databaseProviderIdentifier === null &&
      status.databaseProviderPluginActive === undefined,
  );
  await driver.awaitGridCondition(
    'the database pane paints the missing-provider state',
    (snapshot) => snapshot.findText('No database provider is') !== null,
  );

  await selectExtensionsRow('[ ] SQLite Provider');
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'the SQLite provider reinstalls while the consumer stays installed',
    (snapshot) => snapshot.findText('› [x] SQLite Provider') !== null,
  );
  driver.sendKeys('Control+Shift+y');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the database consumer resolves the reinstalled provider',
    (status) =>
      status.sidebarView === 'database' &&
      status.databaseConsumerStatus === 'ready' &&
      status.databaseProviderIdentifier === 'sqlite' &&
      status.databaseQueryValue === '42' &&
      status.databaseProviderPluginActive === true,
  );

  await selectExtensionsRow('[x] Database Explorer');
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall removes the database pane and all consumer projections',
    (status) =>
      !(status.sidebarViewIdentifiers as string[]).includes('database') &&
      status.databaseConsumerStatus === undefined &&
      status.databaseProviderIdentifier === undefined &&
      status.databaseQueryValue === undefined &&
      status.databaseSchemaObjectNames === undefined &&
      status.databaseConsumerFailure === undefined &&
      status.databaseProviderPluginActive === true,
  );
  driver.sendKeysWithoutFrameExpectation('Control+Shift+y');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the removed database chord cannot switch away before Settings opens',
    (status) =>
      status.settingsOpen === true && status.sidebarView === 'extensions',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes onto Extensions before the database consumer reinstall',
    (status) => status.settingsOpen === false && status.focus === 'extensions',
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the database pane registration',
    (status) =>
      (status.sidebarViewIdentifiers as string[]).includes('database'),
  );
  driver.sendKeys('Control+Shift+y');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the reinstalled database consumer resolves SQLite again',
    (status) =>
      status.sidebarView === 'database' &&
      status.databaseConsumerStatus === 'ready' &&
      status.databaseProviderIdentifier === 'sqlite' &&
      status.databaseQueryValue === '42',
  );
  HarnessSmoke.Class.pass(
    'the database provider and consumer uninstall and reinstall symmetrically',
  );

  console.log(
    '== plugin manifest: Markdown auto-open uninstalls and reinstalls symmetrically ==',
  );
  // invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens before the Markdown auto-open drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('z-auto-notes.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the Markdown fixture',
    (status) =>
      status.quickOpenQuery === 'z-auto-notes.md' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown tab auto-opens its preview without a keystroke',
    (status) =>
      String(status.activeBuffer).endsWith('/z-auto-notes.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownPreviewSide === 'left',
  );
  await driver.awaitGridCondition(
    'the auto-opened preview pane is painted',
    (snapshot) => snapshot.findText('╭─Preview') !== null,
  );
  HarnessSmoke.Class.pass(
    'an enabled Markdown plugin auto-opens the preview for a Markdown tab',
  );
  await selectExtensionsRow('[x] Markdown');
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'the Markdown row unchecks on uninstall',
    (snapshot) => snapshot.findText('› [ ] Markdown') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall withdraws the Markdown settings schema',
    (status) =>
      !(status.settingsSections as string[] | undefined)?.includes('Markdown'),
  );
  // The plugin's status projection leaves with it, so the key reads undefined — anything but true.
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall closes the auto-opened preview',
    (status) => status.markdownPreviewOpen !== true,
  );
  await driver.awaitGridCondition(
    'no stale preview pane survives the Markdown uninstall',
    (snapshot) => snapshot.findText('╭─Preview') === null,
  );
  HarnessSmoke.Class.pass(
    'uninstalling Markdown removes the pane and the auto-open behaviour',
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the Markdown schema and re-applies auto-open to the active tab',
    (status) =>
      (status.settingsSections as string[] | undefined)?.includes(
        'Markdown',
      ) === true && status.markdownPreviewOpen === true,
  );
  await driver.awaitGridCondition(
    'the reinstalled plugin auto-opens the preview pane again',
    (snapshot) => snapshot.findText('╭─Preview') !== null,
  );
  HarnessSmoke.Class.pass(
    'Markdown auto-open uninstalls and reinstalls symmetrically',
  );
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
