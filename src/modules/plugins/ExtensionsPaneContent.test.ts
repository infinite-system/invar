import { expect, test } from 'bun:test';
import { ExtensionsPaneContent } from './ExtensionsPaneContent';

test('extensions placeholder implements the shared pane surface', () => {
  expect(ExtensionsPaneContent.Class.prototype.render).toBeFunction();
  expect(ExtensionsPaneContent.Class.prototype.handleKey).toBeFunction();
});
