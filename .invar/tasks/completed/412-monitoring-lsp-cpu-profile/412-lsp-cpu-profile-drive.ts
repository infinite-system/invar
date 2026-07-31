#!/usr/bin/env bun
// This probe drives a real TypeScript server and prints its Monitoring CPU rows before and after an
// editor paste. Run `bun .invar/tasks/completed/412-monitoring-lsp-cpu-profile/412-lsp-cpu-profile-drive.ts 10`
// and repeat with `10000` for scale parity. The output shows the idle row, three ordered post-edit
// samples, and their peak. A higher post-edit peak means the delta sampler observed server work.
// The positive-control row comes from a child that completes 30,000,000 counted operations between
// samples. The probe stops if that known work does not produce a positive processor delta.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { LinuxProcessSampler } from '../../../../src/modules/monitoring/LinuxProcessSampler';
import { RuntimeSample } from '../../../../src/modules/monitoring/RuntimeSample';

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  while (!output.includes(marker)) {
    const result = await reader.read();
    if (result.done) break;
    output += decoder.decode(result.value, { stream: true });
  }
  return output;
}

async function runPositiveControl(): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `console.log('ready');
       let commandIndex = 0;
       for await (const chunk of Bun.stdin.stream()) {
         void chunk;
         if (commandIndex === 0) {
           let accumulator = 0;
           for (let operationIndex = 0; operationIndex < 30000000; operationIndex += 1)
             accumulator += operationIndex % 17;
           console.log('done ' + accumulator);
           commandIndex += 1;
         } else break;
       }`,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
  );
  const reader = child.stdout.getReader();
  await readUntil(reader, 'ready');
  const sampler = new LinuxProcessSampler.Class();
  const previous = sampler.sample(child.pid);
  child.stdin.write(new TextEncoder().encode('work\n'));
  await readUntil(reader, 'done');
  const current = sampler.sample(child.pid);
  if (previous === null || current === null) {
    throw new Error(
      'The CPU positive-control child disappeared before both samples',
    );
  }
  const processorPercent = RuntimeSample.Class.processorPercentBetween(
    previous,
    current,
  );
  console.log(`positiveControlProcessorPercent=${processorPercent}`);
  if (processorPercent <= 0) {
    throw new Error(
      'The CPU positive control completed known work but reported no processor delta',
    );
  }
  child.stdin.write(new TextEncoder().encode('exit\n'));
  child.stdin.end();
  await child.exited;
}

await runPositiveControl();

const lineCount = Math.max(1, Number(process.argv[2] ?? 10));
const fixtureRoot = mkdtempSync(join(tmpdir(), `invar-412-lsp-${lineCount}-`));
const homeDirectory = mkdtempSync(
  join(tmpdir(), `invar-412-home-${lineCount}-`),
);
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
writeFileSync(
  join(fixtureRoot, 'profile.ts'),
  Array.from(
    { length: lineCount },
    (_unused, lineIndex) =>
      `export const fixtureValue${lineIndex} = ${lineIndex};`,
  ).join('\n'),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 44,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

function readStatus(): Record<string, unknown> {
  return HarnessSmoke.Class.readStatus(statusPath) as Record<string, unknown>;
}

function serverRows(): readonly ServerRow[] {
  return (readStatus().monitoringLanguageServers ?? []) as readonly ServerRow[];
}

async function runPaletteCommand(commandTitle: string): Promise<void> {
  driver.sendKeys('Control+Shift+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette opens for ${commandTitle}`,
    (status) => status.paletteOpen === true,
  );
  driver.sendText(commandTitle);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${commandTitle} is the filtered command`,
    (status) =>
      status.paletteQuery === commandTitle && Number(status.paletteMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Command Palette closes after ${commandTitle}`,
    (status) => status.paletteOpen === false,
  );
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the workspace reaches ready before the fixture opens',
    (status) => status.ready === true,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the TypeScript fixture',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('profile.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the TypeScript fixture',
    (status) =>
      status.quickOpenQuery === 'profile.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the TypeScript server reaches ready',
    (status) => status.ready === true && status.lspStatus === 'ready',
  );
  await runPaletteCommand('View: Show Monitoring');
  const settledIdle = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a process sample establishes a near-zero idle delta window',
    (status) =>
      Number(status.monitoringSampleCount) >= 2 &&
      Array.isArray(status.monitoringLanguageServers) &&
      status.monitoringLanguageServers.length === 1 &&
      status.monitoringLanguageServers[0]?.processorPercent !== null &&
      Number(status.monitoringLanguageServers[0]?.processorPercent) <= 0.1,
  );
  const idleRows = settledIdle.monitoringLanguageServers as ServerRow[];
  console.log(`lineCount=${lineCount}`);
  console.log(`idle=${JSON.stringify(idleRows)}`);

  await runPaletteCommand('View: Focus Editor');
  const revisionBefore = Number(readStatus().bufferRevision);
  driver.sendText(
    Array.from(
      { length: 2_000 },
      (_unused, lineIndex) => `const editedValue${lineIndex} = ${lineIndex};\n`,
    ).join(''),
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the editor applies the profiling paste',
    (status) => Number(status.bufferRevision) > revisionBefore,
  );

  const postEditRows: ServerRow[][] = [];
  let previousSampleCount = Number(readStatus().monitoringSampleCount);
  for (let sampleIndex = 0; sampleIndex < 3; sampleIndex += 1) {
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `post-edit process sample ${sampleIndex + 1} completes`,
      (candidate) =>
        Number(candidate.monitoringSampleCount) > previousSampleCount,
    );
    previousSampleCount = Number(status.monitoringSampleCount);
    postEditRows.push(status.monitoringLanguageServers as ServerRow[]);
  }
  const peakProcessorPercent = Math.max(
    ...postEditRows.flatMap((rows) =>
      rows.map((row) => row.processorPercent ?? 0),
    ),
  );
  console.log(`postEdit=${JSON.stringify(postEditRows)}`);
  console.log(`peakProcessorPercent=${peakProcessorPercent}`);
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

interface ServerRow {
  serverName: string;
  processId: number;
  state: 'running' | 'gone';
  processorPercent: number | null;
  residentSetBytes: number | null;
}
