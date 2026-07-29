import { afterEach, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SdkBinaryExtraction } from './SdkBinaryExtraction';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const scratchDirectory of scratchDirectories.splice(0)) {
    rmSync(scratchDirectory, { recursive: true, force: true });
  }
});

test('the SDK reaper removes only stale unheld extraction directories', () => {
  const scratchDirectory = createScratchDirectory();
  const processDirectory = join(scratchDirectory, 'processes');
  mkdirSync(processDirectory);
  const staleDirectory = createExtractionDirectory(
    scratchDirectory,
    '.0123456789abcdef-0000002c.claude-agent-sdk-linux-arm64',
    1_000,
  );
  const liveDirectory = createExtractionDirectory(
    scratchDirectory,
    '.0123456789abcdef-0000002d.claude-agent-sdk-linux-arm64',
    1_000,
  );
  const commandLineLiveDirectory = createExtractionDirectory(
    scratchDirectory,
    '.0123456789abcdef-0000002f.claude-agent-sdk-linux-arm64',
    1_000,
  );
  const youngDirectory = createExtractionDirectory(
    scratchDirectory,
    '.0123456789abcdef-0000002e.claude-agent-sdk-linux-arm64',
    9_500,
  );
  const unrelatedDirectory = join(
    scratchDirectory,
    '.0123456789abcdef-0000002f.unrelated',
  );
  mkdirSync(unrelatedDirectory);
  const liveProcessDirectory = join(processDirectory, '42');
  mkdirSync(liveProcessDirectory);
  symlinkSync(join(liveDirectory, 'claude'), join(liveProcessDirectory, 'exe'));
  const protectedProcessDirectory = join(processDirectory, '43');
  mkdirSync(protectedProcessDirectory);
  writeFileSync(join(protectedProcessDirectory, 'exe'), 'not a symlink');
  writeFileSync(
    join(protectedProcessDirectory, 'cmdline'),
    `${join(commandLineLiveDirectory, 'claude')}\0--flag\0`,
  );

  const result = SdkBinaryExtraction.Class.reapStaleSiblings({
    temporaryDirectory: scratchDirectory,
    processDirectory,
    nowMilliseconds: 10_000,
    minimumAgeMilliseconds: 1_000,
  });

  expect(result).toEqual({
    removedDirectories: [staleDirectory],
    retainedLiveDirectories: [liveDirectory, commandLineLiveDirectory],
    retainedYoungDirectories: [youngDirectory],
    failedDirectories: [],
    processScanFailed: false,
  });
  expect(existsSync(staleDirectory)).toBe(false);
  expect(existsSync(liveDirectory)).toBe(true);
  expect(existsSync(commandLineLiveDirectory)).toBe(true);
  expect(existsSync(youngDirectory)).toBe(true);
  expect(existsSync(unrelatedDirectory)).toBe(true);
});

test('the SDK reaper removes nothing when the process census fails', () => {
  const scratchDirectory = createScratchDirectory();
  const extractionDirectory = createExtractionDirectory(
    scratchDirectory,
    '.fedcba9876543210-00000030.claude-agent-sdk-linux-arm64',
    1_000,
  );

  const result = SdkBinaryExtraction.Class.reapStaleSiblings({
    temporaryDirectory: scratchDirectory,
    processDirectory: join(scratchDirectory, 'missing-processes'),
    nowMilliseconds: 10_000,
    minimumAgeMilliseconds: 1_000,
  });

  expect(result.processScanFailed).toBe(true);
  expect(result.removedDirectories).toEqual([]);
  expect(existsSync(extractionDirectory)).toBe(true);
});

function createScratchDirectory(): string {
  const scratchDirectory = mkdtempSync(
    join(tmpdir(), 'invar-sdk-extraction-test-'),
  );
  scratchDirectories.push(scratchDirectory);
  return scratchDirectory;
}

function createExtractionDirectory(
  scratchDirectory: string,
  name: string,
  modifiedMilliseconds: number,
): string {
  const extractionDirectory = join(scratchDirectory, name);
  mkdirSync(extractionDirectory);
  writeFileSync(join(extractionDirectory, 'claude'), 'fixture');
  const modifiedDate = new Date(modifiedMilliseconds);
  utimesSync(extractionDirectory, modifiedDate, modifiedDate);
  return extractionDirectory;
}
