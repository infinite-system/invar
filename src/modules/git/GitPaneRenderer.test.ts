import { expect, test } from 'bun:test';
import { GitPaneRenderer } from './GitPaneRenderer';

test('git pane rendering remains available through its static class seam', () => {
  expect(GitPaneRenderer.Class.render).toBeFunction();
});
