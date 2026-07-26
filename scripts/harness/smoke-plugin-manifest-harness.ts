#!/usr/bin/env bun
// Plugin settings, keybindings, and uninstall symmetry through the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
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
  '{}\n',
);
await Bun.write(join(fixtureRoot, 'manifest.ts'), 'manifest-line\n');
await Bun.write(join(fixtureRoot, '.hidden-marker'), 'hidden\n');
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
  columns: 110,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
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
      snapshot.findText('[x] Markdown') !== null,
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
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
