import { expect, test } from 'bun:test';
import { GitPaneContent } from './GitPaneContent';

test('source control pane implements the shared pane surface', () => {
  expect(GitPaneContent.Class.prototype.render).toBeFunction();
  expect(GitPaneContent.Class.prototype.handleKey).toBeFunction();
});
