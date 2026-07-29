import { afterEach, describe, expect, test } from 'bun:test';
import { EchoAgentBackend } from './EchoAgentBackend';
import type { AgentEvent, PermissionDecision } from './AgentEvents.interface';
import type { AgentTerminalToolPort } from './AgentTerminalTools';

afterEach(() => {
  delete process.env.INVAR_AGENT_ECHO_PERMISSION;
});

/** Collect every event; capture the respond of the first permission-request. */
function drive(prompt: string, backend = new EchoAgentBackend.Class()) {
  const events: AgentEvent[] = [];
  let respond: ((decision: PermissionDecision) => void) | null = null;
  backend.onEvent((event) => {
    events.push(event);
    if (event.kind === 'permission-request' && !respond)
      respond = event.respond;
  });
  backend.send(prompt);
  return { backend, events, respond: () => respond };
}

describe('EchoAgentBackend — env-gated permission flow (the hermetic ask-mode double)', () => {
  test('pauses the scripted tool behind a permission-request; ALLOW runs it and completes', () => {
    process.env.INVAR_AGENT_ECHO_PERMISSION = '1';
    const { events, respond } = drive('do the thing');
    expect(events.some((event) => event.kind === 'permission-request')).toBe(
      true,
    );
    expect(events.some((event) => event.kind === 'tool-use')).toBe(false); // genuinely paused
    respond()!('allow');
    expect(events.some((event) => event.kind === 'tool-use')).toBe(true);
    expect(events.some((event) => event.kind === 'tool-result')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      kind: 'session-end',
      reason: 'completed',
    });
  });

  test('DENY skips the tool; the turn continues with a denial acknowledgement', () => {
    process.env.INVAR_AGENT_ECHO_PERMISSION = '1';
    const { events, respond } = drive('do the thing');
    respond()!('deny');
    expect(events.some((event) => event.kind === 'tool-use')).toBe(false);
    expect(
      events.some(
        (event) => event.kind === 'text-delta' && event.text.includes('denied'),
      ),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({
      kind: 'session-end',
      reason: 'completed',
    });
  });

  test('ALWAYS-ALLOW auto-allows the tool for the REST of the session (no second prompt)', () => {
    process.env.INVAR_AGENT_ECHO_PERMISSION = '1';
    const shared = new EchoAgentBackend.Class();
    const first = drive('first', shared);
    first.respond()!('always-allow');
    expect(first.events.some((event) => event.kind === 'tool-use')).toBe(true);

    const second = drive('second', shared); // same backend = same session
    expect(
      second.events.some((event) => event.kind === 'permission-request'),
    ).toBe(false); // auto-allowed
    expect(second.events.some((event) => event.kind === 'tool-use')).toBe(true);
  });

  test('without the env gate, no permission events are emitted (default echo unchanged)', () => {
    const { events } = drive('plain');
    expect(events.some((event) => event.kind === 'permission-request')).toBe(
      false,
    );
    expect(events.at(-1)).toMatchObject({
      kind: 'session-end',
      reason: 'completed',
    });
  });
});

test('terminal tool listing follows the live permission ladder', () => {
  const terminalTools: AgentTerminalToolPort = {
    readTerminalInput: () => ({
      currentInputLine: 'printf brokn',
      recentOutputLines: ['recent output'],
    }),
    readTerminalScrollback: (request) => ({
      lines: Array.from(
        { length: request.lineCount ?? 40 },
        (_unusedValue, lineIndex) => `line-${lineIndex + 1}`,
      ),
      totalLines: 80,
      startLine: 1,
      endLine: request.lineCount ?? 40,
    }),
    stageTerminalCommand: async (command) => ({ state: 'staged', command }),
    replaceTerminalInput: async (command) => ({ state: 'staged', command }),
    runTerminalCommand: async (command) => ({ state: 'executed', command }),
  };
  const askMode = drive(
    'terminal-tools:list',
    new EchoAgentBackend.Class({ terminalTools, skipPermissions: false }),
  );
  const askModeText = askMode.events
    .filter((event) => event.kind === 'text-delta')
    .map((event) => event.text)
    .join('');
  expect(askModeText).toContain('stageTerminalCommand');
  expect(askModeText).not.toContain('runTerminalCommand');

  const bypassMode = drive(
    'terminal-tools:list',
    new EchoAgentBackend.Class({ terminalTools, skipPermissions: true }),
  );
  const bypassModeText = bypassMode.events
    .filter((event) => event.kind === 'text-delta')
    .map((event) => event.text)
    .join('');
  expect(bypassModeText).toContain('stageTerminalCommand');
  expect(bypassModeText).toContain('runTerminalCommand');
});
