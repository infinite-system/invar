import { expect, test } from 'bun:test';
import { AgentFactory } from './AgentFactory';
import { MockAgentBackend } from './MockAgentBackend';

test('create wires an injected backend through the session seam', () => {
  const backend = new MockAgentBackend.Class();
  const pane = AgentFactory.Class.create({ backend });

  pane.agentSession.send('hello');

  expect(backend.sent).toEqual(['hello']);
  pane.dispose();
  expect(backend.disposed).toBe(true);
});
