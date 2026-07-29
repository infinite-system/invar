/**
 * This probe drives a compiled Invar executable through the real PTY and counts hidden Claude Agent
 * SDK extraction directories before boot, after first paint, and after a clean quit.
 *
 * Build Invar, then run:
 * bun run build
 * bun .invar/tasks/active/244-sdk-binary-extraction-leak-fills-disk/244-drive-compiled-app-extraction.ts
 *
 * Each count is the number of `/tmp/.*.claude-agent-sdk*` directories at that boundary. New names
 * show which extraction directories this one app boot added. A safe unused-agent boot adds none.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = process.cwd();
const applicationCommand = [
  process.argv[2] ?? join(repositoryRoot, 'dist', 'iv'),
  repositoryRoot,
];
const sdkExtractionPattern = /^\..+\.claude-agent-sdk/;

function sdkExtractionDirectories(): string[] {
  return readdirSync('/tmp')
    .filter((name) => {
      const path = join('/tmp', name);
      return sdkExtractionPattern.test(name) && statSync(path).isDirectory();
    })
    .sort();
}

const beforeBoot = sdkExtractionDirectories();
const driver = new PtyTestDriver.Class({
  workspaceRoot: repositoryRoot,
  repositoryRoot,
  command: applicationCommand,
});

try {
  await driver.awaitGridCondition(
    'the compiled app paints its Invar status',
    (snapshot) => snapshot.text().includes('Invar'),
  );
  const afterBoot = sdkExtractionDirectories();
  console.log(`before_boot_count=${beforeBoot.length}`);
  console.log(`after_boot_count=${afterBoot.length}`);
  console.log(
    `boot_added=${JSON.stringify(afterBoot.filter((name) => !beforeBoot.includes(name)))}`,
  );

  driver.sendKeys('Control+q');
  const exitCode = await driver.exitCode();
  const afterQuit = sdkExtractionDirectories();
  console.log(`exit_code=${exitCode}`);
  console.log(`after_quit_count=${afterQuit.length}`);
  console.log(
    `quit_remaining=${JSON.stringify(afterQuit.filter((name) => !beforeBoot.includes(name)))}`,
  );
} finally {
  await driver.dispose();
}
