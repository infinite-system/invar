import { describe, expect, test } from 'bun:test';
import { Files } from '../system/Files';
import { AgentIbrFoundation } from './AgentIbrFoundation';

describe('AgentIbrFoundation', () => {
  test('resolves the workspace IBR path and content', () => {
    const workspaceRoot =
      Files.Class.createTemporaryDirectory('invar-agent-ibr-');
    try {
      const expectedPath = Files.Class.join(
        workspaceRoot,
        '.claude',
        'skills',
        'ibr',
        'IBR.md',
      );
      Files.Class.write(expectedPath, 'IBR FOUNDATION');

      expect(AgentIbrFoundation.Class.resolve(workspaceRoot)).toEqual({
        path: expectedPath,
        content: 'IBR FOUNDATION',
      });
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('records absence as null without creating workspace files', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-no-ibr-',
    );
    try {
      expect(AgentIbrFoundation.Class.resolve(workspaceRoot)).toBeNull();
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });
});
