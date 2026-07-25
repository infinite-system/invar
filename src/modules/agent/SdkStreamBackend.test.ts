import { expect, test } from 'bun:test';
import { SdkStreamBackend } from './SdkStreamBackend';

test('a disposed SDK backend ignores later sends', () => {
  const backend = new SdkStreamBackend.Class({});
  const events: unknown[] = [];
  backend.onEvent((event) => events.push(event));

  backend.dispose();
  backend.send('ignored');

  expect(events).toEqual([]);
});
