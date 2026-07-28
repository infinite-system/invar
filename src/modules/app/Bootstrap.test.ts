import { expect, test } from 'bun:test';
import type { CliRenderer } from '@opentui/core';
import { Bootstrap } from './Bootstrap';

test('boot is published through the static capability seam', () => {
  expect(Bootstrap.Class.boot).toBeFunction();
});

test(
  'projected frame wait resolves only after its requested frame ' + 'completes',
  async () => {
    let completeFrame: (() => void) | undefined;
    let renderRequestCount = 0;
    let projectedFrameWaitResolved = false;
    const renderer = {
      once(eventName: string, listener: () => void) {
        expect(eventName).toBe('frame');
        completeFrame = listener;
        return this;
      },
      requestRender() {
        renderRequestCount++;
      },
    } as unknown as Pick<CliRenderer, 'once' | 'requestRender'>;

    const projectedFrameWaitPromise = TestBootstrap.awaitProjectedFrame(
      renderer,
    ).then(() => {
      projectedFrameWaitResolved = true;
    });
    await Promise.resolve();

    expect(renderRequestCount).toBe(1);
    expect(projectedFrameWaitResolved).toBe(false);
    expect(completeFrame).toBeFunction();

    completeFrame?.();
    await projectedFrameWaitPromise;
    expect(projectedFrameWaitResolved).toBe(true);
  },
);

class TestBootstrap extends Bootstrap.$Class {
  static override awaitProjectedFrame(
    renderer: Pick<CliRenderer, 'once' | 'requestRender'>,
  ): Promise<void> {
    return super.awaitProjectedFrame(renderer);
  }
}
