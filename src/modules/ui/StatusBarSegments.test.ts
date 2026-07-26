import { expect, test } from 'bun:test';
import { StatusBarSegments } from './StatusBarSegments';

test('status segment contributions preserve registration order', () => {
  const registry = new StatusBarSegments.Class();
  registry.register({ segments: () => ['first'] });
  registry.register({ segments: () => ['second', 'third'] });
  expect(registry.segments({} as never)).toEqual(['first', 'second', 'third']);
});
