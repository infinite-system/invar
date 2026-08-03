import { beforeEach, expect, test } from 'bun:test';
import { LanguageServerProcessRegistry } from './LanguageServerProcessRegistry';

beforeEach(() => LanguageServerProcessRegistry.Class.reset());

test('the registry preserves manager order and replaces one manager process in place', () => {
  const firstManager = {};
  const secondManager = {};
  LanguageServerProcessRegistry.Class.register(firstManager, {
    serverName: 'tsgo',
    processId: 41,
  });
  LanguageServerProcessRegistry.Class.register(secondManager, {
    serverName: 'rust-analyzer',
    processId: 42,
  });
  LanguageServerProcessRegistry.Class.register(firstManager, {
    serverName: 'typescript-language-server',
    processId: 43,
  });

  expect(LanguageServerProcessRegistry.Class.entries()).toEqual([
    { serverName: 'typescript-language-server', processId: 43 },
    { serverName: 'rust-analyzer', processId: 42 },
  ]);
  expect(LanguageServerProcessRegistry.Class.entry(firstManager)).toEqual({
    serverName: 'typescript-language-server',
    processId: 43,
  });
});

test('unregister removes only the manager that released its process', () => {
  const retainedManager = {};
  const releasedManager = {};
  LanguageServerProcessRegistry.Class.register(retainedManager, {
    serverName: 'tsgo',
    processId: 51,
  });
  LanguageServerProcessRegistry.Class.register(releasedManager, {
    serverName: 'other-lsp',
    processId: 52,
  });

  LanguageServerProcessRegistry.Class.unregister(releasedManager);

  expect(LanguageServerProcessRegistry.Class.entries()).toEqual([
    { serverName: 'tsgo', processId: 51 },
  ]);
});
