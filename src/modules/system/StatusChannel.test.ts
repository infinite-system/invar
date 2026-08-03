import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StatusChannel } from './StatusChannel';

test('the status channel exposes one stable in-memory snapshot', () => {
  expect(StatusChannel.Class.snapshot).toBe(StatusChannel.Class.snapshot);
  expect(StatusChannel.Class.snapshot.lifecycleTier).toBeString();
});

test('a render request resets quiescence until the requested frame settles', () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'invar-status-channel-render-'),
  );
  const statusPath = join(temporaryDirectory, 'status.json');
  const previousStatusPath = process.env.TUI_STATUS_PATH;
  process.env.TUI_STATUS_PATH = statusPath;

  try {
    StatusChannel.Class.settle(41);
    expect(StatusChannel.Class.snapshot.renderQuiescent).toBe(true);

    StatusChannel.Class.markRenderRequested();
    expect(StatusChannel.Class.snapshot.renderQuiescent).toBe(false);
    expect(JSON.parse(readFileSync(statusPath, 'utf8')).renderQuiescent).toBe(
      false,
    );

    StatusChannel.Class.settle(42);
    expect(StatusChannel.Class.snapshot.renderQuiescent).toBe(true);
  } finally {
    if (previousStatusPath === undefined) {
      delete process.env.TUI_STATUS_PATH;
    } else {
      process.env.TUI_STATUS_PATH = previousStatusPath;
    }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
