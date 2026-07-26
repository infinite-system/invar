import { expect, test } from 'bun:test';
import { HarnessSmoke } from './HarnessSmoke';
import { awaitStatusPublication } from './HarnessSmokeSupport';

test('support status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-support-status-${crypto.randomUUID()}.json`;

  await expect(
    awaitStatusPublication(statusPath, 'support ready flag', () => false, 1),
  ).rejects.toThrow(
    `Timed out waiting for support ready flag at ${statusPath}`,
  );
});

test('class status timeout names the condition and path', async () => {
  const statusPath = `/tmp/invar-missing-class-status-${crypto.randomUUID()}.json`;

  await expect(
    HarnessSmoke.Class.awaitStatus(
      {} as never,
      statusPath,
      'class ready flag',
      () => false,
      1,
    ),
  ).rejects.toThrow(`Timed out waiting for class ready flag at ${statusPath}`);
});
