import { expect, test } from 'bun:test';
import { ChannelStreamQueue } from './ChannelStreamQueue';

test('stream queue preserves order without retaining consumed chunks', async () => {
  const queue = new ChannelStreamQueue.Class();
  const received: number[] = [];
  const consuming = (async () => {
    for await (const chunk of queue) received.push(...chunk);
  })();
  queue.push(new Uint8Array([1, 2]));
  queue.push(new Uint8Array([3]));
  queue.end();
  await consuming;
  expect(received).toEqual([1, 2, 3]);
});
