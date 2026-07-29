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

// invariant: A Markdown file offers a live source preview split (src/modules/markdown/markdown.invariants.md)
test('a source reveal waits for the preview revision that matches the source', () => {
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    queueSourceRevealForTest(lineIndex: number): void {
      this.pendingSourceRevealLine = lineIndex;
    }

    applySourceRevealForTest(): void {
      this.applyPendingSourceReveal();
    }

    protected override previewViewportWidth(): number {
      return 40;
    }

    protected override previewViewportHeight(): number {
      return 15;
    }
  }

  const revealedLines: number[] = [];
  const previewState = {
    parsedRevision: 6,
    scrollTop: ref(0),
    revealSourceLine: (lineIndex: number) => {
      revealedLines.push(lineIndex);
      return true;
    },
  };
  const splitView = Object.create(
    $ProbedMarkdownSplitView.prototype,
  ) as $ProbedMarkdownSplitView;
  Object.defineProperties(splitView, {
    preview: { value: previewState },
    options: {
      value: {
        source: {
          revision: ref(7),
        },
        sourceScrollTop: () => 0,
      },
    },
    pendingSourceRevealLine: { value: null, writable: true },
  });

  splitView.queueSourceRevealForTest(24);
  splitView.applySourceRevealForTest();
  expect(revealedLines).toEqual([]);

  previewState.parsedRevision = 7;
  splitView.applySourceRevealForTest();
  expect(revealedLines).toEqual([24]);
});

// invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
test('the preview side defaults to left and follows the option', () => {
  const defaultSplitView = Object.create(
    MarkdownSplitView.$Class.prototype,
  ) as InstanceType<typeof MarkdownSplitView.$Class>;
  Object.defineProperty(defaultSplitView, 'options', { value: {} });
  expect(defaultSplitView.previewSide).toBe('left');

  const rightSplitView = Object.create(
    MarkdownSplitView.$Class.prototype,
  ) as InstanceType<typeof MarkdownSplitView.$Class>;
  Object.defineProperty(rightSplitView, 'options', {
    value: { previewSide: 'right' },
  });
  expect(rightSplitView.previewSide).toBe('right');
});

// invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
test('an unresolved authored link stays a reference; unresolved backtick text does not', () => {
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    referenceAtForTest(screenColumn: number, screenRow: number) {
      return this.referenceAt(screenColumn, screenRow);
    }
  }
  const buildSplitView = (
    hit: { key: string; target: string; explicitLink: boolean } | null,
    resolvedPath: string | null,
  ) => {
    const splitView = Object.create(
      $ProbedMarkdownSplitView.prototype,
    ) as $ProbedMarkdownSplitView;
    Object.defineProperties(splitView, {
      previewRenderable: { value: { referenceAtCell: () => hit } },
      options: { value: { resolveReference: () => resolvedPath } },
    });
    return splitView;
  };

  const unresolvedLink = buildSplitView(
    { key: '0:0:4:5', target: 'https://example.com', explicitLink: true },
    null,
  ).referenceAtForTest(0, 0);
  expect(unresolvedLink?.hit.target).toBe('https://example.com');
  expect(unresolvedLink?.path).toBeNull();

  const unresolvedCode = buildSplitView(
    { key: '0:0:4:6', target: 'not a path', explicitLink: false },
    null,
  ).referenceAtForTest(0, 0);
  expect(unresolvedCode).toBeNull();

  const resolvedCode = buildSplitView(
    { key: '0:0:4:6', target: 'src/main.ts', explicitLink: false },
    '/root/src/main.ts',
  ).referenceAtForTest(0, 0);
  expect(resolvedCode?.path).toBe('/root/src/main.ts');
});

test('the pane receiving input leads one-way scroll follow and the setting disables both directions', () => {
  class $ProbedMarkdownSplitView extends MarkdownSplitView.$Class {
    synchronizeScrollFollowerForTest(): boolean {
      return this.synchronizeScrollFollower();
    }

    protected override previewViewportWidth(): number {
      return 40;
    }

    protected override previewViewportHeight(): number {
      return 15;
    }
  }

  let sourceScrollTop = 10;
  let sourceLineAtViewportTop = 10;
  const previewScrollTop = ref(0);
  const previewState = {
    scrollTop: previewScrollTop,
    parsedRevision: 1,
    renderedRowForSourceLine: (sourceLine: number) => sourceLine * 2,
    sourceLineForRenderedRow: (renderedRow: number) =>
      Math.round(renderedRow / 2),
    scrollTo: (renderedRow: number) => {
      previewScrollTop.value = renderedRow;
    },
  };
  const splitView = Object.create(
    $ProbedMarkdownSplitView.prototype,
  ) as $ProbedMarkdownSplitView;
  Object.defineProperties(splitView, {
    preview: { value: previewState },
    focusedPane: { value: ref<'source' | 'preview'>('source') },
    verticalScrollMomentum: { value: ref({ velocity: 0 }) },
    scrollSyncSetting: {
      value: {
        value: ref(true),
      },
    },
    options: {
      value: {
        source: { revision: ref(1) },
        sourceScrollTop: () => sourceScrollTop,
        sourceLineAtViewportTop: () => sourceLineAtViewportTop,
        scrollSourceLineToViewportTop: (lineIndex: number) => {
          sourceScrollTop = lineIndex;
          sourceLineAtViewportTop = lineIndex;
        },
      },
    },
  });

  expect(splitView.synchronizeScrollFollowerForTest()).toBe(true);
  expect(previewScrollTop.value).toBe(20);

  splitView.focusedPane.value = 'preview';
  previewScrollTop.value = 30;
  expect(splitView.synchronizeScrollFollowerForTest()).toBe(true);
  expect(sourceScrollTop).toBe(15);

  (
    splitView as unknown as {
      scrollSyncSetting: { value: { value: boolean } };
    }
  ).scrollSyncSetting.value.value = false;
  splitView.focusedPane.value = 'source';
  sourceScrollTop = 25;
  sourceLineAtViewportTop = 25;
  splitView.synchronizeScrollFollowerForTest();
  expect(previewScrollTop.value).toBe(30);

  splitView.focusedPane.value = 'preview';
  previewScrollTop.value = 40;
  splitView.synchronizeScrollFollowerForTest();
  expect(sourceScrollTop).toBe(25);
});
