import { expect, test } from 'bun:test';
import { SystemNoteContributions } from './SystemNoteContributions';

test('pane system notes reach registered display surfaces until withdrawal', () => {
  const contributions = new SystemNoteContributions.Class();
  const receivedNotes: string[] = [];
  const dispose = contributions.register((note) => receivedNotes.push(note));

  contributions.publish('terminal command user-executed: printf READY');
  dispose();
  contributions.publish('terminal command user-executed: printf LATE');

  expect(receivedNotes).toEqual([
    'terminal command user-executed: printf READY',
  ]);
});
