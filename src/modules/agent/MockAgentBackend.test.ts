import { expect, test } from 'bun:test';
import { MockAgentBackend } from './MockAgentBackend';

test('the mock backend records prompts and emits scripted events', () => {
  const backend = new MockAgentBackend.Class();
  const eventKinds: string[] = [];
  backend.onEvent((event) => eventKinds.push(event.kind));

  backend.send('hello');
  backend.script([
    { kind: 'text-delta', text: 'reply' },
    { kind: 'session-end', reason: 'completed' },
  ]);

  expect(backend.sent).toEqual(['hello']);
  expect(eventKinds).toEqual(['text-delta', 'session-end']);
});
