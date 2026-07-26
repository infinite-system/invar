import { expect, test } from 'bun:test';
import { GitPlugin } from './GitPlugin';

test('plugin publishes workspace and application contribution seams', () => {
  expect(new GitPlugin.Class().primaryDockContentIdentifiers).toEqual(['git']);
  expect(GitPlugin.Class.prototype.attachWorkspace).toBeFunction();
  expect(GitPlugin.Class.prototype.activateApplication).toBeFunction();
});
