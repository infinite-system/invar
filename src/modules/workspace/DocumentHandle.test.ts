import { expect, test } from 'bun:test';
import { TextDocument } from '../text/TextDocument';
import { DocumentHandle } from './DocumentHandle';

test('a document handle keeps identity while its document instance changes', () => {
  const handle = new DocumentHandle.Class(Symbol('document'), '/one.ts');
  const first = new TextDocument.Class();
  const second = new TextDocument.Class();
  handle.attach(first);
  expect(handle.document).toBe(first);
  handle.detach(first);
  handle.attach(second);
  expect(handle.document).toBe(second);
});
