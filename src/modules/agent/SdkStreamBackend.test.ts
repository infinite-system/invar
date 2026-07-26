import { expect, test } from 'bun:test';
import type { Options, Query } from '@anthropic-ai/claude-agent-sdk';
import { SdkStreamBackend } from './SdkStreamBackend';

test('a disposed SDK backend ignores later sends', () => {
  const backend = new SdkStreamBackend.Class({});
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send('ignored');

  expect(events).toEqual([]);
});

test('the SDK query appends the workspace IBR system prompt', async () => {
  let capturedOptions: Options | null = null;
  class CapturingSdkStreamBackend extends SdkStreamBackend.$Class {
    protected override createQuery(_prompt: string, options: Options): Query {
      capturedOptions = options;
      return {
        async *[Symbol.asyncIterator]() {},
        interrupt: async () => {},
        close: () => {},
      } as unknown as Query;
    }
  }
  const backend = new CapturingSdkStreamBackend({
    ibrFoundationContent: 'IBR FOUNDATION',
  });

  backend.send('hello');
  await Bun.sleep(0);

  expect((capturedOptions as Options | null)?.systemPrompt).toEqual({
    type: 'preset',
    preset: 'claude_code',
    append: 'IBR FOUNDATION',
  });
});

test('the SDK query omits an IBR append when the workspace has no file', async () => {
  let capturedOptions: Options | null = null;
  class CapturingSdkStreamBackend extends SdkStreamBackend.$Class {
    protected override createQuery(_prompt: string, options: Options): Query {
      capturedOptions = options;
      return {
        async *[Symbol.asyncIterator]() {},
        interrupt: async () => {},
        close: () => {},
      } as unknown as Query;
    }
  }
  const backend = new CapturingSdkStreamBackend({});

  backend.send('hello');
  await Bun.sleep(0);

  expect((capturedOptions as Options | null)?.systemPrompt).toBeUndefined();
});
