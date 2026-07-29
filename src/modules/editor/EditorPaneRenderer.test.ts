import { expect, test } from 'bun:test';
import { EditorPaneRenderer } from './EditorPaneRenderer';

test('editor rendering remains available through its static class seam', () => {
  expect(EditorPaneRenderer.Class.render).toBeFunction();
});
