import { expect, test } from 'bun:test';
import { RootView } from './RootView';

test('root view construction remains available through its static class seam', () => {
  expect(RootView.Class.buildRootView).toBeFunction();
});
