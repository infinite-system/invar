import { expect, test } from 'bun:test';
import { AgentFactory } from './AgentFactory';
import { MockAgentBackend } from './MockAgentBackend';

test('create wires an independently identified injected backend through the session seam', () => {
  const backend = new MockAgentBackend.Class();
  const pane = AgentFactory.Class.create({
    backend,
    identifier: 'agent-2',
    label: 'Agent 2',
  });

  pane.agentSession.send('hello');

  expect(backend.sent).toEqual(['hello']);
  expect(pane.id).toBe('agent-2');
  expect(pane.instanceLabel).toBe('Agent 2');
  pane.dispose();
  expect(backend.disposed).toBe(true);
});
