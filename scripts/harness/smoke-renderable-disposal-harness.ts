#!/usr/bin/env bun
// This contract stops Invar through PtyTestDriver at 10 and 100,000 lines.
// Run it with `bun scripts/harness/smoke-renderable-disposal-harness.ts`.
// ALL-PASS means teardown exited at both scales without an OpenTUI child-removal warning.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness output history stays bounded (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: The render loop never wedges (project.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

type RenderableDisposalScale = 10 | 100_000;

const renderableRemovalWarning = 'is not a child of';

async function driveScale(lineCount: RenderableDisposalScale): Promise<void> {
  const fixture = await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-renderable-disposal-home-${lineCount}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixture.workspaceRoot,
    repositoryRoot: process.cwd(),
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });
  driver.outputSequenceCount(renderableRemovalWarning);

  try {
    await driver.awaitGridCondition(
      `scale ${lineCount}: the default app paints before disposal`,
      (snapshot) =>
        snapshot.findText('Invar — a terminal code workspace') !== null,
    );
    await HarnessSmoke.Class.openFileThroughQuickOpen(
      driver,
      statusPath,
      fixture.filePath,
    );

    await driver.dispose();

    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      `scale ${lineCount}: disposal exits with code zero`,
    );
    const warningCount = driver.outputSequenceCount(renderableRemovalWarning);
    HarnessSmoke.Class.requireCondition(
      warningCount === 0,
      `scale ${lineCount}: disposal emits zero renderable-removal warnings (observed ${warningCount})`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixture.workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveScale(10);
await driveScale(100_000);
console.log('smoke-renderable-disposal-harness: ALL-PASS');
