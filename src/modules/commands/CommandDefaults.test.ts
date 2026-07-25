import { expect, test } from 'bun:test';
import { CommandDefaults } from './CommandDefaults';

test('default commands expose the registry population capability', () => {
  expect(typeof CommandDefaults.Class.registerDefaultCommands).toBe('function');
});
