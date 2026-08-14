import { test, expect } from 'bun:test';
import { HarnessPrint } from './HarnessPrint.ts';

const limit = HarnessPrint.$Class.DEFAULT_PRINT_LIMIT;

test('an over-limit array truncates loudly with the total', () => {
  const bigArray = Array.from({ length: 100 }, (_, index) => index);
  const bounded = HarnessPrint.Class.boundedClone(bigArray, {}) as unknown[];
  expect(bounded).toHaveLength(limit + 1);
  const marker = bounded[limit] as string;
  expect(marker).toContain('truncated: 100 total');
  expect(marker).toContain('--limit/--offset/--full');
});

test('an under-limit container passes through untouched (silent arm)', () => {
  const smallArray = [1, 2, 3];
  const smallObject = { alpha: 1, beta: 2 };
  expect(HarnessPrint.Class.boundedClone(smallArray, {})).toEqual([1, 2, 3]);
  expect(HarnessPrint.Class.boundedClone(smallObject, {})).toEqual(smallObject);
});

test('--full bypasses truncation entirely', () => {
  const bigArray = Array.from({ length: 100 }, (_, index) => index);
  const bounded = HarnessPrint.Class.boundedClone(bigArray, {
    full: true,
  }) as unknown[];
  expect(bounded).toHaveLength(100);
});

test('limit and offset page the root container', () => {
  const bigArray = Array.from({ length: 100 }, (_, index) => index);
  const page = HarnessPrint.Class.boundedClone(bigArray, {
    limit: 10,
    offset: 20,
  }) as unknown[];
  expect(page[0]).toBe(20);
  expect(page[9]).toBe(29);
  expect(page[10] as string).toContain('from offset 20');
});

test('a many-keyed object truncates with the marker key', () => {
  const bigObject = Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [`task${index}`, index]),
  );
  const bounded = HarnessPrint.Class.boundedClone(bigObject, {}) as Record<
    string,
    unknown
  >;
  expect(Object.keys(bounded)).toHaveLength(limit + 1);
  expect(bounded[HarnessPrint.$Class.TRUNCATION_KEY] as string).toContain(
    'truncated: 60 total',
  );
});

test('nested containers are bounded too, without the root offset', () => {
  const nested = {
    all: Array.from({ length: 80 }, (_, index) => index),
    counts: { active: 80 },
  };
  const bounded = HarnessPrint.Class.boundedClone(nested, {
    offset: 0,
  }) as Record<string, unknown>;
  const nestedAll = bounded['all'] as unknown[];
  expect(nestedAll).toHaveLength(limit + 1);
  expect(nestedAll[limit] as string).toContain('truncated: 80 total');
  expect(bounded['counts']).toEqual({ active: 80 });
});
