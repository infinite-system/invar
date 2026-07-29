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

test('the SDK module loads only when the first turn starts', () => {
  let moduleLoadCount = 0;
  class LoadingSdkStreamBackend extends SdkStreamBackend.$Class {
    protected override loadSdkModule(): Promise<
      typeof import('@anthropic-ai/claude-agent-sdk')
    > {
      moduleLoadCount += 1;
      return new Promise(() => {});
    }
  }
  const backend = new LoadingSdkStreamBackend({});

  expect(moduleLoadCount).toBe(0);

  backend.send('first real use');

  expect(moduleLoadCount).toBe(1);
  backend.dispose();
});

test('the SDK query appends the workspace IBR system prompt', async () => {
  let capturedOptions: Options | null = null;
  let queryCreated: () => void = () => {};
  const queryCreation = new Promise<void>((resolve) => {
    queryCreated = resolve;
  });
  class CapturingSdkStreamBackend extends SdkStreamBackend.$Class {
    protected override loadSdkModule(): Promise<
      typeof import('@anthropic-ai/claude-agent-sdk')
    > {
      return Promise.resolve(
        {} as typeof import('@anthropic-ai/claude-agent-sdk'),
      );
    }

    protected override createQuery(_prompt: string, options: Options): Query {
      capturedOptions = options;
      queryCreated();
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
  await queryCreation;

  expect((capturedOptions as Options | null)?.systemPrompt).toEqual({
    type: 'preset',
    preset: 'claude_code',
    append: 'IBR FOUNDATION',
  });
});

test('the SDK query omits an IBR append when the workspace has no file', async () => {
  let capturedOptions: Options | null = null;
  let queryCreated: () => void = () => {};
  const queryCreation = new Promise<void>((resolve) => {
    queryCreated = resolve;
  });
  class CapturingSdkStreamBackend extends SdkStreamBackend.$Class {
    protected override loadSdkModule(): Promise<
      typeof import('@anthropic-ai/claude-agent-sdk')
    > {
      return Promise.resolve(
        {} as typeof import('@anthropic-ai/claude-agent-sdk'),
      );
    }

    protected override createQuery(_prompt: string, options: Options): Query {
      capturedOptions = options;
      queryCreated();
      return {
        async *[Symbol.asyncIterator]() {},
        interrupt: async () => {},
        close: () => {},
      } as unknown as Query;
    }
  }
  const backend = new CapturingSdkStreamBackend({});

  backend.send('hello');
  await queryCreation;

  expect((capturedOptions as Options | null)?.systemPrompt).toBeUndefined();
});
