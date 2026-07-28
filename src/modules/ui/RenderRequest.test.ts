import { expect, test } from 'bun:test';
import { RenderRequest } from './RenderRequest';

test('a next-turn request survives current-turn render coalescing', async () => {
  let currentTurnRequestIsCoalesced = true;
  let acceptedRenderRequestCount = 0;
  const scheduledRenderRequest = new Promise<void>((resolve) => {
    RenderRequest.Class.afterCurrentTurn(() => {
      if (!currentTurnRequestIsCoalesced) acceptedRenderRequestCount += 1;
      resolve();
    });
  });

  expect(acceptedRenderRequestCount).toBe(0);
  currentTurnRequestIsCoalesced = false;
  await scheduledRenderRequest;
  expect(acceptedRenderRequestCount).toBe(1);
});
