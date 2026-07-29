// The third projection, proven with plain doubles: a scripted AgentSession transcript in, the exact
// spoken lines (and their order) out through a MockTtsBackend — no engine, no audio. Covers the
// milestone filter (only COMPLETED turns speak), the off-by-default gate (silent when disabled),
// assistant-only narration, ordering across turns, barge-in, and the mid-session enable (no backlog).
import { test, expect } from 'bun:test';
import { ref } from 'vue';
import { AgentSession } from '../agent/AgentSession';
import { MockAgentBackend } from '../agent/MockAgentBackend';
import { MockTtsBackend } from './MockTtsBackend';
import { NarrationProjection } from './NarrationProjection';
import type { AgentEvent } from '../agent/AgentEvents.interface';

function wire(enabled: boolean) {
  const backend = new MockAgentBackend.Class();
  const session = new AgentSession.Class(backend);
  const tts = new MockTtsBackend.Class();
  const toggle = ref(enabled);
  const projection = new NarrationProjection.Class(session, toggle, tts);
  return { backend, session, tts, toggle, projection };
}

// A full assistant turn that STARTS, streams two deltas, and ENDS (the completion milestone).
const completedTurn = (text: string): AgentEvent[] => [
  { kind: 'session-start' },
  { kind: 'text-delta', text: text.slice(0, Math.ceil(text.length / 2)) },
  { kind: 'text-delta', text: text.slice(Math.ceil(text.length / 2)) },
  { kind: 'session-end', reason: 'completed' },
];

test('OFF by default: a completed turn speaks NOTHING', () => {
  const { backend, tts, projection } = wire(false);
  backend.script(completedTurn('hello world'));
  expect(tts.spoken).toEqual([]);
  expect(projection.spokenCount.value).toBe(0);
});

test('ON: a completed assistant turn is spoken once, in full', () => {
  const { backend, tts, projection } = wire(true);
  backend.script(completedTurn('hello world'));
  expect(tts.spoken).toEqual(['hello world']);
  expect(projection.spokenCount.value).toBe(1);
  expect(projection.lastSpoken.value).toBe('hello world');
});

test('inline code content is narrated in place for every adjacent position and content shape', () => {
  const narrationCases = [
    {
      description: 'mixed with prose',
      assistantReply: 'run `bun test` first',
      expectedSpokenText: 'run bun test first',
    },
    {
      description: 'at the message start',
      assistantReply: '`bun test` comes first',
      expectedSpokenText: 'bun test comes first',
    },
    {
      description: 'at the message end',
      assistantReply: 'finish with `bun test`',
      expectedSpokenText: 'finish with bun test',
    },
    {
      description: 'in multiple spans',
      assistantReply: 'run `bun test` then `bun run build`',
      expectedSpokenText: 'run bun test then bun run build',
    },
    {
      description: 'when the span contains only symbols',
      assistantReply: 'keep `---` here',
      expectedSpokenText: 'keep --- here',
    },
  ];

  for (const narrationCase of narrationCases) {
    const {
      backend: agentBackend,
      tts: textToSpeechBackend,
      projection: narrationProjection,
    } = wire(true);
    agentBackend.script(completedTurn(narrationCase.assistantReply));
    expect(textToSpeechBackend.spoken, narrationCase.description).toEqual([
      narrationCase.expectedSpokenText,
    ]);
    narrationProjection.dispose();
  }
});

test('hostile inline-code turns reach mock TTS in order with no internal tokens', () => {
  const {
    session,
    backend: agentBackend,
    tts: textToSpeechBackend,
  } = wire(true);
  const assistantReplies = [
    '`alpha``beta`',
    '**`boldCode`** [`linkCode`](https://example.com)',
    'first `one`\n\nsecond `two`',
  ];

  for (const assistantReply of assistantReplies) {
    agentBackend.script(completedTurn(assistantReply));
  }

  expect(textToSpeechBackend.spoken).toEqual([
    'alphabeta',
    'boldCode linkCode',
    'first one second two',
  ]);
  expect(
    textToSpeechBackend.spoken.every(
      (spokenText) => !/[\uE000-\uF8FF]/u.test(spokenText),
    ),
  ).toBe(true);
  expect(session.transcript.filter((entry) => entry.role === 'system')).toEqual(
    [],
  );
});

