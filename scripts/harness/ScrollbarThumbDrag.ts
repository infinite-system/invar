// Shared real-PTY scrollbar drag gesture. A probe derives painted thumb coordinates, sends one press,
// three pressed-pointer moves, and one release, then returns every published scroll position. History
// instruments and gated smokes use this one gesture so their fingerprints cannot drift.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface Rectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ScrollbarThumbDragTarget {
  readonly name: string;
  readonly positionName:
    | 'editorScrollTop'
    | 'editorScrollLeft'
    | 'structureScrollTop'
    | 'workspaceSearchScrollTop'
    | 'markdownPreviewScrollTop'
    | 'markdownPreviewScrollLeft';
  readonly pressColumn: number;
  readonly pressRow: number;
  readonly moveColumns: readonly number[];
  readonly moveRows: readonly number[];
}

export function deriveScrollbarThumbDragTargets(
  snapshot: HarnessSnapshot.Model,
  status: StatusSnapshot,
): readonly ScrollbarThumbDragTarget[] {
  const layoutSlots = status.layoutSlots as
    Record<string, Rectangle> | undefined;
  const rightDock = layoutSlots?.rightDock;
  const firstEditorLine = snapshot.findText('export const symbol000000');
  const firstStructureLine = snapshot.findText('▪ symbol000000');
  if (!firstEditorLine) {
    throw new Error(
      'The drag probe could not derive bar coordinates from the painted fixture.',
    );
  }
  const firstEditorRowText = snapshot.rowText(firstEditorLine.row);
  const editorRightBorderColumn = firstEditorRowText.indexOf(
    '│',
    firstEditorLine.column,
  );
  const editorBottomBorderRow = snapshot
    .textRows()
    .findIndex(
      (rowText, rowIndex) =>
        rowIndex > firstEditorLine.row &&
        rowText.slice(0, editorRightBorderColumn + 1).includes('╰') &&
        rowText[editorRightBorderColumn] === '╯',
    );
  if (editorRightBorderColumn < 0 || editorBottomBorderRow < 0) {
    throw new Error(
      'The drag probe could not derive the editor border from the painted fixture.',
    );
  }
  const editorVerticalColumn = editorRightBorderColumn - 1;
  const editorVerticalStartRow = firstEditorLine.row;
  const editorHorizontalStartColumn = firstEditorLine.column;
  const editorHorizontalRow = editorBottomBorderRow - 1;
  const targets: ScrollbarThumbDragTarget[] = [
    {
      name: 'editorHorizontal',
      positionName: 'editorScrollLeft',
      pressColumn: editorHorizontalStartColumn,
      pressRow: editorHorizontalRow,
      moveColumns: [
        editorHorizontalStartColumn + 5,
        editorHorizontalStartColumn + 10,
        editorHorizontalStartColumn + 15,
      ],
      moveRows: [editorHorizontalRow, editorHorizontalRow, editorHorizontalRow],
    },
    {
      name: 'editorVertical',
      positionName: 'editorScrollTop',
      pressColumn: editorVerticalColumn,
      pressRow: editorVerticalStartRow,
      moveColumns: [
        editorVerticalColumn,
        editorVerticalColumn,
        editorVerticalColumn,
      ],
      moveRows: [
        editorVerticalStartRow + 3,
        editorVerticalStartRow + 6,
        editorVerticalStartRow + 9,
      ],
    },
  ];
  if (
    rightDock &&
    firstStructureLine &&
    Number(status.structureRows) > Number(status.rightDockRows)
  ) {
    const rightDockVerticalColumn = rightDock.left + rightDock.width - 2;
    const rightDockVerticalStartRow = firstStructureLine.row;
    targets.push({
      name: 'rightDockVertical',
      positionName: 'structureScrollTop',
      pressColumn: rightDockVerticalColumn,
      pressRow: rightDockVerticalStartRow,
      moveColumns: [
        rightDockVerticalColumn,
        rightDockVerticalColumn,
        rightDockVerticalColumn,
      ],
      moveRows: [
        rightDockVerticalStartRow + 3,
        rightDockVerticalStartRow + 6,
        rightDockVerticalStartRow + 9,
      ],
    });
  }
  return targets;
}

