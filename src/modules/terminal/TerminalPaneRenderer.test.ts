import { expect, test } from 'bun:test';
import { TerminalPaneRenderer } from './TerminalPaneRenderer';

test('terminal rendering is published through the static capability seam', () => {
  expect(TerminalPaneRenderer.Class.render).toBeFunction();
});
