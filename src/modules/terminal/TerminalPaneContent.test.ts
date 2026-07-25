import { expect, test } from 'bun:test';
import { TerminalPaneContent } from './TerminalPaneContent';

test('terminal pane content publishes its plain construction seam', () => {
  expect(TerminalPaneContent.Class).toBe(TerminalPaneContent.$Class);
});
