import { expect, test } from 'bun:test';
import type {
  RewriteCandidate,
  RewriteProvider,
  RewriteProviderFactory,
  RewriteRequest,
} from './RewriteProvider.interface';
import { ThemePalettes } from '../theme/ThemePalettes';
import { Workspace } from '../workspace/Workspace';
import { InlineRewriteWorkspace } from './InlineRewriteWorkspace';
import { EditorSourceTextViewProviderFactory } from '../editor/EditorSourceTextViewProviderFactory';

class DeferredRewriteProvider implements RewriteProvider {
  readonly available = true;
  readonly signals: AbortSignal[] = [];
  readonly requests: RewriteRequest[] = [];
  readonly resolvers: Array<(candidates: readonly RewriteCandidate[]) => void> =
    [];
  disposed = false;

  rewrite(
    request: RewriteRequest,
    signal: AbortSignal,
  ): Promise<readonly RewriteCandidate[]> {
    this.requests.push(request);
    this.signals.push(signal);
    return new Promise((resolve) => this.resolvers.push(resolve));
  }

  dispose(): void {
    this.disposed = true;
  }
}

function createFixture(enabled: boolean) {
  const workspace = new Workspace.Class({
    createSourceTextViews: () =>
      EditorSourceTextViewProviderFactory.Class.create(),
  });
  const editor = workspace.editor;
  editor.document.loadFromText('const value = calculate()', 'test.ts');
  editor.hasDocument.value = true;
  editor.document.insertInline(0, 25, ';');
  editor.cursor.set(0, 26);
  const providers: DeferredRewriteProvider[] = [];
  const providerFactory: RewriteProviderFactory = {
    available: true,
    create: () => {
      const provider = new DeferredRewriteProvider();
      providers.push(provider);
      return provider;
    },
  };
  workspace.providers.register('inline-rewrite', providerFactory);
  const contribution = new InlineRewriteWorkspace.Class(workspace, {
    enabled,
    createProvider: () =>
      workspace.providers
        .resolve<RewriteProviderFactory>('inline-rewrite')
        ?.create() ?? null,
    eligible: () => true,
    palette: () => ThemePalettes.Class.DARK,
    bindingHint: (action) => action,
  });
  return { contribution, editor, providers, workspace };
}

test('disabled mode creates no controller, provider, or edit tracking', () => {
  const { contribution, editor, providers } = createFixture(false);

  editor.insertText('x');

  expect(contribution.controllerFor(editor)).toBeNull();
  expect(providers).toHaveLength(0);
  contribution.disposed();
  editor.dispose();
});

test('proposal paints beside source and accepts in one undo step', async () => {
  const { contribution, editor, providers } = createFixture(true);
  contribution.request(editor);
  await Promise.resolve();
  const provider = providers[0];
  expect(provider).toBeDefined();
  provider?.resolvers[0]?.([
    {
      region: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 26 },
      },
      replacementText: 'const result = calculate();',
      rationale: 'clearer',
    },
  ]);
  await Promise.resolve();

  const chunks = contribution.lineEndChunks(editor, 0) as unknown as {
    text: string;
  }[];
  expect(chunks.map((chunk) => chunk.text).join('')).toContain(
    'const result = calculate();',
  );
  expect(editor.document.line(0)).toBe('const value = calculate();');

  contribution.accept(editor);
  expect(editor.document.line(0)).toBe('const result = calculate();');
  editor.performUndo();
  expect(editor.document.line(0)).toBe('const value = calculate();');
  contribution.disposed();
  editor.dispose();
});

test('turning off aborts and releases the only provider', async () => {
  const { contribution, editor, providers } = createFixture(true);
  contribution.request(editor);
  await Promise.resolve();

  contribution.setEnabled(false);

  expect(providers[0]?.signals[0]?.aborted).toBe(true);
  expect(providers[0]?.disposed).toBe(true);
  expect(contribution.controllerFor(editor)).toBeNull();
  editor.dispose();
});
