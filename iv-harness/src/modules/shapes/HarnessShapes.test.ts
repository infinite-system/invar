import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessShapes } from './HarnessShapes.ts';

const rootDirectory = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

test('the committed catalog matches a fresh regeneration (no drift)', () => {
  const regenerated = HarnessShapes.Class.generate(rootDirectory);
  const committed = JSON.parse(
    readFileSync(
      join(rootDirectory, HarnessShapes.$Class.SHAPES_FILE_RELATIVE_PATH),
      'utf8',
    ),
  );
  // Structural comparison: prettier may reformat the committed file;
  // drift in CONTENT is what this guards.
  expect(regenerated).toEqual(committed);
});

test('describe answers a bound graph path and a raw type name', () => {
  const byPath = HarnessShapes.Class.describe(rootDirectory, 'tasks.all');
  expect(byPath.type).toBe('TaskNode');
  expect(byPath.kind).toBe('interface');
  const memberNames = (
    byPath.shape as { members: { name: string }[] }
  ).members.map((member) => member.name);
  expect(memberNames).toContain('number');
  expect(memberNames).toContain('reportMeta');
  const byType = HarnessShapes.Class.describe(rootDirectory, 'VerbEvent');
  expect(byType.kind).toBe('interface');
});

test('describe answers a class with its public static methods', () => {
  const answer = HarnessShapes.Class.describe(rootDirectory, 'HarnessVerbs');
  expect(answer.kind).toBe('class');
  const methodNames = (
    answer.shape as { methods: { name: string }[] }
  ).methods.map((method) => method.name);
  expect(methodNames).toContain('run');
});

test('an undescribable subject fails loudly listing describables', () => {
  expect(() => HarnessShapes.Class.describe(rootDirectory, 'Nonsense')).toThrow(
    /Describable: .*TaskNode/,
  );
});
