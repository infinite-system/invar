import { describe, expect, test } from 'bun:test';
import { AgentSession } from './AgentSession';
import { MockAgentBackend } from './MockAgentBackend';

/** A session wired to a scriptable mock backend — the whole harness with no subprocess. */
function makeSession(): {
  session: AgentSession.Model;
  backend: MockAgentBackend.Model;
} {
  const backend = new MockAgentBackend.Class();
  const session = new AgentSession.Class(backend);
  return { session, backend };
}

describe('AgentSession', () => {
  test('send records the prompt through the seam, appends a user entry, and goes streaming', () => {
    const { session, backend } = makeSession();

    session.send('  hello claude  ');

    expect(backend.sent).toEqual(['hello claude']); // trimmed, submitted through the one seam
    expect(session.transcript).toEqual([
      { role: 'user', text: 'hello claude' },
    ]);
    expect(session.status.value).toBe('streaming');
    expect(session.busy).toBe(true);
    expect(session.turnInFlight).toBe(true);
  });

  test('an empty or whitespace-only prompt is ignored (no turn, no entry)', () => {
    const { session, backend } = makeSession();
    session.send('   ');
    expect(backend.sent).toEqual([]);
    expect(session.transcript).toEqual([]);
    expect(session.status.value).toBe('idle');
  });

  test('an unresolved slash prompt reaches the backend unchanged', () => {
    const backend = new MockAgentBackend.Class();
    const workspaceRoot = '/tmp/invar-agent-unresolved-slash';
    const session = new AgentSession.Class(backend, 'claude', workspaceRoot);
    const prompt = '/unknown  preserve these spaces  ';

    session.send(prompt);

    expect(backend.sent).toEqual([prompt]);
    expect(session.transcript).toEqual([{ role: 'user', text: prompt }]);
  });

  test('consecutive text-deltas coalesce into ONE growing assistant entry', () => {
    const { session, backend } = makeSession();
    session.send('hi');

    backend.script([
      { kind: 'text-delta', text: 'Hel' },
      { kind: 'text-delta', text: 'lo ' },
      { kind: 'text-delta', text: 'there' },
    ]);

    expect(session.transcript).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'Hello there', engine: 'claude' },
    ]);
    expect(session.status.value).toBe('streaming');
  });

  test('a tool-use closes the assistant turn and pairs with its result by id', () => {
    const { session, backend } = makeSession();
    session.send('read the file');

    backend.script([
      { kind: 'text-delta', text: 'Let me look.' },
      { kind: 'tool-use', id: 't1', name: 'readFile', input: { path: 'a.ts' } },
    ]);
    expect(session.status.value).toBe('awaiting-tool');

    backend.emit({
      kind: 'tool-result',
      id: 't1',
      result: 'file contents',
      isError: false,
    });
    // A delta AFTER the tool result starts a NEW assistant entry, not appended to the pre-tool one.
    backend.emit({ kind: 'text-delta', text: 'Done.' });

    expect(session.transcript).toEqual([
      { role: 'user', text: 'read the file' },
      { role: 'assistant', text: 'Let me look.', engine: 'claude' },
      { role: 'tool-use', id: 't1', name: 'readFile', input: { path: 'a.ts' } },
      {
        role: 'tool-result',
        id: 't1',
        result: 'file contents',
        isError: false,
      },
      { role: 'assistant', text: 'Done.', engine: 'claude' },
    ]);
    expect(session.status.value).toBe('streaming');
  });

  test('session-end returns to idle (completed) or ended (error); busy clears', () => {
    const { session, backend } = makeSession();
    session.send('go');
    backend.emit({ kind: 'text-delta', text: 'ok' });
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(session.status.value).toBe('idle');
    expect(session.busy).toBe(false);
    expect(session.turnInFlight).toBe(false);

    session.send('again');
    backend.emit({ kind: 'session-end', reason: 'error' });
    expect(session.status.value).toBe('ended');
    expect(session.turnInFlight).toBe(false);
  });

  test('an error event appends an error entry without derailing the transcript', () => {
    const { session, backend } = makeSession();
    session.send('go');
    backend.emit({ kind: 'error', message: 'backend exploded' });
    expect(session.transcript).toEqual([
      { role: 'user', text: 'go' },
      { role: 'error', text: 'backend exploded' },
    ]);
  });

  test('send queues visible follow-ups while a turn is in flight', () => {
    const { session, backend } = makeSession();
    session.send('first');
    backend.emit({ kind: 'text-delta', text: 'working' }); // still streaming
    session.send('second');

    expect(backend.sent).toEqual(['first']);
    expect(session.transcript.filter((entry) => entry.role === 'user')).toEqual(
      [
        { role: 'user', text: 'first' },
        { role: 'user', text: 'second', delivery: 'queued' },
      ],
    );
    expect(session.queuedMessageCount).toBe(1);
  });

  test('queued messages dispatch in order as turns complete', () => {
    const { session, backend } = makeSession();
    session.send('first');
    session.send('second');
    session.send('third');

    expect(backend.sent).toEqual(['first']);
    expect(session.queuedMessageCount).toBe(2);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual(['first', 'second']);
    expect(session.queuedMessageCount).toBe(1);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual(['first', 'second', 'third']);
    expect(session.queuedMessageCount).toBe(0);
  });

  test('cancel records the terminal state and holds queued messages until empty Enter releases the head', () => {
    const { session, backend } = makeSession();
    session.send('first');
    session.send('second');
    session.send('third');

    expect(session.interrupt()).toBe(true);
    expect(session.turnState.value).toBe('canceled');
    expect(session.busy).toBe(false);
    expect(session.turnInFlight).toBe(false);
    expect(session.transcript).toContainEqual({
      role: 'system',
      text: 'canceled',
    });
    expect(backend.sent).toEqual(['first']);
    expect(session.queuedMessageCount).toBe(2);

    expect(session.send('')).toBe(true);
    expect(backend.sent).toEqual(['first', 'second']);
    expect(session.turnState.value).toBe('running');
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual(['first', 'second', 'third']);
  });

  test('inactivity becomes stalled without interrupting and a later event restores running', async () => {
    const previousThreshold = process.env.INVAR_AGENT_STREAM_INACTIVITY_MS;
    process.env.INVAR_AGENT_STREAM_INACTIVITY_MS = '15';
    try {
      const { session, backend } = makeSession();
      session.send('hang');
      await Bun.sleep(25);
      expect(session.turnState.value).toBe('stalled');
      expect(backend.interrupted).toBe(false);

      backend.emit({ kind: 'text-delta', text: 'resumed' });
      expect(session.turnState.value).toBe('running');
      backend.emit({ kind: 'session-end', reason: 'completed' });
      expect(session.turnState.value).toBe('idle');
    } finally {
      if (previousThreshold === undefined) {
        delete process.env.INVAR_AGENT_STREAM_INACTIVITY_MS;
      } else {
        process.env.INVAR_AGENT_STREAM_INACTIVITY_MS = previousThreshold;
      }
    }
  });

  test('renderRevision bumps on every folded event (the reactive paint pulse)', () => {
    const { session, backend } = makeSession();
    const before = session.renderRevision.value;
    session.send('go'); // +1
    backend.emit({ kind: 'text-delta', text: 'a' }); // +1
    backend.emit({ kind: 'text-delta', text: 'b' }); // +1
    expect(session.renderRevision.value).toBe(before + 3);
  });

  test('interrupt only fires while busy and drives an interrupted end', () => {
    const { session, backend } = makeSession();
    session.interrupt(); // idle → no-op
    expect(backend.interrupted).toBe(false);

    session.send('go');
    session.interrupt(); // busy → interrupts
    expect(backend.interrupted).toBe(true);
    expect(session.status.value).toBe('idle');
  });

  test('external observations queue behind user turns and each other', () => {
    const { session, backend } = makeSession();
    session.send('user-first');
    session.requestExternalResponse('observation-one');
    session.requestExternalResponse('observation-two');

    expect(backend.sent).toEqual(['user-first']);
    expect(session.turnInFlight).toBe(true);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual(['user-first', 'observation-one']);
    expect(session.turnInFlight).toBe(true);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual([
      'user-first',
      'observation-one',
      'observation-two',
    ]);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(session.turnInFlight).toBe(false);
  });

  test('a user turn queues behind an injected observation', () => {
    const { session, backend } = makeSession();
    session.requestExternalResponse('observation-first');
    session.send('user-second');

    expect(backend.sent).toEqual(['observation-first']);
    expect(session.queuedMessageCount).toBe(1);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(backend.sent).toEqual(['observation-first', 'user-second']);
    expect(session.queuedMessageCount).toBe(0);
    backend.emit({ kind: 'session-end', reason: 'completed' });
    expect(session.turnInFlight).toBe(false);
  });

  test('dispose tears down the backend', () => {
    const { session, backend } = makeSession();
    session.dispose();
    expect(backend.disposed).toBe(true);
  });
});