export function deriveMarkdownPreviewScrollbarThumbDragTargets(
  snapshot: HarnessSnapshot.Model,
  status: StatusSnapshot,
): readonly ScrollbarThumbDragTarget[] {
  const previewBorder = snapshot.findText('╭─Preview');
  if (!previewBorder) {
    throw new Error(
      'The drag probe could not find the Markdown preview border.',
    );
  }
  const openingRowText = snapshot.rowText(previewBorder.row);
  const previewRightBorderColumn = openingRowText.indexOf(
    '╮',
    previewBorder.column,
  );
  const previewBottomBorderRow = snapshot
    .textRows()
    .findIndex(
      (rowText, rowIndex) =>
        rowIndex > previewBorder.row &&
        rowText[previewBorder.column] === '╰' &&
        rowText[previewRightBorderColumn] === '╯',
    );
  if (previewRightBorderColumn < 0 || previewBottomBorderRow < 0) {
    throw new Error(
      'The drag probe could not derive the Markdown preview border.',
    );
  }

  const targets: ScrollbarThumbDragTarget[] = [];
  const horizontalStartColumn = previewBorder.column + 1;
  const horizontalRow = previewBottomBorderRow - 1;
  if (
    Number(status.markdownPreviewContentColumns) >
    Number(status.markdownPreviewViewportColumns)
  ) {
    targets.push({
      name: 'markdownPreviewHorizontal',
      positionName: 'markdownPreviewScrollLeft',
      pressColumn: horizontalStartColumn,
      pressRow: horizontalRow,
      moveColumns: [
        horizontalStartColumn + 5,
        horizontalStartColumn + 10,
        horizontalStartColumn + 15,
      ],
      moveRows: [horizontalRow, horizontalRow, horizontalRow],
    });
  }
  if (
    Number(status.markdownPreviewContentRows) >
    Number(status.markdownPreviewViewportRows)
  ) {
    const verticalColumn = previewRightBorderColumn - 1;
    const verticalStartRow = previewBorder.row + 1;
    targets.push({
      name: 'markdownPreviewVertical',
      positionName: 'markdownPreviewScrollTop',
      pressColumn: verticalColumn,
      pressRow: verticalStartRow,
      moveColumns: [verticalColumn, verticalColumn, verticalColumn],
      moveRows: [
        verticalStartRow + 3,
        verticalStartRow + 6,
        verticalStartRow + 9,
      ],
    });
  }
  return targets;
}

export async function dragScrollbarThumb(
  driver: PtyTestDriver.Model,
  statusPath: string,
  target: ScrollbarThumbDragTarget,
): Promise<readonly number[]> {
  const positions = [
    Number(HarnessSmoke.Class.readStatus(statusPath)[target.positionName]),
  ];
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: target.pressColumn,
    row: target.pressRow,
    button: 'left',
  });
  for (const [moveIndex, moveColumn] of target.moveColumns.entries()) {
    const previousPosition = positions.at(-1) ?? 0;
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column: moveColumn,
      row: target.moveRows[moveIndex] ?? target.pressRow,
      button: 'left',
    });
    try {
      const status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${target.name} pressed-pointer move ${moveIndex + 1} changes ${target.positionName}`,
        (candidate) =>
          Number(candidate[target.positionName]) !== previousPosition,
        1_000,
      );
      positions.push(Number(status[target.positionName]));
    } catch {
      positions.push(
        Number(HarnessSmoke.Class.readStatus(statusPath)[target.positionName]),
      );
    }
  }
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: target.moveColumns.at(-1) ?? target.pressColumn,
    row: target.moveRows.at(-1) ?? target.pressRow,
    button: 'left',
  });
  return positions;
}
