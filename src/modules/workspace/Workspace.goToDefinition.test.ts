// Go-to-definition wiring at the Workspace layer: opening a buffer registers it with the
// per-workspace LanguageClient (didOpen), edits sync (didChange), closing releases (didClose),
// and goToDefinition() jumps — opens the target file as a tab and lands the cursor on the
// declaration, including the import-specifier re-hop the real server exhibits. Runs the REAL
// LanguageClient + LspTransport over the in-process FakeLspProcess (no binary spawned).
//
// invariant: A definition gesture jumps to the declaration (src/modules/lsp/lsp.invariants.md)
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { Workspace } from './Workspace';
import { EditorSourceTextViewProviderFactory } from '../editor/EditorSourceTextViewProviderFactory';
import { LanguageClient } from '../lsp/LanguageClient';
import { LspWorkspaceProvider } from '../lsp/LspWorkspaceProvider';
import { FakeLspProcess, FakeProvider, flush } from '../lsp/lsp.fakes.test';
import type { WorkspaceContributor } from './WorkspaceContributor.interface';
import {
  mkdtempSync as makeTemporaryDirectorySync,
  rmSync as removeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir as temporaryDirectory } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

class $GoToDefinitionLanguageProvider extends LspWorkspaceProvider.$Class {
  constructor(
    workspace: Workspace.Model,
    readonly fakeLanguageServerProcess: FakeLspProcess,
  ) {
    super(workspace, {
      preferredTypeScriptServer: ref('tsgo'),
      fileSizeLimitKb: ref(2048),
    });
  }

  protected override createLanguageClient() {
    return new LanguageClient.Class({
      rootPath: this.rootPath,
      providers: [new FakeProvider()],
      processFactory: () => this.fakeLanguageServerProcess,
    });
  }
}

const GoToDefinitionLanguageProvider = Reactive(
  $GoToDefinitionLanguageProvider,
);

class $GoToDefinitionWorkspace extends Workspace.$Class {
  readonly fakeLanguageServerProcess = new FakeLspProcess();

  constructor() {
    super({
      createSourceTextViews: () =>
        EditorSourceTextViewProviderFactory.Class.create(),
    });
    const contributor: WorkspaceContributor = {
      attachWorkspace: (workspace) =>
        new GoToDefinitionLanguageProvider(
          workspace,
          this.fakeLanguageServerProcess,
        ),
    };
    this.registerContributor(contributor);
  }
}

const GoToDefinitionWorkspace = Reactive($GoToDefinitionWorkspace);

let workspaceDirectory = '';

let declarationPath = '';

let usagePath = '';

const DECLARATION_RANGE = {
  start: { line: 0, character: 16 },
  end: { line: 0, character: 27 },
};

const IMPORT_SPECIFIER_RANGE = {
  start: { line: 0, character: 9 },
  end: { line: 0, character: 20 },
};

beforeEach(() => {
  workspaceDirectory = makeTemporaryDirectorySync(
    join(temporaryDirectory(), 'tui-gotodef-'),
  );
  declarationPath = join(workspaceDirectory, 'foo.ts');
  usagePath = join(workspaceDirectory, 'bar.ts');
  writeFileSync(
    declarationPath,
    'export function greetWidget(name: string): string {\n  return `hello ${name}`;\n}\n',
  );
  writeFileSync(
    usagePath,
    "import { greetWidget } from './foo';\n\nconst message = greetWidget('world');\nexport { message };\n",
  );
});

afterEach(() => {
  removeSync(workspaceDirectory, { recursive: true, force: true });
});

function buildWorkspace(): InstanceType<typeof GoToDefinitionWorkspace> {
  const workspace = new GoToDefinitionWorkspace();
  workspace.open(workspaceDirectory);
  return workspace;
}

