import { describe, expect, test } from 'bun:test';
import {
  inspectStaticGetterNaming,
  type StaticGetterNamingViolation,
} from './check-static-getter-naming';

function messages(sourceText: string): string[] {
  return inspectStaticGetterNaming({
    fileName: 'src/modules/example/Example.ts',
    sourceText,
  }).map((violation: StaticGetterNamingViolation) => violation.message);
}

describe('static getter naming', () => {
  test('accepts uppercase literal compositions and lowercase derivations', () => {
    expect(
      messages(`
        class Example {
          static get COUNT() { return 2; }
          static get LABELS() { return Object.freeze(['one', 'two'] as const); }
          static get CONFIG() { return { enabled: true, offsets: [-1, 2] }; }
          static get visibleCount() { return this.COUNT; }
          static get createdValue() { return createValue(); }
          get instanceKnob() { return 2; }
        }
      `),
    ).toEqual([]);
  });

  test('rejects lowercase literal-valued static getters', () => {
    expect(
      messages('class Example { static get count() { return 2; } }'),
    ).toEqual([
      "literal-valued static getter 'count' must use SCREAMING_SNAKE_CASE",
    ]);
  });

  test('rejects uppercase derived static getters', () => {
    expect(
      messages(`
        class Example {
          static get COUNT() { return this.baseCount; }
          static get LABELS() { return makeLabels(); }
        }
      `),
    ).toEqual([
      "derived static getter 'COUNT' must not use SCREAMING_SNAKE_CASE",
      "derived static getter 'LABELS' must not use SCREAMING_SNAKE_CASE",
    ]);
  });

  test('always rejects cached uppercase names', () => {
    expect(
      messages(`
        class Example {
          static get $VALUES() { return new Set(['one']); }
        }
      `),
    ).toEqual([
      "cached static getter '$VALUES' must not use SCREAMING_SNAKE_CASE",
    ]);
  });

  test('accepts cached lowercase names for derived constructions', () => {
    expect(
      messages(`
        class Example {
          static get $values() { return new Set(['one']); }
        }
      `),
    ).toEqual([]);
  });

  test('rejects literal-valued cached lowercase names', () => {
    expect(
      messages(`
        class Example {
          static get $values() { return ['one']; }
        }
      `),
    ).toEqual([
      "literal-valued cached static getter '$values' must drop '$' and use " +
        'SCREAMING_SNAKE_CASE',
    ]);
  });

  test('requires a single return statement for literal classification', () => {
    expect(
      messages(`
        class Example {
          static get value() {
            const value = 2;
            return value;
          }
        }
      `),
    ).toEqual([]);
  });
});
