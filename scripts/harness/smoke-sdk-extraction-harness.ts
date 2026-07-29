#!/usr/bin/env bun
// Drives a default Invar boot through the real PTY inside an isolated temporary directory and proves
// that an unused agent pane creates no Claude Agent SDK binary extraction.
//
// invariant: Smoke boots do not extract agent binaries (scripts/harness/harness.invariants.md)
// invariant: SDK runtime loads on first turn (src/modules/agent/agent.invariants.md)
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), 'invar-sdk-extraction-harness-'),
);
const homeDirectory = join(temporaryDirectory, 'home');
const statusPath = join(temporaryDirectory, 'status.json');
const extractionDirectoryPattern =
  /^\.[0-9a-f]+-[0-9a-f]+\.claude-agent-sdk(?:-[a-z0-9_-]+)*$/i;

function extractionDirectoryNames(): string[] {
  return readdirSync(temporaryDirectory)
    .filter((name) => extractionDirectoryPattern.test(name))
    .sort();
}

mkdirSync(homeDirectory);

const positiveControlDirectory = join(
  temporaryDirectory,
  '.0123456789abcdef-0000002c.claude-agent-sdk-positive-control',
);
const beforePositiveControlCount = extractionDirectoryNames().length;
mkdirSync(positiveControlDirectory);
const afterPositiveControlCount = extractionDirectoryNames().length;
HarnessSmoke.Class.requireCondition(
  afterPositiveControlCount === beforePositiveControlCount + 1,
  'the SDK extraction census detects one planted matching directory',
);
rmSync(positiveControlDirectory, { recursive: true });

const beforeBootDirectories = extractionDirectoryNames();
const staleExtractionDirectory = join(
  temporaryDirectory,
  '.0123456789abcdef-0000002d.claude-agent-sdk-stale-control',
);
mkdirSync(staleExtractionDirectory);
utimesSync(staleExtractionDirectory, new Date(0), new Date(0));
const driver = new PtyTestDriver.Class({
  workspaceRoot: repositoryRoot,
  repositoryRoot,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    TMPDIR: temporaryDirectory,
    CLAUDE_CODE_TMPDIR: temporaryDirectory,
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the default app boot reaches ready without opening the agent pane',
    (status) => status.ready === true && status.panelActiveContent !== 'agent',
  );
  const afterBootDirectories = extractionDirectoryNames();
  HarnessSmoke.Class.requireCondition(
    !existsSync(staleExtractionDirectory),
    'app boot reaps the planted stale unheld SDK extraction',
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(afterBootDirectories) ===
      JSON.stringify(beforeBootDirectories),
    `unused-agent boot keeps the SDK extraction set unchanged: ${JSON.stringify(
      beforeBootDirectories,
    )} -> ${JSON.stringify(afterBootDirectories)}`,
  );

  driver.sendKeys('Control+q');
  HarnessSmoke.Class.requireCondition(
    (await driver.exitCode()) === 0,
    'the unused-agent app exits cleanly',
  );
  const afterExitDirectories = extractionDirectoryNames();
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(afterExitDirectories) ===
      JSON.stringify(beforeBootDirectories),
    `unused-agent exit keeps the SDK extraction set unchanged: ${JSON.stringify(
      beforeBootDirectories,
    )} -> ${JSON.stringify(afterExitDirectories)}`,
  );
  console.log('smoke-sdk-extraction-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(temporaryDirectory);
}
