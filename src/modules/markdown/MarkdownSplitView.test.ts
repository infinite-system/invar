import { expect, test } from 'bun:test';
import { ref } from 'vue';
import { ThemeIcons } from '../theme/ThemeIcons';
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
  Object.defineProperty(splitView, 'splitRatioSetting', {
    value: {
      value: ref(0.3),
      save() {},
      dispose() {},
    },
  });

  expect(splitView.sourcePaneWidthForTest()).toBe(30);
});

test('unchanged frames do not materialize the whole preview document', () => {
  let wholePreviewMaterializationCount = 0;
  class $MeasuredMarkdownSplitView extends MarkdownSplitView.$Class {
    protected override previewViewportWidth(): number {
      return 40;
    }

    synchronizeForTest(): boolean {
      return this.synchronizeRenderedPreviewDocument();
    }
  }

  const splitView = Object.create(
    $MeasuredMarkdownSplitView.prototype,
  ) as $MeasuredMarkdownSplitView;
  const previewState = {
    parsedRevision: 7,
    allRows: () => {
      wholePreviewMaterializationCount++;
      return [];
    },
    textForRow: () => '',
  };
  const tableBorders = ThemeIcons.Class.tableBordersFor('unicode');
  Object.defineProperties(splitView, {
    preview: { value: previewState },
    theme: { value: { tableBorders } },
    renderedPreviewText: { value: '', writable: true },
    renderedPreviewRevision: { value: 7, writable: true },
    renderedPreviewWidth: { value: 40, writable: true },
    renderedPreviewBorderSignature: {
      value: Object.values(tableBorders).join(''),
      writable: true,
    },
    previewTextBuffer: {
      value: {
        replaceText() {},
      },
    },
    options: {
      value: {
        findBar: {
          engineFor: () => null,
        },
      },
    },
    selectionRevision: { value: ref(0) },
  });

  expect(splitView.synchronizeForTest()).toBe(false);
  expect(wholePreviewMaterializationCount).toBe(0);

  previewState.parsedRevision = 8;
  splitView.synchronizeForTest();
  expect(wholePreviewMaterializationCount).toBe(1);
});
