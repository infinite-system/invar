// Item 10a: the Workspace-level editor buffer-tab integration — opening a file adds/focuses a tab
// (never replaces), the flyweight keeps a bounded recent clean set, closing disposes, and a dirty
// tab requires a close confirmation. Uses real Editors over real temp files (end-to-end).
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Workspace } from './Workspace';
import {
  mkdirSync as makeDirectorySync,
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { EditorSourceTextViews } from '../editor/EditorSourceTextViews';

function createWorkspace() {
  return new Workspace.Class({
    createSourceTextViews: () => new EditorSourceTextViews.Class(),
  });
}

let workspaceDirectory = '';

const filePaths: string[] = [];

beforeEach(() => {
  workspaceDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'tui-tabs-'),
  );
  filePaths.length = 0;
  for (let index = 1; index <= 4; index += 1) {
    const path = join(workspaceDirectory, `file${index}.txt`);
    writeFileSync(path, `file ${index} line one\nline two\nline three\n`);
    filePaths.push(path);
  }
});

afterEach(() => {
  removeSync(workspaceDirectory, { recursive: true, force: true });
});

describe('Workspace editor buffer tabs (item 10a)', () => {
  test('opening files ADDS tabs and activates the newest; reopening focuses the existing tab', () => {
    const workspace = createWorkspace();
    workspace.openFileInTab(filePaths[0]!);
    workspace.openFileInTab(filePaths[1]!);
    workspace.openFileInTab(filePaths[2]!);
    expect(workspace.buffers.count).toBe(3);
    expect(workspace.buffers.activeIndex.value).toBe(2);
    expect(workspace.editor.document.path).toBe(filePaths[2]!);

    // Reopening an already-open file focuses its tab — no new tab.
    workspace.openFileInTab(filePaths[0]!);
    expect(workspace.buffers.count).toBe(3);
    expect(workspace.buffers.activeIndex.value).toBe(0);
    expect(workspace.editor.document.path).toBe(filePaths[0]!);
  });

  test('FLYWEIGHT: N clean tabs cost a bounded two live documents', () => {
    const workspace = createWorkspace();
    for (const path of filePaths) workspace.openFileInTab(path);
    expect(workspace.buffers.count).toBe(4);
    expect(workspace.buffers.liveCount).toBe(2);
  });

  test('cycleTab wraps and keeps the live document count bounded', () => {
    const workspace = createWorkspace();
    for (const path of filePaths) workspace.openFileInTab(path); // active = 3
    workspace.cycleTab(1); // wraps to 0
    expect(workspace.buffers.activeIndex.value).toBe(0);
    expect(workspace.editor.document.path).toBe(filePaths[0]!);
    expect(workspace.buffers.liveCount).toBe(2);
    workspace.cycleTab(-1); // wraps back to the last
    expect(workspace.buffers.activeIndex.value).toBe(3);
  });

  test('closing a clean tab disposes it and activates a neighbour; closing all returns to empty', () => {
    const workspace = createWorkspace();
    for (const path of filePaths) workspace.openFileInTab(path);
    workspace.closeTab(workspace.buffers.activeIndex.value);
    expect(workspace.buffers.count).toBe(3);
    workspace.closeTab(0);
    workspace.closeTab(0);
    workspace.closeTab(0);
    expect(workspace.buffers.count).toBe(0);
    // No tabs -> the empty-state editor. A plugin may nominate a dock fallback; bare host stays here.
    expect(workspace.editor.hasDocument.value).toBe(false);
    expect(workspace.focus.value).toBe('editor');
  });

  test('a DIRTY tab requires a close confirmation; confirm closes, cancel keeps it', () => {
    const workspace = createWorkspace();
    workspace.openFileInTab(filePaths[0]!);
    workspace.editor.insertText('x'); // now dirty
    expect(workspace.editor.dirty).toBe(true);

    workspace.closeActiveTab();
    // Not closed yet — a confirmation is pending.
    expect(workspace.buffers.count).toBe(1);
    expect(workspace.pendingCloseTabIndex.value).toBe(0);

    workspace.cancelCloseTab();
    expect(workspace.pendingCloseTabIndex.value).toBe(-1);
    expect(workspace.buffers.count).toBe(1); // kept

    workspace.closeActiveTab();
    workspace.confirmCloseTab();
    expect(workspace.buffers.count).toBe(0);
  });

  test('a DIRTY background tab stays live (its unsaved edits survive dehydration)', () => {
    const workspace = createWorkspace();
    workspace.openFileInTab(filePaths[0]!);
    workspace.editor.insertText('edit'); // tab 0 is dirty
    workspace.openFileInTab(filePaths[1]!); // switch away — tab 0 must NOT dehydrate
    expect(workspace.buffers.liveCount).toBe(2); // active (1) + dirty background (0)
  });

  // invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
  test('opening a real file releases a contributed surface; the visible editor becomes the active tab', () => {
    const workspace = createWorkspace();
    // A contribution shaped like a read-only comparison: it occupies the surface and replaces the
    // active buffer's text. The host never learns what it is.
    const surface = {
      identifier: 'test.comparison',
      occupyingEditorSurface: true,
      get activeDocumentIsPresented() {
        return !surface.occupyingEditorSurface;
      },
      release() {
        surface.occupyingEditorSurface = false;
      },
    };
    workspace.editorSurfaces.register(surface);
    // While it occupies the surface the active document is NOT the subject, so the visible editor is
    // the document-less one — which is what every language guard now keys off.
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(false);
    expect(workspace.editor.hasDocument.value).toBe(false);
    workspace.openFileInTab(filePaths[0]!);
    expect(surface.occupyingEditorSurface).toBe(false);
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(true);
    expect(workspace.editor.document.path).toBe(filePaths[0]!);
  });

  // invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
  test('language requests read the document on the handle, never a view', () => {
    const workspace = createWorkspace();
    workspace.root = workspaceDirectory;
    workspace.openFileInTab(filePaths[0]!);

    // The subject of every language request is the instance the stable handle holds.
    const handleDocument = workspace.activeDocumentHandle?.document;
    expect(handleDocument).toBeDefined();
    expect(handleDocument?.path).toBe(filePaths[0]!);
    expect(workspace.activeFileIsImage).toBe(false);
    expect(workspace.languageProviderNotice()).toBe(
      'Language features unavailable — no provider installed',
    );
    // Reference resolution reads the same document, not the view showing it.
    expect(workspace.resolveFileReference('file2.txt')).toBe(filePaths[1]!);

    // Switching away and back replaces the VIEW; the handle keeps identifying the document.
    workspace.openFileInTab(filePaths[1]!);
    workspace.activateTab(0);
    expect(workspace.activeDocumentHandle?.path).toBe(filePaths[0]!);
    expect(workspace.activeDocumentHandle?.document?.path).toBe(filePaths[0]!);
  });

  // invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
  test('a workspace with NO view provider is legal until a view is actually needed', () => {
    // The provider resolves lazily, which is what lets a contributor-only workspace exist.
    const workspace = new Workspace.Class();
    workspace.root = workspaceDirectory;

    expect(workspace.buffers.count).toBe(0);
    expect(workspace.tabDetail).toBe('');
    // Asking for a view says what is missing instead of failing quietly.
    expect(() => workspace.editor).toThrow(/source-text view provider/);
  });

  // invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
  test('one creator, one disposer: every view a workspace made is released with its buffer', () => {
    const disposedViewCount = { value: 0 };
    const workspace = new Workspace.Class({
      createSourceTextViews: () => {
        const provider = new EditorSourceTextViews.Class();
        return {
          contributions: provider.contributions,
          createView: () => {
            const view = provider.createView();
            const dispose = view.dispose.bind(view);
            view.dispose = () => {
              disposedViewCount.value += 1;
              dispose();
            };
            return view;
          },
        };
      },
    });
    for (const path of filePaths) workspace.openFileInTab(path);
    // Four tabs, two live: the flyweight already released the two views it evicted.
    expect(workspace.buffers.liveCount).toBe(2);
    expect(disposedViewCount.value).toBe(2);

    // The four buffer views are the only views requested without an editor contributor.
    workspace.dispose();
    expect(disposedViewCount.value).toBe(4);
  });

  // invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
  test('one releaser frees every view the provider made, and the documents stay', () => {
    const disposedViewCount = { value: 0 };
    let builtViewCount = 0;
    const workspace = new Workspace.Class({
      createSourceTextViews: () => {
        const provider = new EditorSourceTextViews.Class();
        return {
          contributions: provider.contributions,
          createView: () => {
            builtViewCount += 1;
            const view = provider.createView();
            const dispose = view.dispose.bind(view);
            view.dispose = () => {
              disposedViewCount.value += 1;
              dispose();
            };
            return view;
          },
        };
      },
    });
    workspace.openFileInTab(filePaths[0]!);
    workspace.openFileInTab(filePaths[1]!);
    // Two buffer views; no editor contributor asks for an empty view during capture.
    expect(builtViewCount).toBe(2);
    expect(disposedViewCount.value).toBe(0);

    workspace.releaseSourceTextViews();

    // Every live view is gone — the withdrawn pane leaves none behind.
    expect(disposedViewCount.value).toBe(2);
    // The DOCUMENTS stay: the tabs are still open and the handle still names the file.
    expect(workspace.buffers.count).toBe(2);
    expect(workspace.activeDocumentHandle?.path).toBe(filePaths[1]!);
    // The next read builds a fresh view through the provider, so the pane can come back.
    expect(workspace.editor).toBeDefined();
    expect(builtViewCount).toBe(3);
    // And the count of views bound to OPEN buffers is zero — the load-invariant observable a drive
    // reads to see that a release really released.
    expect(workspace.sourceTextViewsForOpenBuffers).toBe(0);

    // The release is REVERSIBLE: activating a released tab rebuilds its view and shows its text
    // again. Without this, an uninstalled editor could never be reinstalled — the entry would keep
    // pointing at a disposed buffer and the tab could never be shown.
    workspace.buffers.activate(0);
    expect(workspace.sourceTextViewsForOpenBuffers).toBe(1);
    expect(workspace.editor.document.path).toBe(filePaths[0]!);
    expect(workspace.editor.hasDocument.value).toBe(true);
  });

  // invariant: One provider creates every workspace buffer view (src/modules/workspace/workspace.invariants.md)
  test('a release keeps the view of a buffer holding unsaved edits', () => {
    const workspace = new Workspace.Class({
      createSourceTextViews: () => new EditorSourceTextViews.Class(),
    });
    workspace.openFileInTab(filePaths[0]!);
    workspace.editor.insertText('unsaved');
    expect(workspace.editor.dirty).toBe(true);

    workspace.releaseSourceTextViews();

    // Unsaved edits live in the view and nowhere else, so releasing that view would destroy them.
    expect(workspace.sourceTextViewsForOpenBuffers).toBe(1);
    expect(workspace.editor.dirty).toBe(true);
    expect(workspace.editor.document.text).toContain('unsaved');
  });

  // invariant: A file reference opens from rendered Markdown (src/modules/markdown/markdown.invariants.md)
  test('rendered file references resolve only to real files inside the workspace', () => {
    const sourceDirectory = join(workspaceDirectory, 'guides');
    const sourcePath = join(sourceDirectory, 'guide.md');
    const sourceRelativeTarget = join(sourceDirectory, 'details.md');
    const rootRelativeTarget = join(
      workspaceDirectory,
      'project.invariants.md',
    );
    const taskFolderName = '291-task-links-survive-state-moves';
    const currentTaskDirectory = join(
      workspaceDirectory,
      '.invar',
      'tasks',
      'completed',
      taskFolderName,
    );
    const currentTaskTarget = join(
      currentTaskDirectory,
      `task-${taskFolderName}.md`,
    );
    makeDirectorySync(sourceDirectory);
    makeDirectorySync(currentTaskDirectory, { recursive: true });
    writeFileSync(sourcePath, '# Guide\n');
    writeFileSync(sourceRelativeTarget, '# Details\n');
    writeFileSync(rootRelativeTarget, '# Invariants\n');
    writeFileSync(currentTaskTarget, '# Task\n');

    const workspace = createWorkspace();
    workspace.root = workspaceDirectory;
    workspace.openFileInTab(sourcePath);

    expect(workspace.resolveFileReference('details.md')).toBe(
      sourceRelativeTarget,
    );
    expect(workspace.resolveFileReference('project.invariants.md#record')).toBe(
      rootRelativeTarget,
    );
    expect(
      workspace.resolveFileReference('https://example.com/file.md'),
    ).toBeNull();
    expect(workspace.resolveFileReference('../outside.md')).toBeNull();
    expect(workspace.resolveFileReference('missing.md')).toBeNull();
    expect(
      workspace.resolveFileReference(
        `.invar/tasks/active/${taskFolderName}/task-${taskFolderName}.md`,
      ),
    ).toBe(currentTaskTarget);
    expect(
      workspace.resolveFileReference(
        '.invar/tasks/active/292-dead-task-state-link/task-292-dead-task-state-link.md',
      ),
    ).toBeNull();
    expect(
      workspace.resolveFileReference(`src/task-${taskFolderName}.md`),
    ).toBeNull();

    expect(workspace.openFileReference('project.invariants.md')).toBe(true);
    expect(workspace.editor.document.path).toBe(rootRelativeTarget);
  });

  test('a relative link walks UP out of the document directory but never out of the workspace', () => {
    // The authored form in this repository's task records: a document nested four levels deep
    // links back to a root file with `../../../../`. Confining the document-relative candidate to
    // the document's OWN directory made every such link unresolvable.
    const deepDirectory = join(
      workspaceDirectory,
      '.invar',
      'tasks',
      'completed',
      '347-deep-task-folder',
    );
    const deepDocumentPath = join(deepDirectory, 'report-347-deep.md');
    const rootTarget = join(workspaceDirectory, 'project.invariants.md');
    const siblingTaskDirectory = join(
      workspaceDirectory,
      '.invar',
      'tasks',
      'completed',
      '282-sibling-task-folder',
    );
    const siblingTarget = join(siblingTaskDirectory, 'probe-282.ts');
    const encodedNameTarget = join(workspaceDirectory, 'name with spaces.md');
    makeDirectorySync(deepDirectory, { recursive: true });
    makeDirectorySync(siblingTaskDirectory, { recursive: true });
    writeFileSync(deepDocumentPath, '# Report\n');
    writeFileSync(rootTarget, '# Invariants\n');
    writeFileSync(siblingTarget, 'export const probe = true;\n');
    writeFileSync(encodedNameTarget, '# Spaces\n');

    const workspace = createWorkspace();
    workspace.root = workspaceDirectory;
    workspace.openFileInTab(deepDocumentPath);

    expect(
      workspace.resolveFileReference('../../../../project.invariants.md'),
    ).toBe(rootTarget);
    expect(
      workspace.resolveFileReference(
        '../../../../project.invariants.md#a-record-name',
      ),
    ).toBe(rootTarget);
    expect(
      workspace.resolveFileReference('../282-sibling-task-folder/probe-282.ts'),
    ).toBe(siblingTarget);
    expect(
      workspace.resolveFileReference('../../../../name%20with%20spaces.md'),
    ).toBe(encodedNameTarget);
    // The workspace root stays the ONE boundary: a walk past it resolves to nothing.
    expect(
      workspace.resolveFileReference('../../../../../outside-the-workspace.md'),
    ).toBeNull();
    expect(
      workspace.resolveFileReference('../../../../missing-in-root.md'),
    ).toBeNull();
  });
});
