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

test('every answer names its references', () => {
  const answer = HarnessShapes.Class.describe(rootDirectory, 'tasks.all');
  expect(answer.references).toContain('TaskReportMeta');
  const verbAnswer = HarnessShapes.Class.describe(
    rootDirectory,
    'HarnessVerbs',
  );
  expect(verbAnswer.references).toContain('VerbResult');
});

test('depth 2 inlines a referenced interface in place', () => {
  const answer = HarnessShapes.Class.describe(rootDirectory, 'tasks.all', 2);
  const members = (
    answer.shape as unknown as { members: Record<string, unknown>[] }
  ).members;
  const reportMetaMember = members.find(
    (member) => member['name'] === 'reportMeta',
  )!;
  const expanded = reportMetaMember['expanded'] as {
    members: { name: string }[];
  };
  expect(expanded.members.map((member) => member.name)).toContain('steering');
});

test('depth 1 stays flat (silent arm)', () => {
  const answer = HarnessShapes.Class.describe(rootDirectory, 'tasks.all', 1);
  const members = (
    answer.shape as unknown as { members: Record<string, unknown>[] }
  ).members;
  expect(members.every((member) => member['expanded'] === undefined)).toBe(
    true,
  );
});

test('a self-referential chain stops at a cycle marker, never loops', () => {
  const catalog = {
    interfaces: {
      LoopNode: {
        file: 'fixture.ts',
        source: 'export interface LoopNode { next: LoopNode | null; }',
        members: [{ name: 'next', type: 'LoopNode | null', optional: false }],
      },
    },
    classes: {},
  };
  const expanded = HarnessShapes.Class.expandInterface(
    catalog,
    'LoopNode',
    5,
    new Set(['LoopNode']),
  );
  expect(expanded.members[0]!['cycle']).toBe('LoopNode');
  expect(expanded.members[0]!['expanded']).toBeUndefined();
});

test('the typescript form is the declaration verbatim with a references trailer', () => {
  const rendered = HarnessShapes.Class.renderTypeScript(
    rootDirectory,
    'tasks.all',
    1,
  );
  expect(rendered).toContain('export interface TaskNode {');
  expect(rendered).toContain(
    'references (raise --depth to inline): TaskReportMeta',
  );
});

test('the typescript form at depth 2 appends referenced declarations', () => {
  const rendered = HarnessShapes.Class.renderTypeScript(
    rootDirectory,
    'tasks.all',
    2,
  );
  expect(rendered).toContain('export interface TaskNode {');
  expect(rendered).toContain('export interface TaskReportMeta {');
});

test('a type with a doc comment carries it in the verbatim source', () => {
  const rendered = HarnessShapes.Class.renderTypeScript(
    rootDirectory,
    'HarnessContributor',
    1,
  );
  expect(rendered).toContain('THE contract surface');
  expect(rendered).toContain('export interface HarnessContributor {');
});
