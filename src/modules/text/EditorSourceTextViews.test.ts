import { expect, test } from 'bun:test';
import type {
  SourceTextView,
  SourceTextViewContributions,
} from '../workspace/SourceTextView.interface';
import { EditorSourceTextViews } from './EditorSourceTextViews';

test('one provider owns one contribution registry and uses one supplied view factory', () => {
  const contributions = {} as SourceTextViewContributions;
  const sourceTextView = {} as SourceTextView;
  let createdViewCount = 0;
  const provider = new EditorSourceTextViews.Class(contributions, () => {
    createdViewCount++;
    return sourceTextView;
  });

  expect(provider.contributions).toBe(contributions);
  expect(provider.createView()).toBe(sourceTextView);
  expect(provider.createView()).toBe(sourceTextView);
  expect(createdViewCount).toBe(2);
});
