import { describe, expect, test } from 'bun:test';
import {
  LayoutModel,
  type LayoutModelOptions,
} from './LayoutModel';

function resolve(
  overrides: Partial<LayoutModelOptions> = {},
): ReturnType<typeof LayoutModel.Class.resolve> {
  return LayoutModel.Class.resolve({
    totalColumns: 120,
    totalRows: 39,
    activityBarVisible: true,
    activityBarColumns: 4,
    sidebarColumns: 32,
    sidebarPosition: 'left',
    rightDockVisible: true,
    rightDockColumns: 24,
    bottomPanelVisible: true,
    bottomPanelRows: 18,
    panelAlignment: 'center',
    leftDockVerticalSpan: 'full-height',
    rightDockVerticalSpan: 'ends-at-panel',
    ...overrides,
  });
}

describe('LayoutModel', () => {
  test('the default bottom panel height scales across compact and tall terminals', () => {
    expect(LayoutModel.Class.defaultBottomPanelRows(21)).toBe(9);
    expect(LayoutModel.Class.defaultBottomPanelRows(47)).toBe(21);
  });

  test('the user default keeps the sidebar full height and the panel under the editor', () => {
    const geometry = resolve();

    expect(geometry.sidebar.top + geometry.sidebar.height).toBe(39);
    expect(geometry.bottomPanel.left).toBe(geometry.editorCenter.left);
    expect(geometry.bottomPanel.width).toBe(geometry.editorCenter.width);
    expect(
      geometry.rightDock.top + geometry.rightDock.height,
    ).toBe(geometry.bottomPanelSplitter.top);
  });

  test('moving the sidebar right preserves the editor and secondary dock order', () => {
    const geometry = resolve({ sidebarPosition: 'right' });

    expect(geometry.editorCenter.left).toBe(0);
    expect(geometry.sidebarSplitter.left).toBe(
      geometry.editorCenter.left + geometry.editorCenter.width,
    );
    expect(geometry.rightDockSplitter.left).toBe(
      geometry.activityBar.left + geometry.activityBar.width,
    );
  });

  test.each([
    ['left', 0, 95],
    ['center', 37, 95],
    ['right', 37, 120],
    ['justify', 0, 120],
  ] as const)(
    '%s alignment selects its configured horizontal slot range when docks end at the panel',
    (panelAlignment, expectedLeft, expectedRight) => {
      const geometry = resolve({
        panelAlignment,
        leftDockVerticalSpan: 'ends-at-panel',
      });
      expect(geometry.bottomPanel.left).toBe(expectedLeft);
      expect(
        geometry.bottomPanel.left + geometry.bottomPanel.width,
      ).toBe(expectedRight);
    },
  );

  test('panel alignment owns its horizontal edges independently of dock spans', () => {
    const geometry = resolve({
      panelAlignment: 'justify',
      rightDockVerticalSpan: 'full-height',
    });

    expect(geometry.bottomPanel.left).toBe(0);
    expect(
      geometry.bottomPanel.left + geometry.bottomPanel.width,
    ).toBe(120);
    expect(geometry.sidebar.height).toBe(39);
    expect(geometry.rightDock.height).toBe(39);
  });

  test('an ends-at-panel dock stops at the panel splitter while a hidden panel restores full height', () => {
    const visibleGeometry = resolve();
    const hiddenGeometry = resolve({ bottomPanelVisible: false });

    expect(visibleGeometry.rightDock.height).toBe(
      visibleGeometry.bottomPanelSplitter.top,
    );
    expect(hiddenGeometry.rightDock.height).toBe(39);
    expect(hiddenGeometry.editorCenter.height).toBe(39);
  });

  test('every alignment and span resolves exact slot edges for both sidebar sides and dock visibility states', () => {
    const sidebarPositions = ['left', 'right'] as const;
    const dockVerticalSpans = ['full-height', 'ends-at-panel'] as const;
    const panelAlignments = ['left', 'center', 'right', 'justify'] as const;

    for (const sidebarPosition of sidebarPositions) {
      for (const rightDockVisible of [false, true]) {
        for (const leftDockVerticalSpan of dockVerticalSpans) {
          for (const rightDockVerticalSpan of dockVerticalSpans) {
            for (const panelAlignment of panelAlignments) {
              const geometry = resolve({
                sidebarPosition,
                rightDockVisible,
                leftDockVerticalSpan,
                rightDockVerticalSpan,
                panelAlignment,
              });
              const editorRight =
                geometry.editorCenter.left + geometry.editorCenter.width;
              const expectedPanelLeft =
                panelAlignment === 'left' || panelAlignment === 'justify'
                  ? 0
                  : geometry.editorCenter.left;
              const expectedPanelRight =
                panelAlignment === 'right' || panelAlignment === 'justify'
                  ? 120
                  : editorRight;
              const expectedPrimaryDockBottom =
                leftDockVerticalSpan === 'full-height'
                  ? 39
                  : geometry.bottomPanelSplitter.top;
              const expectedRightDockBottom = !rightDockVisible
                ? 0
                : rightDockVerticalSpan === 'full-height'
                  ? 39
                  : geometry.bottomPanelSplitter.top;

              expect(geometry.bottomPanel.left).toBe(expectedPanelLeft);
              expect(
                geometry.bottomPanel.left + geometry.bottomPanel.width,
              ).toBe(expectedPanelRight);
              expect(geometry.sidebar.height).toBe(
                expectedPrimaryDockBottom,
              );
              expect(geometry.rightDock.height).toBe(
                expectedRightDockBottom,
              );
              if (!rightDockVisible) {
                expect(geometry.rightDock.left).toBe(
                  geometry.rightDockSplitter.left,
                );
                expect(geometry.rightDock.width).toBe(0);
              }
            }
          }
        }
      }
    }
  });
});
