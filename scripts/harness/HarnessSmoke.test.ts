import { expect, test } from 'bun:test';
import { HarnessSmoke } from './HarnessSmoke';
import { awaitStatusPublication } from './HarnessSmokeSupport';
import type { PtyTestDriver } from './PtyTestDriver';

test('support status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-support-status-${crypto.randomUUID()}.json`;

  await expect(
    awaitStatusPublication(
      statusPath,
      'support ready flag',
      () => false,
      1,
    ),
  ).rejects.toThrow(`Timed out waiting for support ready flag at ${statusPath}`);
});

test('class status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-class-status-${crypto.randomUUID()}.json`;
  const driver = {
    async assertNoCompleteFrameEmittedFor(): Promise<void> {
      await Bun.sleep(1);
    },
  } as unknown as PtyTestDriver.Model;

  await expect(
    HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'class ready flag',
      () => false,
      1,
    ),
  ).rejects.toThrow(`Timed out waiting for class ready flag at ${statusPath}`);
});