describe('Workspace go-to-definition wiring', () => {
  test('opening a supported buffer reaches the server as didOpen; edits sync as didChange; closing sends didClose', async () => {
    const workspace = buildWorkspace();
    workspace.openFileInTab(usagePath);
    await workspace.fakeLanguageServerProcess.waitFor('textDocument/didOpen');
    await flush();

    workspace.editor.insertText('x');
    workspace.syncActiveDocumentWithLanguageProviders();
    await workspace.fakeLanguageServerProcess.waitFor('textDocument/didChange');

    workspace.closeTab(0);
    await workspace.fakeLanguageServerProcess.waitFor('textDocument/didClose');
    workspace.dispose();
    await flush();
  });

  test('goToDefinition opens the declaring file as a tab and lands the cursor on the declaration', async () => {
    const workspace = buildWorkspace();
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/definition',
      () => [
        { uri: pathToFileURL(declarationPath).href, range: DECLARATION_RANGE },
      ],
    );
    workspace.openFileInTab(usagePath);
    await flush();

    const jumped = await workspace.goToDefinition({ line: 2, column: 16 });
    expect(jumped).toBe(true);
    expect(workspace.editor.document.path).toBe(declarationPath);
    expect(workspace.buffers.count).toBe(2);
    expect(workspace.editor.cursor.line.value).toBe(0);
    expect(workspace.editor.cursor.col.value).toBe(16);
    expect(workspace.focus.value).toBe('editor');
    workspace.dispose();
    await flush();
  });

  test("a definition landing on the requesting file's import line re-hops once to the declaration", async () => {
    const workspace = buildWorkspace();
    let definitionRequestCount = 0;
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/definition',
      () => {
        definitionRequestCount += 1;
        // First answer: the import specifier inside bar.ts (what the real server returns while
        // foo.ts is not open). Second answer (from the import): the original declaration.
        if (definitionRequestCount === 1) {
          return [
            {
              uri: pathToFileURL(usagePath).href,
              range: IMPORT_SPECIFIER_RANGE,
            },
          ];
        }
        return [
          {
            uri: pathToFileURL(declarationPath).href,
            range: DECLARATION_RANGE,
          },
        ];
      },
    );
    workspace.openFileInTab(usagePath);
    await flush();

    const jumped = await workspace.goToDefinition({ line: 2, column: 16 });
    expect(jumped).toBe(true);
    expect(definitionRequestCount).toBe(2);
    expect(workspace.editor.document.path).toBe(declarationPath);
    expect(workspace.editor.cursor.line.value).toBe(0);
    expect(workspace.editor.cursor.col.value).toBe(16);
    workspace.dispose();
    await flush();
  });

  test('goToDefinition resolves false without a jump when the server has no answer or the file is unsupported', async () => {
    const workspace = buildWorkspace();
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/definition',
      () => null,
    );
    workspace.openFileInTab(usagePath);
    await flush();
    expect(await workspace.goToDefinition({ line: 2, column: 16 })).toBe(false);
    expect(workspace.editor.document.path).toBe(usagePath);

    // An unsupported file never reaches the server (and never starts one).
    const plainTextPath = join(workspaceDirectory, 'notes.txt');
    writeFileSync(plainTextPath, 'plain text\n');
    workspace.openFileInTab(plainTextPath);
    expect(await workspace.goToDefinition({ line: 0, column: 0 })).toBe(false);
    expect(workspace.editor.document.path).toBe(plainTextPath);
    workspace.dispose();
    await flush();
  });

  test('workspace dispose releases the language-server subprocess', async () => {
    const workspace = buildWorkspace();
    workspace.openFileInTab(usagePath);
    await workspace.fakeLanguageServerProcess.waitFor('textDocument/didOpen');
    workspace.dispose();
    await flush();
    expect(workspace.fakeLanguageServerProcess.killed).toBe(true);
  });
});

// A contribution shaped like a read-only comparison: it OCCUPIES the editor surface and replaces the
// active buffer's text. Nothing here names diff, git, or markdown — the host learns only the answers.
function createReplacingClaim() {
  const claim = {
    identifier: 'test.replacingSurface',
    occupyingEditorSurface: true,
    get activeDocumentIsPresented() {
      return !claim.occupyingEditorSurface;
    },
    release() {
      claim.occupyingEditorSurface = false;
    },
  };
  return claim;
}

