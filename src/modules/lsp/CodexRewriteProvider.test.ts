import { expect, test } from 'bun:test';
import { CodexRewriteProvider } from './CodexRewriteProvider';

class InspectableCodexRewriteProvider extends CodexRewriteProvider.$Class {
  parse(output: string) {
    return this.parseCandidates(output);
  }
}

class MissingCodexRewriteProvider extends CodexRewriteProvider.$Class {
  protected override codexExecutable(): string | null {
    return null;
  }
}

test('the provider is unavailable when the Codex CLI is absent', () => {
  expect(new MissingCodexRewriteProvider().available).toBe(false);
});

test('Codex rewrite JSON maps to the provider-neutral candidate shape', () => {
  const provider = new InspectableCodexRewriteProvider();
  const candidates = provider.parse(
    JSON.stringify({
      candidates: [
        {
          region: {
            start: { line: 1, column: 0 },
            end: { line: 2, column: 4 },
          },
          replacementText: 'first\\nsecond',
          rationale: 'states the intent',
        },
      ],
    }),
  );

  expect(candidates).toEqual([
    {
      region: {
        start: { line: 1, column: 0 },
        end: { line: 2, column: 4 },
      },
      replacementText: 'first\\nsecond',
      rationale: 'states the intent',
    },
  ]);
});

test('Codex JSONL framing extracts the completed assistant message', () => {
  const provider = new InspectableCodexRewriteProvider();
  const message = JSON.stringify({
    candidates: [
      {
        region: {
          start: { line: 0, column: 0 },
          end: { line: 0, column: 5 },
        },
        replacementText: 'value',
        rationale: 'clearer',
      },
    ],
  });
  const candidates = provider.parse(
    [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: message },
      }),
      JSON.stringify({ type: 'turn.completed' }),
    ].join('\n'),
  );

  expect(candidates[0]?.replacementText).toBe('value');
});

test('malformed Codex output degrades to no proposal', () => {
  const provider = new InspectableCodexRewriteProvider();

  expect(() => provider.parse('not json')).toThrow(
    'codex returned malformed rewrite JSON',
  );
  expect(
    provider.parse('{"candidates":[{"replacementText":"missing range"}]}'),
  ).toEqual([]);
});
