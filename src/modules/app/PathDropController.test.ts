import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BoundedListPopupItem } from '../ui/BoundedListPopup';
import { PathDropController } from './PathDropController';

test('existing paths parse shell quote and escape forms as one drop', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-path-drop-parse-'));
  try {
    const spacedPath = join(fixtureRoot, 'one file.txt');
    const secondPath = join(fixtureRoot, 'second.txt');
    writeFileSync(spacedPath, 'one');
    writeFileSync(secondPath, 'two');

    expect(
      PathDropController.Class.existingPaths(
        `'${spacedPath}' "${secondPath}"`,
        fixtureRoot,
      ),
    ).toEqual([spacedPath, secondPath]);
    expect(
      PathDropController.Class.existingPaths(
        `${spacedPath.replace(' ', '\\ ')} ${secondPath}`,
        fixtureRoot,
      ),
    ).toEqual([spacedPath, secondPath]);
    expect(
      PathDropController.Class.existingPaths(
        `'${spacedPath}' ${join(fixtureRoot, 'missing.txt')}`,
        fixtureRoot,
      ),
    ).toEqual([]);
    expect(
      PathDropController.Class.existingPaths(`'${spacedPath}`, fixtureRoot),
    ).toEqual([]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('one controller routes plugin files, text files, external files, and folders', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-path-drop-root-'));
  const externalRoot = mkdtempSync(join(tmpdir(), 'invar-path-drop-external-'));
  try {
    const textPath = join(fixtureRoot, 'notes.txt');
    const pluginPath = join(fixtureRoot, 'picture.png');
    const directoryPath = join(fixtureRoot, 'folder');
    const externalPath = join(externalRoot, 'outside.txt');
    writeFileSync(textPath, 'notes');
    writeFileSync(pluginPath, 'image');
    mkdirSync(directoryPath);
    writeFileSync(externalPath, 'outside');

    const openedFiles: Array<{ path: string; readOnly: boolean }> = [];
    const openedWorkspaces: string[] = [];
    const pluginPaths: string[] = [];
    let offeredItems: readonly BoundedListPopupItem[] = [];
    let activateOfferedItem: ((item: BoundedListPopupItem) => void) | null =
      null;
    const controller = new PathDropController.Class({
      workspaceSet: {
        active: {
          root: fixtureRoot,
          openFileInTab: (
            path: string,
            options: { readonly readOnly?: boolean },
          ) =>
            openedFiles.push({
              path,
              readOnly: options.readOnly === true,
            }),
          focusEditor: () => {},
        },
        open: (path: string) => {
          openedWorkspaces.push(path);
          return 0;
        },
      } as never,
      droppedPathOpeners: {
        openDroppedPath: (request: { path: string }) => {
          if (!request.path.endsWith('.png')) return false;
          pluginPaths.push(request.path);
          return true;
        },
      } as never,
      boundedListPopup: {
        openAt: (
          items: readonly BoundedListPopupItem[],
          unusedAnchor: unknown,
          selectionHandler: (item: BoundedListPopupItem) => void,
        ) => {
          void unusedAnchor;
          offeredItems = items;
          activateOfferedItem = selectionHandler;
        },
      } as never,
      overlayCoordinator: {
        openExclusiveOverlay: (
          overlayName: string,
          openOverlay: () => void,
        ) => {
          void overlayName;
          openOverlay();
        },
      } as never,
      pasteIntoFocusedPane: () => false,
      focusEditor: () => {},
      screenSize: () => ({ columns: 120, rows: 40 }),
    });

    expect(
      controller.handlePaste(
        `${textPath} ${pluginPath} ${externalPath} ${directoryPath}`,
      ),
    ).toBe(true);
    expect(pluginPaths).toEqual([pluginPath]);
    expect(openedFiles).toEqual([
      { path: textPath, readOnly: false },
      { path: externalPath, readOnly: true },
    ]);
    expect(offeredItems.map((item) => item.identifier)).toEqual([
      directoryPath,
    ]);
    const offeredItemHandler = activateOfferedItem as
      ((item: BoundedListPopupItem) => void) | null;
    if (!offeredItemHandler) throw new Error('The folder offer did not open');
    offeredItemHandler(offeredItems[0]!);
    expect(openedWorkspaces).toEqual([directoryPath]);
    expect(controller.handlePaste('typed words')).toBe(false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('a focused path-paste pane receives quoted paths before any file opens', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-path-drop-focus-'));
  try {
    const firstPath = join(fixtureRoot, 'first file.txt');
    const secondPath = join(fixtureRoot, "second'file.txt");
    writeFileSync(firstPath, 'first');
    writeFileSync(secondPath, 'second');
    const pastedTexts: string[] = [];
    const openedFiles: string[] = [];
    const controller = new PathDropController.Class({
      workspaceSet: {
        active: {
          root: fixtureRoot,
          openFileInTab: (path: string) => openedFiles.push(path),
        },
      } as never,
      droppedPathOpeners: {
        openDroppedPath: () => false,
      } as never,
      boundedListPopup: {} as never,
      overlayCoordinator: {} as never,
      pasteIntoFocusedPane: (text) => {
        pastedTexts.push(text);
        return true;
      },
      focusEditor: () => {},
      screenSize: () => ({ columns: 120, rows: 40 }),
    });

    expect(controller.handlePaths([firstPath, secondPath])).toBe(true);
    expect(pastedTexts).toEqual([
      `'${firstPath}' '${secondPath.replaceAll("'", "'\"'\"'")}'`,
    ]);
    expect(openedFiles).toEqual([]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
