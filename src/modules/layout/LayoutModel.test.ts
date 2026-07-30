import { describe, expect, test } from 'bun:test';
import { LayoutModel, type LayoutModelOptions } from './LayoutModel';

const baseOptions: LayoutModelOptions = {
  totalColumns: 120,
  totalRows: 39,
  primaryDockVisible: true,
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
};

function resolve(
  overrides: Partial<LayoutModelOptions> = {},
): ReturnType<typeof LayoutModel.Class.resolve> {
  return LayoutModel.Class.resolve({ ...baseOptions, ...overrides });
}

function primaryDockGroupColumns(geometry: ReturnType<typeof resolve>): number {
  return (
    geometry.activityBar.width +
    geometry.sidebar.width +
    geometry.sidebarSplitter.width
  );
}

function rightDockGroupColumns(geometry: ReturnType<typeof resolve>): number {
  return (
    geometry.rightDockSplitter.width +
    geometry.rightDock.width +
    geometry.rightActivityBar.width
  );
}

function expectTotalTiling(
  geometry: ReturnType<typeof resolve>,
  totalColumns: number,
  totalRows: number,
): void {
  const rectangles = Object.values(geometry).filter(
    (rectangle) => rectangle.width > 0 && rectangle.height > 0,
  );
  const totalArea = rectangles.reduce(
    (area, rectangle) => area + rectangle.width * rectangle.height,
    0,
  );

  expect(totalArea).toBe(totalColumns * totalRows);
  for (const rectangle of rectangles) {
    expect(rectangle.left).toBeGreaterThanOrEqual(0);
    expect(rectangle.top).toBeGreaterThanOrEqual(0);
    expect(rectangle.left + rectangle.width).toBeLessThanOrEqual(totalColumns);
    expect(rectangle.top + rectangle.height).toBeLessThanOrEqual(totalRows);
  }
  for (
    let firstRectangleIndex = 0;
    firstRectangleIndex < rectangles.length;
    firstRectangleIndex++
  ) {
    for (
      let secondRectangleIndex = firstRectangleIndex + 1;
      secondRectangleIndex < rectangles.length;
      secondRectangleIndex++
    ) {
      const firstRectangle = rectangles[firstRectangleIndex]!;
      const secondRectangle = rectangles[secondRectangleIndex]!;
      const overlapColumns = Math.max(
        0,
        Math.min(
          firstRectangle.left + firstRectangle.width,
          secondRectangle.left + secondRectangle.width,
        ) - Math.max(firstRectangle.left, secondRectangle.left),
      );
      const overlapRows = Math.max(
        0,
        Math.min(
          firstRectangle.top + firstRectangle.height,
          secondRectangle.top + secondRectangle.height,
        ) - Math.max(firstRectangle.top, secondRectangle.top),
      );
      expect(overlapColumns * overlapRows).toBe(0);
    }
  }
}

