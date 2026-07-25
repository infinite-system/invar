import { expect, test } from 'bun:test';
import { TerminalHeader } from './TerminalHeader';

test('parses a shell title into identity and path', () => {
  expect(TerminalHeader.Class.identityAndPath('dev@host:/work/tree')).toEqual({
    identity: 'dev@host',
    path: '/work/tree',
  });
  expect(TerminalHeader.Class.identityAndPath('plain title')).toBeNull();
});

test('parses OSC 7 file URLs without losing escaped path characters', () => {
  expect(
    TerminalHeader.Class.workingDirectory('file://remote/work/my%20project'),
  ).toEqual({ host: 'remote', path: '/work/my project' });
});
