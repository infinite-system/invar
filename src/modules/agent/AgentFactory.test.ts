import { expect, test } from 'bun:test';
import { AgentFactory } from './AgentFactory';
import { MockAgentBackend } from './MockAgentBackend';
import { Files } from '../system/Files';

test('create wires an independently identified injected backend through the session seam', () => {
  const backend = new MockAgentBackend.Class();
  const pane = AgentFactory.Class.create({
    backend,
    identifier: 'agent-2',
    label: 'Agent 2',
    ibrFoundation: null,
  });

  pane.agentSession.send('hello');

  expect(backend.sent).toEqual(['hello']);
  expect(pane.id).toBe('agent-2');
  expect(pane.instanceLabel).toBe('Agent 2');
  pane.dispose();
  expect(backend.disposed).toBe(true);
});

test('create resolves IBR from the selected workspace once for the session', () => {
  const workspaceRoot = Files.Class.createTemporaryDirectory(
    'invar-agent-factory-',
  );
  try {
    const expectedPath = Files.Class.join(
      workspaceRoot,
      '.claude',
      'skills',
      'ibr',
      'IBR.md',
    );
    Files.Class.write(expectedPath, 'WORKSPACE IBR');
    const backend = new MockAgentBackend.Class();
    const pane = AgentFactory.Class.create({
      backend,
      cwd: workspaceRoot,
      provider: 'codex',
    });

    pane.agentSession.send('hello');

    expect(pane.agentSession.ibrFoundationPath).toBe(expectedPath);
    expect(backend.sent).toEqual(['WORKSPACE IBR\n\nhello']);
    pane.dispose();
  } finally {
    Files.Class.removeDirectory(workspaceRoot);
  }
});