describe('LayoutModel', () => {
  test('offers four named presets instead of axis permutations', () => {
    const presets = LayoutModel.Class.presets();

    expect(presets.map((preset) => preset.label)).toEqual([
      'Default',
      'Full-height docks',
      'Centered panel',
      'Focus',
    ]);
    expect(presets[0]).toEqual({
      identifier: 'default',
      label: 'Default',
      primaryDockVisible: true,
      rightDockVisible: true,
      bottomPanelVisible: true,
      sidebarPosition: 'left',
      panelAlignment: 'center',
      leftDockVerticalSpan: 'full-height',
      rightDockVerticalSpan: 'ends-at-panel',
    });
    expect(
      LayoutModel.Class.matchingPresetIdentifier({
        primaryDockVisible: false,
        rightDockVisible: false,
        bottomPanelVisible: false,
        sidebarPosition: 'left',
        panelAlignment: 'center',
        leftDockVerticalSpan: 'full-height',
        rightDockVerticalSpan: 'ends-at-panel',
      }),
    ).toBe('focus');
  });

  test('the default bottom panel height scales across compact and tall terminals', () => {
    expect(LayoutModel.Class.defaultBottomPanelRows(21)).toBe(9);
    expect(LayoutModel.Class.defaultBottomPanelRows(47)).toBe(21);
  });

  test.each([
    [21, 9],
    [47, 21],
  ] as const)(
    'expanded panel overrides editor and panel rows at %d rows while docks keep their %d-row geometry seed',
    (totalRows, bottomPanelRows) => {
      const regular = resolve({ totalRows, bottomPanelRows });
      const expanded = resolve({
        totalRows,
        bottomPanelRows,
        bottomPanelExpanded: true,
      });

      expect(expanded.editorCenter.height).toBe(0);
      expect(expanded.bottomPanel).toEqual({
        left: regular.bottomPanel.left,
        top: 1,
        width: regular.bottomPanel.width,
        height: totalRows - 1,
      });
      expect(expanded.bottomPanelTabs).toEqual({
        left: regular.bottomPanel.left,
        top: 0,
        width: regular.bottomPanel.width,
        height: 1,
      });
      expect(expanded.bottomPanelSplitter.height).toBe(0);
      expect(expanded.sidebar).toEqual(regular.sidebar);
      expect(expanded.rightDock).toEqual(regular.rightDock);
    },
  );

  test('the unexpanded drag maximum leaves one editor row above the splitter', () => {
    expect(LayoutModel.Class.maximumUnexpandedBottomPanelRows(47)).toBe(45);
    const geometry = resolve({
      totalRows: 47,
      bottomPanelRows: Number.MAX_SAFE_INTEGER,
    });

    expect(geometry.editorCenter.height).toBe(1);
    expect(geometry.bottomPanelSplitter.top).toBe(1);
    expect(geometry.bottomPanelTabs.top).toBe(2);
    expect(geometry.bottomPanel.height).toBe(44);
  });

  test.each([64, 80, 100, 120, 160, 200, 400] as const)(
    'a %d-column row keeps the editor wider than both dock groups at the persisted default widths',
    (totalColumns) => {
      const geometry = resolve({ totalColumns, rightDockColumns: 28 });

      expect(primaryDockGroupColumns(geometry)).toBeLessThan(
        geometry.editorCenter.width,
      );
      expect(rightDockGroupColumns(geometry)).toBeLessThan(
        geometry.editorCenter.width,
      );
      expect(geometry.sidebar.width).toBeLessThanOrEqual(
        Math.floor(totalColumns * 0.3),
      );
      expect(geometry.rightDock.width).toBeLessThanOrEqual(
        Math.floor(totalColumns * 0.3),
      );
      expect(geometry.sidebar.width).toBeGreaterThanOrEqual(1);
      expect(geometry.rightDock.width).toBeGreaterThanOrEqual(1);
    },
  );

  test.each([64, 80, 100, 120, 160, 200, 400] as const)(
    'a %d-column row keeps the editor wider than both dock groups however wide either request is',
    (totalColumns) => {
      const geometry = resolve({
        totalColumns,
        sidebarColumns: Number.MAX_SAFE_INTEGER,
        rightDockColumns: Number.MAX_SAFE_INTEGER,
      });

      expect(primaryDockGroupColumns(geometry)).toBeLessThan(
        geometry.editorCenter.width,
      );
      expect(rightDockGroupColumns(geometry)).toBeLessThan(
        geometry.editorCenter.width,
      );
      expect(geometry.sidebar.width).toBeLessThanOrEqual(
        Math.floor(totalColumns * 0.3),
      );
      expect(geometry.rightDock.width).toBeLessThanOrEqual(
        Math.floor(totalColumns * 0.3),
      );
      expect(geometry.sidebar.width).toBe(
        LayoutModel.Class.maximumPrimaryDockColumns({
          ...baseOptions,
          totalColumns,
          sidebarColumns: Number.MAX_SAFE_INTEGER,
          rightDockColumns: Number.MAX_SAFE_INTEGER,
        }),
      );
      expect(geometry.rightDock.width).toBe(
        LayoutModel.Class.maximumRightDockColumns({
          ...baseOptions,
          totalColumns,
          sidebarColumns: Number.MAX_SAFE_INTEGER,
          rightDockColumns: Number.MAX_SAFE_INTEGER,
        }),
      );
    },
  );

  test('both docks keep requests that fit and give them back after a resize', () => {
    const draggedSidebarColumns = 27;
    const draggedRightDockColumns = 33;

    expect(
      resolve({
        totalColumns: 120,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).sidebar.width,
    ).toBe(draggedSidebarColumns);
    expect(
      resolve({
        totalColumns: 80,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).sidebar.width,
    ).toBe(17);
    expect(
      resolve({
        totalColumns: 120,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).sidebar.width,
    ).toBe(draggedSidebarColumns);
    expect(
      resolve({
        totalColumns: 120,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).rightDock.width,
    ).toBe(draggedRightDockColumns);
    expect(
      resolve({
        totalColumns: 80,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).rightDock.width,
    ).toBe(22);
    expect(
      resolve({
        totalColumns: 120,
        sidebarColumns: draggedSidebarColumns,
        rightDockColumns: draggedRightDockColumns,
      }).rightDock.width,
    ).toBe(draggedRightDockColumns);
  });

  test('the shared dock bound answers over the row each dock group and the editor really share', () => {
    expect(
      LayoutModel.Class.maximumPrimaryDockColumns({
        ...baseOptions,
        totalColumns: 80,
      }),
    ).toBe(22);
    expect(
      LayoutModel.Class.maximumRightDockColumns({
        ...baseOptions,
        totalColumns: 80,
      }),
    ).toBe(20);
    expect(
      LayoutModel.Class.maximumRightDockColumns({
        ...baseOptions,
        totalColumns: 80,
        primaryDockVisible: false,
        activityBarVisible: false,
      }),
    ).toBe(24);
    expect(
      LayoutModel.Class.maximumRightDockColumns({
        ...baseOptions,
        totalColumns: 1,
      }),
    ).toBe(1);
  });

  test('the user default keeps the sidebar full height and the panel under the editor', () => {
    const geometry = resolve();

    expect(geometry.sidebar.top + geometry.sidebar.height).toBe(39);
    expect(geometry.bottomPanel.left).toBe(geometry.editorCenter.left);
    expect(geometry.bottomPanel.width).toBe(geometry.editorCenter.width);
    expect(geometry.rightDock.top + geometry.rightDock.height).toBe(
      geometry.bottomPanelSplitter.top,
    );
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
    ['center', 37, 95],
    ['right', 37, 120],
  ] as const)(
    '%s alignment selects its configured panel range while remainder slots fill released dock columns',
    (panelAlignment, expectedLeft, expectedRight) => {
      const geometry = resolve({
        panelAlignment,
        leftDockVerticalSpan: 'ends-at-panel',
      });
      expect(geometry.bottomPanel.left).toBe(expectedLeft);
      expect(geometry.bottomPanel.left + geometry.bottomPanel.width).toBe(
        expectedRight,
      );
    },
  );

  test.each([
    [80, 20],
    [140, 38],
  ] as const)(
    'all named layout switches tile every cell exactly once at %d columns by %d rows',
    (totalColumns, totalRows) => {
      for (const preset of LayoutModel.Class.presets()) {
        const geometry = resolve({
          totalColumns,
          totalRows,
          primaryDockVisible: preset.primaryDockVisible,
          rightDockVisible: preset.rightDockVisible,
          bottomPanelVisible: preset.bottomPanelVisible,
          sidebarPosition: preset.sidebarPosition,
          panelAlignment: preset.panelAlignment,
          leftDockVerticalSpan: preset.leftDockVerticalSpan,
          rightDockVerticalSpan: preset.rightDockVerticalSpan,
        });
        expectTotalTiling(geometry, totalColumns, totalRows);
      }
    },
  );

  test.each([
    ['center', 37, 95],
    ['right', 37, 95],
  ] as const)(
    '%s alignment keeps the panel out of a full-height right dock',
    (panelAlignment, expectedLeft, expectedRight) => {
      const geometry = resolve({
        panelAlignment,
        rightDockVerticalSpan: 'full-height',
      });
      expect(geometry.bottomPanel.left).toBe(expectedLeft);
      expect(geometry.bottomPanel.left + geometry.bottomPanel.width).toBe(
        expectedRight,
      );
    },
  );

  test('a full-height right dock owns its columns when panel alignment reaches the right edge', () => {
    const geometry = resolve({
      panelAlignment: 'right',
      rightDockVerticalSpan: 'full-height',
    });

    expect(geometry.bottomPanel.left).toBe(37);
    expect(geometry.bottomPanel.left + geometry.bottomPanel.width).toBe(95);
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
    const panelAlignments = ['center', 'right'] as const;

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
              const expectedPanelLeft = geometry.editorCenter.left;
              const alignmentPanelRight =
                panelAlignment === 'right' ? 120 : editorRight;
              const expectedPanelRight =
                rightDockVisible && rightDockVerticalSpan === 'full-height'
                  ? Math.min(
                      alignmentPanelRight,
                      geometry.rightDockSplitter.left,
                    )
                  : alignmentPanelRight;
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
              expect(geometry.sidebar.height).toBe(expectedPrimaryDockBottom);
              expect(geometry.rightDock.height).toBe(expectedRightDockBottom);
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

  test.each([
    [false, 'full-height', 0],
    [false, 'ends-at-panel', 0],
    [true, 'full-height', 39],
    [true, 'ends-at-panel', 20],
  ] as const)(
    'right dock visibility %s with %s resolves the exact bottom edge %d',
    (rightDockVisible, rightDockVerticalSpan, expectedBottom) => {
      const geometry = resolve({
        rightDockVisible,
        rightDockVerticalSpan,
      });

      expect(geometry.rightDock.top + geometry.rightDock.height).toBe(
        expectedBottom,
      );
      expect(geometry.rightDock.width).toBe(rightDockVisible ? 24 : 0);
    },
  );

  test('hiding the primary dock leaves the activity surface available', () => {
    const geometry = resolve({
      primaryDockVisible: false,
      rightDockVisible: false,
      bottomPanelVisible: false,
    });

    expect(geometry.activityBar).toEqual({
      left: 0,
      top: 0,
      width: 4,
      height: 39,
    });
    expect(geometry.sidebar.width).toBe(0);
    expect(geometry.sidebar.height).toBe(0);
    expect(geometry.sidebarSplitter.width).toBe(0);
    expect(geometry.editorCenter.left).toBe(4);
    expect(geometry.editorCenter.width).toBe(116);
  });

  test('the optional right activity bar owns the outer edge without requiring the right dock', () => {
    const geometry = resolve({
      rightDockVisible: false,
      rightActivityBarVisible: true,
      panelAlignment: 'right',
    });

    expect(geometry.rightActivityBar).toEqual({
      left: 116,
      top: 0,
      width: 4,
      height: 39,
    });
    expect(geometry.editorCenter.left + geometry.editorCenter.width).toBe(116);
    expect(geometry.bottomPanel.left + geometry.bottomPanel.width).toBe(116);
  });
});