describe('AgentSession — interactive permission requests', () => {
  test('permission-request folds to a PENDING transcript entry and exposes pendingPermission', () => {
    const { session, backend } = makeSession();
    session.send('run it');
    const decisions: string[] = [];
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: { command: 'rm -rf /tmp/x' },
      respond: (decision) => decisions.push(decision),
    });
    expect(session.transcript.at(-1)).toMatchObject({
      role: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      status: 'pending',
    });
    expect(session.pendingPermission).toMatchObject({
      id: 'p1',
      toolName: 'Bash',
    });
    expect(session.status.value).toBe('awaiting-tool'); // the turn is paused on a gated tool
    expect(decisions).toEqual([]); // nothing resolved yet — the call is genuinely paused
  });

  test('respondToPermission routes the decision into the backend callback EXACTLY once and records it', () => {
    const { session, backend } = makeSession();
    session.send('run it');
    const decisions: string[] = [];
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: {},
      respond: (d) => decisions.push(d),
    });

    session.respondToPermission('p1', 'allow');
    expect(decisions).toEqual(['allow']);
    expect(session.transcript.at(-1)).toMatchObject({
      role: 'permission-request',
      status: 'allowed',
    });
    expect(session.pendingPermission).toBeNull();

    session.respondToPermission('p1', 'deny'); // second answer is a no-op (responder consumed)
    expect(decisions).toEqual(['allow']);
  });

  test('deny records a denied entry; always-allow records allowed', () => {
    const { session, backend } = makeSession();
    session.send('x');
    const decisions: string[] = [];
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: {},
      respond: (d) => decisions.push(d),
    });
    session.respondToPermission('p1', 'deny');
    expect(session.transcript.at(-1)).toMatchObject({ status: 'denied' });

    backend.emit({
      kind: 'permission-request',
      id: 'p2',
      toolName: 'Read',
      input: {},
      respond: (d) => decisions.push(d),
    });
    session.respondToPermission('p2', 'always-allow');
    expect(decisions).toEqual(['deny', 'always-allow']);
    expect(session.transcript.at(-1)).toMatchObject({ status: 'allowed' });
  });

  test('a session-end DENY-resolves any dangling pending request (no leaked pause)', () => {
    const { session, backend } = makeSession();
    session.send('x');
    const decisions: string[] = [];
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: {},
      respond: (d) => decisions.push(d),
    });
    backend.emit({ kind: 'session-end', reason: 'interrupted' });
    expect(decisions).toEqual(['deny']);
    expect(session.pendingPermission).toBeNull();
    expect(session.transcript.at(-1)).toMatchObject({
      role: 'permission-request',
      status: 'denied',
    });
  });

  test('permissionPromptsSupported reflects the backend capability flag', () => {
    const { session } = makeSession();
    expect(session.permissionPromptsSupported).toBe(false); // the mock declares no support
  });
});