test('a restore miss speaks original text and appends a transcript-visible warning', () => {
  const {
    session,
    backend: agentBackend,
    tts: textToSpeechBackend,
  } = wire(true);
  const assistantReply = '[visible text](`inlineDestination`)';

  agentBackend.script(completedTurn(assistantReply));

  expect(textToSpeechBackend.spoken).toEqual([assistantReply]);
  expect(textToSpeechBackend.spoken[0]).not.toMatch(/[\uE000-\uF8FF]/u);
  expect(
    session.transcript.some(
      (entry) =>
        entry.role === 'system' && entry.text.includes('Narration warning'),
    ),
  ).toBe(true);
});

test('MILESTONE filter: streaming text is NOT spoken until the turn completes', () => {
  const { backend, tts } = wire(true);
  backend.emit({ kind: 'session-start' });
  backend.emit({ kind: 'text-delta', text: 'thinking' });
  backend.emit({ kind: 'text-delta', text: ' more' });
  expect(tts.spoken).toEqual([]); // still streaming → not a milestone → silent
  backend.emit({ kind: 'session-end', reason: 'completed' });
  expect(tts.spoken).toEqual(['thinking more']); // boundary reached → one utterance, whole turn
});

test('a turn closed by a following tool-use is spoken at that boundary', () => {
  const { backend, tts } = wire(true);
  backend.emit({ kind: 'session-start' });
  backend.emit({ kind: 'text-delta', text: 'let me check' });
  expect(tts.spoken).toEqual([]); // trailing open turn, still awaiting → silent
  backend.emit({ kind: 'tool-use', id: 't1', name: 'Bash', input: {} });
  expect(tts.spoken).toEqual(['let me check']); // the tool-use closed the assistant turn → spoken
});

test('multiple turns speak in order; only assistant text, never user/tool entries', () => {
  const { session, backend, tts } = wire(true);
  session.send('first question'); // a USER entry — must never be spoken
  backend.script([
    { kind: 'text-delta', text: 'answer one' },
    { kind: 'tool-use', id: 't1', name: 'Read', input: {} },
    { kind: 'tool-result', id: 't1', result: 'file contents', isError: false }, // must never be spoken
    { kind: 'text-delta', text: 'answer two' },
    { kind: 'session-end', reason: 'completed' },
  ]);
  expect(tts.spoken).toEqual(['answer one', 'answer two']);
});

test('barge-in: bargeIn() stops the backend (interruptibility)', () => {
  const { tts, projection } = wire(true);
  projection.bargeIn();
  projection.bargeIn();
  expect(tts.stopCount).toBe(2);
});

test('enabling mid-session starts from the NEXT turn — no backlog flood', () => {
  const { backend, tts, toggle } = wire(false);
  backend.script(completedTurn('old turn while muted')); // arrived while OFF
  expect(tts.spoken).toEqual([]);
  toggle.value = true; // user enables narration now
  backend.script([
    { kind: 'session-start' },
    { kind: 'text-delta', text: 'new turn' },
    { kind: 'session-end', reason: 'completed' },
  ]);
  expect(tts.spoken).toEqual(['new turn']); // the old muted turn is NOT re-spoken
});

test('dispose stops watching and disposes the backend', () => {
  const { backend, tts, projection } = wire(true);
  projection.dispose();
  expect(tts.disposed).toBe(true);
  backend.script(completedTurn('after dispose')); // no longer observed
  expect(tts.spoken).toEqual([]);
});
