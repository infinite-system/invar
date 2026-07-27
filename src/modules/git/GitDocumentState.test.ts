import { expect, test } from 'bun:test';
import { effect, stop } from 'vue';
import { TextDocument } from '../editor/TextDocument';
import { DocumentHandle } from '../workspace/DocumentHandle';
import { GitDocumentState } from './GitDocumentState';

test('head text belongs to exactly one stable document handle', () => {
  const firstHandle = new DocumentHandle.Class(Symbol('first'), '/first.ts');
  const secondHandle = new DocumentHandle.Class(Symbol('second'), '/second.ts');
  const firstDocument = new TextDocument.Class();
  const secondDocument = new TextDocument.Class();
  firstDocument.loadFromText('first changed', firstHandle.path);
  secondDocument.loadFromText('second changed', secondHandle.path);
  firstHandle.attach(firstDocument);
  secondHandle.attach(secondDocument);
  const firstState = new GitDocumentState.Class(firstHandle);
  const secondState = new GitDocumentState.Class(secondHandle);

  firstState.applyHeadText(firstState.beginHeadRequest(), 'first');
  secondState.applyHeadText(secondState.beginHeadRequest(), 'second changed');

  expect(firstState.decorationsByLine().get(0)?.[0]).toEqual({
    owner: 'versionControl',
    kind: 'modified',
    hoverLabel: 'modified',
  });
  expect(secondState.decorationsByLine().size).toBe(0);
});

test('deletion and modification remain separate marks on one real line', () => {
  const handle = new DocumentHandle.Class(Symbol('document'), '/file.ts');
  const document = new TextDocument.Class();
  document.loadFromText('one\nnew four', handle.path);
  handle.attach(document);
  const state = new GitDocumentState.Class(handle);
  state.applyHeadText(
    state.beginHeadRequest(),
    'one\nremoved one\nremoved two\nold four',
  );

  expect(state.decorationsByLine().get(1)).toEqual([
    {
      owner: 'versionControl',
      kind: 'modified',
      hoverLabel: 'modified',
    },
    {
      owner: 'versionControl',
      kind: 'deleted',
      hoverLabel: '2 lines deleted above',
    },
  ]);
});

test('a refresh retains gutter marks until new HEAD text lands', () => {
  const handle = new DocumentHandle.Class(Symbol('document'), '/file.ts');
  const document = new TextDocument.Class();
  document.loadFromText('changed', handle.path);
  handle.attach(document);
  const state = new GitDocumentState.Class(handle);
  state.applyHeadText(state.beginHeadRequest(), 'original');
  const revisionBeforeRefresh = state.decorationRevision;

  const refreshGeneration = state.beginHeadRequest();

  expect(state.hasHeadText.value).toBe(true);
  expect(state.decorationsByLine().get(0)?.[0]).toMatchObject({
    owner: 'versionControl',
    kind: 'modified',
  });
  state.applyHeadText(refreshGeneration, 'original');
  expect(state.decorationRevision).toBe(revisionBeforeRefresh);
});

test('a changed HEAD invalidates the cached decoration projection', () => {
  const handle = new DocumentHandle.Class(Symbol('document'), '/file.ts');
  const document = new TextDocument.Class();
  document.loadFromText('changed', handle.path);
  handle.attach(document);
  const state = new GitDocumentState.Class(handle);
  state.applyHeadText(state.beginHeadRequest(), 'original');
  let cachedRevision = '';
  let cachedDecorationCount = 0;
  const projectionEffect = effect(() => {
    const revision = state.decorationRevision;
    if (revision === cachedRevision) return;
    cachedRevision = revision;
    cachedDecorationCount = state.decorationsByLine().size;
  });
  expect(cachedDecorationCount).toBe(1);

  state.applyHeadText(state.beginHeadRequest(), 'changed');

  expect(cachedDecorationCount).toBe(0);
  stop(projectionEffect);
});
