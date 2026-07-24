import { expect, test } from 'bun:test';
import { MarkdownSplitView } from './MarkdownSplitView';

test('source pane geometry reads the overridable extent seam', () => {
  class CustomMarkdownSplitView extends MarkdownSplitView.$Class {
    protected override paneExtentWidth(): number {
      return 100;
    }

    sourcePaneWidthForTest(): number {
      return this.sourcePaneWidth();
    }
  }

  const splitView = Object.create(
    CustomMarkdownSplitView.prototype,
  ) as CustomMarkdownSplitView;
  Object.defineProperty(splitView, 'options', {
    value: {
      settings: {
        markdownSplitRatio: { value: 0.3 },
      },
    },
  });

  expect(splitView.sourcePaneWidthForTest()).toBe(30);
});
