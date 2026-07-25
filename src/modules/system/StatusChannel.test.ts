import { expect, test } from 'bun:test';
import { StatusChannel } from './StatusChannel';

test('the status channel exposes one stable in-memory snapshot', () => {
  expect(StatusChannel.Class.snapshot).toBe(StatusChannel.Class.snapshot);
  expect(StatusChannel.Class.snapshot.lifecycleTier).toBeString();
});
