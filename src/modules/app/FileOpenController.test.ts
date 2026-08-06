import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChannelDialogBridge } from '../channel/ChannelDialogBridge';
import { NativeFileDialog } from '../system/NativeFileDialog';
import type { BoundedListPopupItem } from '../ui/BoundedListPopup';
import { FileOpenController } from './FileOpenController';

const originalChannelDialogBridgeClass = ChannelDialogBridge.Class;
const originalNativeFileDialogClass = NativeFileDialog.Class;

afterEach(() => {
  ChannelDialogBridge.Class = originalChannelDialogBridgeClass;
  NativeFileDialog.Class = originalNativeFileDialogClass;
});

test('in-app picker browses above the root and opens outside files read-only through the drop route', async () => {
  class UnavailableChannelDialog extends ChannelDialogBridge.$Class {
    static override async pickFile() {
      return { available: false, path: null };
    }
  }
  class UnavailableNativeDialog extends NativeFileDialog.$Class {
    static override async pickFile() {
      return { available: false, path: null };
    }
  }
  ChannelDialogBridge.Class = UnavailableChannelDialog;
  NativeFileDialog.Class = UnavailableNativeDialog;

  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'invar-file-open-'));
  const workspaceRoot = join(fixtureDirectory, 'workspace');
  const outsidePath = join(fixtureDirectory, 'outside.txt');
  mkdirSync(workspaceRoot);
  writeFileSync(join(workspaceRoot, 'inside.txt'), 'inside');
  writeFileSync(outsidePath, 'outside');
  let items: readonly BoundedListPopupItem[] = [];
  let selectItem: ((item: BoundedListPopupItem) => void) | null = null;
  let title = '';
  const openedPaths: string[][] = [];
  try {
    const controller = new FileOpenController.Class({
      workspaceSet: { active: { root: workspaceRoot } } as never,
      pathDropController: {
        handlePaths: (paths: readonly string[]) => {
          openedPaths.push([...paths]);
          return true;
        },
      } as never,
      boundedListPopup: {
        openAt: (
          nextItems: readonly BoundedListPopupItem[],
          unusedAnchor: unknown,
          selectionHandler: (item: BoundedListPopupItem) => void,
          options: { title?: string },
        ) => {
          void unusedAnchor;
          items = nextItems;
          selectItem = selectionHandler;
          title = options.title ?? '';
        },
        replaceItems: (
          nextItems: readonly BoundedListPopupItem[],
          unusedSelection: unknown,
          options: { title?: string },
        ) => {
          void unusedSelection;
          items = nextItems;
          title = options.title ?? '';
        },
        close: () => {},
      } as never,
      overlayCoordinator: {
        openExclusiveOverlay: (
          overlayName: string,
          openOverlay: () => void,
        ) => {
          expect(overlayName).toBe('boundedListPopup');
          openOverlay();
        },
      } as never,
      theme: {
        icon: (fileName: string, isDirectory: boolean) => {
          void fileName;
          return isDirectory ? 'D' : 'F';
        },
      } as never,
      popupAnchor: () => ({ column: 20, row: 5 }),
    });

    await controller.open();
    expect(title).toBe(`Open File — ${workspaceRoot}`);
    expect(items.map((item) => item.label)).toEqual(['..', 'inside.txt']);
    const selectionHandler = selectItem as
      ((item: BoundedListPopupItem) => void) | null;
    if (!selectionHandler) throw new Error('The file picker did not open');
    selectionHandler(items[0]!);
    expect(title).toContain('[read-only]');
    const outsideItem = items.find((item) => item.identifier === outsidePath);
    expect(outsideItem?.label).toBe('outside.txt  [read-only]');
    selectionHandler(outsideItem!);
    expect(openedPaths).toEqual([[outsidePath]]);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