describe('AgentSession — engine swap (live provider switch)', () => {
  test('swapBackend keeps the transcript, disposes the old backend, adds a system note, and rewires', () => {
    const { session, backend } = makeSession();
    session.send('remember ZEBRA-42');
    backend.emit({ kind: 'text-delta', text: 'ok, remembered' });
    backend.emit({ kind: 'session-end', reason: 'completed' });
    const beforeCount = session.transcript.length;

    const next = new MockAgentBackend.Class();
    expect(session.swapBackend(next, 'codex')).toBe(true);
    expect(backend.disposed).toBe(true); // old backend torn down
    expect(session.transcript.length).toBe(beforeCount + 1); // + the system note
    expect(session.transcript.at(-1)).toMatchObject({
      role: 'system',
      text: 'switched to codex — context ported',
    });
    // The earlier turns are still there (transcript preserved across the swap).
    expect(
      session.transcript.some(
        (entry) => entry.role === 'user' && entry.text === 'remember ZEBRA-42',
      ),
    ).toBe(true);

    // New events now fold through the NEW backend.
    session.send('what did I ask you to remember?');
    next.emit({ kind: 'text-delta', text: 'ZEBRA-42' });
    expect(next.sent.length).toBe(1);
  });

  test('the first send AFTER a swap prepends the context preamble to the BACKEND prompt (user entry stays clean)', () => {
    const { session, backend } = makeSession();
    session.send('the secret is ORCHID');
    backend.emit({ kind: 'session-end', reason: 'completed' });

    const next = new MockAgentBackend.Class();
    session.swapBackend(next, 'codex');
    session.send('tell me the secret');

    // The user's own transcript entry is exactly what they typed — no preamble leaked into it.
    expect(
      session.transcript.some(
        (entry) => entry.role === 'user' && entry.text === 'tell me the secret',
      ),
    ).toBe(true);
    // The BACKEND received the preamble (carrying ORCHID) prepended to the prompt.
    expect(next.sent[0]).toContain('Context ported from the previous engine');
    expect(next.sent[0]).toContain('ORCHID');
    expect(next.sent[0]).toContain('tell me the secret');

    // The preamble is ONE-SHOT: the next send after that carries no preamble.
    backend.emit({ kind: 'session-end', reason: 'completed' }); // (no-op, old backend)
    next.emit({ kind: 'session-end', reason: 'completed' });
    session.send('another message');
    expect(next.sent[1]).toBe('another message');
  });

  test('a fresh Codex backend receives IBR at position zero before the user prompt', () => {
    class CodexMockBackend extends MockAgentBackend.$Class {
      readonly ibrFoundationDelivery = 'prepend-prompt' as const;
    }
    const backend = new CodexMockBackend();
    const session = new AgentSession.Class(backend, 'codex', '/workspace', {
      path: '/workspace/.claude/skills/ibr/IBR.md',
      content: 'IBR FOUNDATION',
    });

    expect(session.ibrFoundationState).toBe('prepend-prompt-pending');
    session.send('first user message');

    expect(backend.sent[0]).toBe('IBR FOUNDATION\n\nfirst user message');
    expect(session.ibrFoundationState).toBe('prepend-prompt-sent');
    expect(session.transcript).toEqual([
      { role: 'user', text: 'first user message' },
    ]);
  });

  test('stateless Codex execution begins every fresh turn with IBR', () => {
    class StatelessCodexBackend extends MockAgentBackend.$Class {
      readonly ibrFoundationDelivery = 'prepend-every-prompt' as const;
    }
    const backend = new StatelessCodexBackend();
    const session = new AgentSession.Class(backend, 'codex', '/workspace', {
      path: '/workspace/.claude/skills/ibr/IBR.md',
      content: 'IBR FOUNDATION',
    });

    expect(session.ibrFoundationState).toBe('prepend-every-prompt');
    session.send('first');
    backend.emit({ kind: 'session-end', reason: 'completed' });
    session.send('second');

    expect(backend.sent).toEqual([
      'IBR FOUNDATION\n\nfirst',
      'IBR FOUNDATION\n\nsecond',
    ]);
  });

  test('Claude to Codex prepends IBR before context and double switching never stacks copies', () => {
    class ClaudeMockBackend extends MockAgentBackend.$Class {
      readonly ibrFoundationDelivery = 'append-system-prompt' as const;
    }
    class CodexMockBackend extends MockAgentBackend.$Class {
      readonly ibrFoundationDelivery = 'prepend-prompt' as const;
    }
    const foundation = {
      path: '/workspace/.claude/skills/ibr/IBR.md',
      content: 'IBR FOUNDATION',
    };
    const claude = new ClaudeMockBackend();
    const session = new AgentSession.Class(
      claude,
      'claude',
      '/workspace',
      foundation,
    );
    session.send('remember ORCHID');
    claude.emit({ kind: 'text-delta', text: 'remembered' });
    claude.emit({ kind: 'session-end', reason: 'completed' });

    const firstCodex = new CodexMockBackend();
    session.swapBackend(firstCodex, 'codex');
    session.send('repeat it');
    const firstCodexPrompt = firstCodex.sent[0]!;
    expect(firstCodexPrompt.startsWith('IBR FOUNDATION\n\n')).toBe(true);
    expect(firstCodexPrompt.indexOf('Context ported')).toBeGreaterThan(
      firstCodexPrompt.indexOf('IBR FOUNDATION'),
    );
    expect(firstCodexPrompt.indexOf('repeat it')).toBeGreaterThan(
      firstCodexPrompt.indexOf('Context ported'),
    );
    expect(firstCodexPrompt.match(/IBR FOUNDATION/g)).toHaveLength(1);
    firstCodex.emit({ kind: 'session-end', reason: 'completed' });

    const secondClaude = new ClaudeMockBackend();
    session.swapBackend(secondClaude, 'claude');
    session.send('through Claude');
    expect(secondClaude.sent[0]?.match(/IBR FOUNDATION/g)).toBeNull();
    secondClaude.emit({ kind: 'session-end', reason: 'completed' });

    const secondCodex = new CodexMockBackend();
    session.swapBackend(secondCodex, 'codex');
    session.send('back to Codex');
    expect(secondCodex.sent[0]?.match(/IBR FOUNDATION/g)).toHaveLength(1);
  });

  test('a workspace without IBR records the unavailable decision', () => {
    const backend = new MockAgentBackend.Class();
    const session = new AgentSession.Class(
      backend,
      'claude',
      '/workspace-without-ibr',
      null,
    );

    expect(session.ibrFoundationState).toBe('unavailable');
    expect(session.ibrFoundationPath).toBeNull();
  });

  test('swapBackend is refused while a turn is busy (switch only at rest) and does not leak', () => {
    const { session } = makeSession();
    session.send('go'); // now streaming/busy
    const next = new MockAgentBackend.Class();
    expect(session.swapBackend(next, 'codex')).toBe(false);
    expect(session.transcript.at(-1)).not.toMatchObject({ role: 'system' });
  });

  test('assistant entries are stamped with the engine that PRODUCED them; a swap relabels NEW entries only', () => {
    const backend = new MockAgentBackend.Class();
    const session = new AgentSession.Class(backend, 'claude');
    expect(session.activeEngine).toBe('claude');

    session.send('first question');
    backend.emit({ kind: 'text-delta', text: 'answered by claude' });
    backend.emit({ kind: 'session-end', reason: 'completed' });

    const next = new MockAgentBackend.Class();
    expect(session.swapBackend(next, 'codex')).toBe(true);
    expect(session.activeEngine).toBe('codex');

    session.send('second question');
    next.emit({ kind: 'text-delta', text: 'answered by codex' });

    const assistantEntries = session.transcript.filter(
      (entry) => entry.role === 'assistant',
    );
    expect(assistantEntries).toEqual([
      { role: 'assistant', text: 'answered by claude', engine: 'claude' }, // history KEEPS its producer
      { role: 'assistant', text: 'answered by codex', engine: 'codex' }, // new turns carry the new engine
    ]);
  });

  test('a pending permission request is stamped with the ACTIVE engine', () => {
    const backend = new MockAgentBackend.Class();
    const session = new AgentSession.Class(backend, 'codex');
    session.send('go');
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: {},
      respond: () => {},
    });
    expect(session.transcript.at(-1)).toMatchObject({
      role: 'permission-request',
      engine: 'codex',
    });
  });

  test('direct construction without an engine defaults to claude (the pre-stamp historical producer)', () => {
    const { session } = makeSession();
    expect(session.activeEngine).toBe('claude');
  });

  test('permissionPromptsSupported reflects the CURRENT backend after a swap', () => {
    const { session } = makeSession();
    expect(session.permissionPromptsSupported).toBe(false); // mock declares none
    const capable = new MockAgentBackend.Class();
    (
      capable as unknown as { supportsPermissionPrompts: boolean }
    ).supportsPermissionPrompts = true;
    session.swapBackend(capable, 'codex');
    expect(session.permissionPromptsSupported).toBe(true);
  });
});

describe('AgentSession — pendingPermission scan pointer (review B9)', () => {
  test('the getter stays correct across resolve cycles (pointer never re-walks settled history)', () => {
    const { session, backend } = makeSession();
    session.send('go');
    backend.emit({
      kind: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: {},
      respond: () => {},
    });
    expect(session.pendingPermission?.id).toBe('p1');
    session.respondToPermission('p1', 'allow');
    expect(session.pendingPermission).toBeNull();
    // A LATER pending request is still found after dozens of settled entries.
    for (let index = 0; index < 30; index += 1)
      backend.emit({ kind: 'text-delta', text: 'x' });
    backend.emit({
      kind: 'permission-request',
      id: 'p2',
      toolName: 'Read',
      input: {},
      respond: () => {},
    });
    expect(session.pendingPermission?.id).toBe('p2');
    session.respondToPermission('p2', 'deny');
    expect(session.pendingPermission).toBeNull();
  });
});
