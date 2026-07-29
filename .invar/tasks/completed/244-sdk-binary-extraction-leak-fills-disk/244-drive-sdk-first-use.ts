/**
 * This probe drives the first real Claude SDK turn through a compiled Invar app and its real PTY.
 *
 * Build and run it with:
 * bun run build
 * bun .invar/tasks/active/244-sdk-binary-extraction-leak-fills-disk/244-drive-sdk-first-use.ts
 * Pass another compiled Invar executable as the first argument to compare a scratch tree.
 *
 * A successful run prints the SDK extraction names after the turn starts, the exact assistant
 * response, and the clean app exit code. Zero or one hidden extraction is disk-bounded. The assistant
 * response proves the first-use path loaded the SDK and completed a real turn.
 */
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = process.cwd();
const applicationBinary = process.argv[2] ?? join(repositoryRoot, 'dist', 'iv');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'invar-sdk-first-use-'));
const statusPath = join(temporaryDirectory, 'status.json');
const responseMarker = 'SDK-FIRST-USE-OK';
const extractionDirectoryPattern =
  /^\.[0-9a-f]+-[0-9a-f]+\.claude-agent-sdk(?:-[a-z0-9_-]+)*$/i;

function extractionDirectoryNames(): string[] {
  return readdirSync(temporaryDirectory)
    .filter((name) => extractionDirectoryPattern.test(name))
    .sort();
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: repositoryRoot,
  repositoryRoot,
  command: [applicationBinary, repositoryRoot],
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
    'the compiled app reaches ready before agent first use',
    (status) => status.ready === true,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent pane is visible and active',
    (status) =>
      status.terminalVisible === true && status.panelActiveContent === 'agent',
  );

  const prompt = `Reply with exactly ${responseMarker} and do not use tools.`;
  driver.sendText(prompt);
  await driver.awaitGridCondition(
    'the first-use prompt is visible in the composer',
    (snapshot) => snapshot.findText(responseMarker) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the first Claude SDK turn starts',
    (status) => status.agentBusy === true,
  );
  const firstUseExtractions = extractionDirectoryNames();
  HarnessSmoke.Class.requireCondition(
    firstUseExtractions.length <= 1,
    `the running app owns at most one hidden SDK extraction: ${JSON.stringify(
      firstUseExtractions,
    )}`,
  );

  const completedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the first Claude SDK turn completes with the requested response',
    (status) =>
      status.agentBusy === false &&
      String(status.agentLastAssistantText).includes(responseMarker),
    180_000,
  );
  console.log(`first_use_extractions=${JSON.stringify(firstUseExtractions)}`);
  console.log(
    `assistant_response=${JSON.stringify(completedStatus.agentLastAssistantText)}`,
  );

  driver.sendKeys('Control+q');
  console.log(`exit_code=${await driver.exitCode()}`);
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(temporaryDirectory);
}