// A contribution shaped like a source|preview split: it occupies the surface but EMBEDS the real
// editor, so the active document IS still presented. The old "is a diff showing?" question could not
// tell these two apart, which is the whole reason the guard became a capability.
function createEmbeddingClaim() {
  return {
    identifier: 'test.embeddingSurface',
    occupyingEditorSurface: true,
    activeDocumentIsPresented: true,
    release() {},
  };
}

// invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
describe('language requests follow the editor-surface capability, not a plugin mode', () => {
  test('a surface that replaces the active document suppresses every language request', async () => {
    const workspace = buildWorkspace();
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/definition',
      () => [
        { uri: pathToFileURL(declarationPath).href, range: DECLARATION_RANGE },
      ],
    );
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/hover',
      () => ({
        contents: { kind: 'markdown', value: 'string' },
      }),
    );
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/completion',
      () => ({
        isIncomplete: false,
        items: [{ label: 'greetWidget' }],
      }),
    );
    workspace.openFileInTab(usagePath);
    await flush();
    // Proof the requests DO land while the active buffer owns the surface.
    expect(await workspace.hoverAt({ line: 2, column: 16 })).not.toBeNull();
    expect(
      (
        await workspace.completionAt(
          { line: 2, column: 16 },
          { triggerKind: 'invoked' },
        )
      ).items.length,
    ).toBe(1);

    const claim = createReplacingClaim();
    workspace.editorSurfaces.register(claim);
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(false);

    // Now every request short-circuits — asserted through the REQUEST, not through a mode flag.
    expect(await workspace.hoverAt({ line: 2, column: 16 })).toBeNull();
    const suppressedCompletions = await workspace.completionAt(
      { line: 2, column: 16 },
      { triggerKind: 'invoked' },
    );
    expect(suppressedCompletions.items.length).toBe(0);
    expect(suppressedCompletions.isIncomplete).toBe(false);
    expect(await workspace.goToDefinition({ line: 2, column: 16 })).toBe(false);
    expect(workspace.diagnosticsAt({ line: 2, column: 16 }).length).toBe(0);
    expect(workspace.languageSizeNotice()).toBeNull();
    // The active tab is untouched: the surface hid it, it did not close it.
    expect(workspace.buffers.count).toBe(1);
    workspace.dispose();
    await flush();
  });

  test('a surface that embeds the real editor keeps every language request', async () => {
    const workspace = buildWorkspace();
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/hover',
      () => ({
        contents: { kind: 'markdown', value: 'string' },
      }),
    );
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/completion',
      () => ({
        isIncomplete: false,
        items: [{ label: 'greetWidget' }],
      }),
    );
    workspace.openFileInTab(usagePath);
    await flush();
    workspace.editorSurfaces.register(createEmbeddingClaim());
    expect(workspace.editorSurfaces.occupyingClaim?.identifier).toBe(
      'test.embeddingSurface',
    );
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(true);
    expect(await workspace.hoverAt({ line: 2, column: 16 })).not.toBeNull();
    expect(
      (
        await workspace.completionAt(
          { line: 2, column: 16 },
          { triggerKind: 'invoked' },
        )
      ).items.length,
    ).toBe(1);
    expect(workspace.editor.document.path).toBe(usagePath);
    workspace.dispose();
    await flush();
  });

  test('releasing the surface restores the requests without the host writing plugin state', async () => {
    const workspace = buildWorkspace();
    workspace.fakeLanguageServerProcess.responders.set(
      'textDocument/hover',
      () => ({
        contents: { kind: 'markdown', value: 'string' },
      }),
    );
    workspace.openFileInTab(usagePath);
    await flush();
    const claim = createReplacingClaim();
    workspace.editorSurfaces.register(claim);
    expect(await workspace.hoverAt({ line: 2, column: 16 })).toBeNull();
    // Opening a real file releases the claim through the port; the host never assigns to it.
    workspace.openFileInTab(declarationPath);
    await flush();
    expect(claim.occupyingEditorSurface).toBe(false);
    expect(workspace.editorSurfaces.activeDocumentIsPresented).toBe(true);
    expect(await workspace.hoverAt({ line: 0, column: 18 })).not.toBeNull();
    workspace.dispose();
    await flush();
  });
});
