import { expect, test } from 'bun:test';
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

  expect(firstState.decorationsByLine().get(0)?.[0]?.gutter.color).toBe(
    'modified',
  );
  expect(secondState.decorationsByLine().size).toBe(0);
});
