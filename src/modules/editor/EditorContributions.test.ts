import { expect, test } from 'bun:test';
import { fg } from '@opentui/core';
import { Editor } from './Editor';
import {
  EditorContributions,
  type EditorContribution,
} from './EditorContributions';

test('registration attaches, projects, and detaches live editors', () => {
  const registry = new EditorContributions.Class();
  const editor = new Editor.Class();
  const events: string[] = [];
  const contribution: EditorContribution = {
    attached: () => events.push('attached'),
    detached: () => events.push('detached'),
    recordTyping: () => events.push('typing'),
    recordOrdinaryEdit: () => events.push('ordinary'),
    lineEndChunks: () => [fg('#ffffff')(' proposal')],
    title: () => ({ text: ' title ', color: '#ffffff' }),
  };
  const detachEditor = registry.attach(editor);
  const unregister = registry.register(contribution);

  registry.recordTyping(editor, 0, 0);
  registry.recordOrdinaryEdit(editor);

  expect(registry.contributionCount).toBe(1);
  expect(events).toEqual(['attached', 'typing', 'ordinary']);
  expect(
    (registry.lineEndChunks(editor, 0)[0] as unknown as { text: string }).text,
  ).toBe(' proposal');
  expect(registry.title(editor)?.text).toBe(' title ');

  unregister();
  detachEditor();
  expect(events).toEqual(['attached', 'typing', 'ordinary', 'detached']);
  expect(registry.contributionCount).toBe(0);
});
