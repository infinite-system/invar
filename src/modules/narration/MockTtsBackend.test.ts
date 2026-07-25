import { expect, test } from 'bun:test';
import { MockTtsBackend } from './MockTtsBackend';

test('speak records trimmed non-empty utterances in order', () => {
  const backend = new MockTtsBackend.Class();

  backend.speak('  first utterance  ');
  backend.speak('   ');
  backend.speak('second utterance');

  expect(backend.spoken).toEqual(['first utterance', 'second utterance']);
});

test('stop and dispose expose the hermetic backend lifecycle', () => {
  const backend = new MockTtsBackend.Class();

  backend.stop();
  backend.stop();
  backend.dispose();

  expect(backend.stopCount).toBe(2);
  expect(backend.disposed).toBe(true);
});
