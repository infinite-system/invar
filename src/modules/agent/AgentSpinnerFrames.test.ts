import { expect, test } from 'bun:test';
import { AgentSpinnerFrames } from './AgentSpinnerFrames';

test('spinner frame helpers preserve deterministic formatting', () => {
  expect(AgentSpinnerFrames.Class.glyphFor(0, 'ascii')).toBeTruthy();
  expect(AgentSpinnerFrames.Class.formatElapsed(65)).toBe('1m 05s');
});
