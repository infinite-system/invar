import { expect, test } from 'bun:test';
import { inspectNamespaceClassExtensions } from './check-namespace-class-extensions';

test('rejects selected namespace classes as inheritance roots', () => {
  const violations = inspectNamespaceClassExtensions({
    fileName: 'src/example.ts',
    sourceText: [
      'class $Direct extends Example.Class {}',
      "const Expression = class extends Example['Class'] {};",
    ].join('\n'),
  });

  expect(violations).toEqual([
    {
      fileName: 'src/example.ts',
      line: 1,
      column: 23,
      className: '$Direct',
    },
    {
      fileName: 'src/example.ts',
      line: 2,
      column: 34,
      className: '<anonymous>',
    },
  ]);
});

test('accepts raw classes and ignores text and class names', () => {
  const violations = inspectNamespaceClassExtensions({
    fileName: 'scripts/example.ts',
    sourceText: [
      'class Class {}',
      'class $Safe extends Example.$Class {}',
      '// class $Comment extends Example.Class {}',
      "const description = 'class $String extends Example.Class {}';",
    ].join('\n'),
  });

  expect(violations).toEqual([]);
});

test('ignores interface heritage types', () => {
  const violations = inspectNamespaceClassExtensions({
    fileName: 'src/example.ts',
    sourceText: 'interface ExampleInterface extends Example.Class {}',
  });

  expect(violations).toEqual([]);
});
