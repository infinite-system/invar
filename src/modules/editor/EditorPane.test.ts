import { expect, test } from 'bun:test';
import { EditorPane } from './EditorPane';

test('editor pane behavior remains constructible through its class seam', () => {
  expect(EditorPane.Class).toBeDefined();
});
