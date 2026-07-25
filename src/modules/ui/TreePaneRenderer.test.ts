import { expect, test } from 'bun:test';
import { TreePaneRenderer } from './TreePaneRenderer';

test('tree pane rendering remains available through its static class seam', () => {
  expect(TreePaneRenderer.Class.render).toBeFunction();
});
