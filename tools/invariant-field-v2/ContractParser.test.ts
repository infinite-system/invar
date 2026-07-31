import { describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseAnnotations,
  parseContract,
  parseLatticeCompositions,
  parseLatticeDependencies,
  recordKey,
  slugifyInvariantName,
} from './ContractParser';
import {
  assignStableIdentities,
  buildInvariantFieldStore,
  codeReferenceTargets,
  scanConnections,
  verificationMode,
} from './RepositoryHistory';

const repositoryRoot = join(import.meta.dir, '../..');
const checkerPath = join(
  repositoryRoot,
  '.claude/skills/invariants/scripts/check_invariants.mjs',
);

function canonicalContract(): string {
  return `## Reality-based invariants

### Reality record

**Invariant:** If input is fixed, output stays fixed.
**Scope:** This fixture.
**Mechanism:** One pure operation produces the result.
**Generates:** Repeatable output; stable consumers.
**Evidence:** \`tools/invariant-field-v2/ContractParser.test.ts\`
**Impossible if true:** The same input produces two different outputs.
**Verification:** \`bun test tools/invariant-field-v2/ContractParser.test.ts\`
**Status:** established
**Last refined:** 2026-07-30

## Chosen invariants

### Chosen record

**Invariant:** Records use names.
**Scope:** This fixture.
**Mechanism:** The parser reads the heading.
**Evidence:** \`tools/invariant-field-v2/ContractParser.test.ts\`
**Impossible if true:** A record has no heading name at all.
**Verification:** inspect this fixture
**Status:** provisional
**Last refined:** 2026-07-30
`;
}

describe('canonical contract parser', () => {
  test('matches the checker record total for the current tree', () => {
    const contractPaths = Bun.spawnSync({
      cmd: ['git', 'ls-files', '*.invariants.md'],
      cwd: repositoryRoot,
    })
      .stdout.toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    const results = contractPaths.map((contractPath) =>
      parseContract(
        contractPath,
        readFileSync(join(repositoryRoot, contractPath), 'utf8'),
      ),
    );
    expect(results.flatMap((result) => result.issues)).toEqual([]);
    const checker = Bun.spawnSync({
      cmd: ['node', checkerPath, '--score'],
      cwd: repositoryRoot,
    });
    expect(checker.exitCode).toBe(0);
    const score = JSON.parse(
      checker.stdout.toString().trim().split('\n').at(-1)!,
    );
    expect(results.flatMap((result) => result.records)).toHaveLength(
      score.schema.records,
    );
  });

  test('normalizes BOM and CRLF and masks inert examples', () => {
    const source = `\uFEFF${canonicalContract().replaceAll('\n', '\r\n')}
\`\`\`md
### Not a record
**Invariant:** inert
\`\`\`
<!-- ### Also not a record -->
`;
    const result = parseContract('fixture.invariants.md', source);
    expect(result.issues).toEqual([]);
    expect(result.records.map((record) => record.name)).toEqual([
      'Reality record',
      'Chosen record',
    ]);
  });

  test('agrees with the checker that a missing field is invalid', () => {
    const invalidSource = canonicalContract().replace(
      '**Verification:** inspect this fixture',
      '**Verification:**',
    );
    expect(
      parseContract('fixture.invariants.md', invalidSource).issues.some(
        (issue) => issue.message.includes('Verification'),
      ),
    ).toBe(true);
    const scratchDirectory = mkdtempSync(
      join(tmpdir(), 'invariant-field-parser-test-'),
    );
    const scratchPath = join(scratchDirectory, 'fixture.invariants.md');
    try {
      writeFileSync(scratchPath, invalidSource);
      const checker = Bun.spawnSync({
        cmd: ['node', checkerPath, scratchPath],
        cwd: repositoryRoot,
      });
      expect(checker.exitCode).toBe(1);
      expect(checker.stderr.toString() + checker.stdout.toString()).toContain(
        'missing or empty Verification',
      );
    } finally {
      rmSync(scratchDirectory, { recursive: true });
    }
  });

  test('uses the canonical slug and exact annotation identity', () => {
    const result = parseContract('fixture.invariants.md', canonicalContract());
    const records = new Map(
      result.records.map((record) => [
        recordKey(record.contractPath, record.name),
        record,
      ]),
    );
    const annotations = parseAnnotations(
      'fixture.ts',
      `// ${'invariant'}: Reality record (fixture.invariants.md)`,
      records,
    );
    expect(slugifyInvariantName('A “quoted” rule')).toBe('a-quoted-rule');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.resolved).toBe(true);
  });

  test('resolves lattice members to record identifiers', () => {
    const result = parseContract('fixture.invariants.md', canonicalContract());
    const records = new Map(
      result.records.map((record) => [
        recordKey(record.contractPath, record.name),
        record,
      ]),
    );
    const compositions = parseLatticeCompositions(
      'fixture.lattice.md',
      `## Compositions

### Stable fixture

**Members:** [Reality record](fixture.invariants.md#reality-record)

**Guarantee:** The fixture stays repeatable.
`,
      records,
    );
    expect(compositions).toHaveLength(1);
    expect(compositions[0]?.memberIdentifiers).toEqual([
      result.records[0]!.stableIdentifier,
    ]);
    expect(compositions[0]?.guarantee).toBe('The fixture stays repeatable.');
  });

  test('resolves lattice dependency direction from stands-on prose', () => {
    const result = parseContract('fixture.invariants.md', canonicalContract());
    const records = new Map(
      result.records.map((record) => [
        recordKey(record.contractPath, record.name),
        record,
      ]),
    );
    const dependencies = parseLatticeDependencies(
      'fixture.lattice.md',
      `[Chosen record][chosen] stands on [Reality record][reality].

[chosen]: fixture.invariants.md#chosen-record
[reality]: fixture.invariants.md#reality-record
`,
      records,
    );
    expect(dependencies).toEqual([
      {
        sourceIdentifier: result.records[1]!.stableIdentifier,
        targetIdentifier: result.records[0]!.stableIdentifier,
      },
    ]);
  });

  test('keeps identity through one atomic rename ripple', () => {
    const previousRecord = parseContract(
      'old.invariants.md',
      canonicalContract(),
    ).records[0]!;
    const renamedRecord = parseContract(
      'new.invariants.md',
      canonicalContract().replace('Reality record', 'Renamed reality record'),
    ).records[0]!;
    const originalIdentifier = previousRecord.stableIdentifier;
    const result = assignStableIdentities([previousRecord], [renamedRecord]);
    expect(result.records[0]?.stableIdentifier).toBe(originalIdentifier);
  });

  test('publishes lattice membership on each member record', () => {
    const contractSource = canonicalContract();
    const records = parseContract(
      'fixture.invariants.md',
      contractSource,
    ).records;
    const latticeSource = `## Compositions

### Stable fixture

**Members:** [Reality record](fixture.invariants.md#reality-record)

**Guarantee:** The fixture remains stable.
`;
    const connections = scanConnections(
      new Map([
        ['fixture.invariants.md', contractSource],
        ['fixture.lattice.md', latticeSource],
      ]),
      records,
    );
    expect(
      connections.membershipsByRecord.get(records[0]!.stableIdentifier),
    ).toEqual(['fixture.lattice.md#stable-fixture']);
  });

  test('publishes exact dependency identities and code locations', () => {
    const contractSource = canonicalContract().replace(
      '**Mechanism:** One pure operation produces the result.',
      '**Mechanism:** `tools/invariant-field-v2/ContractParser.ts:254` produces the result with [Chosen record](fixture.invariants.md#chosen-record).',
    );
    const records = parseContract(
      'fixture.invariants.md',
      contractSource,
    ).records;
    const connections = scanConnections(
      new Map([['fixture.invariants.md', contractSource]]),
      records,
    );
    expect(
      connections.outgoingIdentifiersByRecord.get(records[0]!.stableIdentifier),
    ).toEqual([records[1]!.stableIdentifier]);
    expect(
      codeReferenceTargets('mechanism', records[0]!.fields.Mechanism ?? ''),
    ).toEqual([
      {
        source: 'mechanism',
        label: 'tools/invariant-field-v2/ContractParser.ts:254',
        path: 'tools/invariant-field-v2/ContractParser.ts',
        line: 254,
      },
    ]);
    expect(
      codeReferenceTargets(
        'evidence',
        '`tools/invariant-field-v2/ui/InvariantField.vue:1`, `README.md`, and `missing.ts`',
      ),
    ).toEqual([
      {
        source: 'evidence',
        label: 'tools/invariant-field-v2/ui/InvariantField.vue:1',
        path: 'tools/invariant-field-v2/ui/InvariantField.vue',
        line: 1,
      },
      {
        source: 'evidence',
        label: 'README.md',
        path: 'README.md',
        line: 1,
      },
      {
        source: 'evidence',
        label: 'missing.ts',
        path: 'missing.ts',
        line: 1,
      },
    ]);
  });

  test('keeps an exact dead citation unresolved', () => {
    const scratchRepository = mkdtempSync(
      join(tmpdir(), 'invariant-field-dead-citation-'),
    );
    mkdirSync(join(scratchRepository, 'src/modules/text'), {
      recursive: true,
    });
    writeFileSync(
      join(scratchRepository, 'fixture.invariants.md'),
      canonicalContract().replace(
        '`tools/invariant-field-v2/ContractParser.test.ts`',
        '`src/modules/editor/TextDocument.ts` and `TextDocument.ts`',
      ),
    );
    writeFileSync(
      join(scratchRepository, 'src/modules/text/TextDocument.ts'),
      'export class TextDocument {}\n',
    );
    const runGitFixture = (...argumentsList: string[]) =>
      Bun.spawnSync({
        cmd: ['git', ...argumentsList],
        cwd: scratchRepository,
        stdout: 'pipe',
        stderr: 'pipe',
      });
    try {
      expect(runGitFixture('init').exitCode).toBe(0);
      expect(runGitFixture('add', '.').exitCode).toBe(0);
      expect(
        runGitFixture(
          '-c',
          'user.name=Field fixture',
          '-c',
          'user.email=field-fixture@example.test',
          'commit',
          '-m',
          'add fixture',
        ).exitCode,
      ).toBe(0);
      const store = buildInvariantFieldStore(scratchRepository);
      const realityRecord = store.snapshots
        .at(-1)!
        .records.find((record) => record.name === 'Reality record')!;
      expect(
        realityRecord.codeReferences.map((reference) => ({
          path: reference.path,
          resolved: reference.resolved,
        })),
      ).toEqual([
        {
          path: 'src/modules/editor/TextDocument.ts',
          resolved: false,
        },
        {
          path: 'src/modules/text/TextDocument.ts',
          resolved: true,
        },
      ]);
    } finally {
      rmSync(scratchRepository, { recursive: true });
    }
  });

  test('executes only bounded read-only verification on the current tree', () => {
    const record = parseContract('fixture.invariants.md', canonicalContract())
      .records[0]!;
    record.fields.Verification =
      '`grep -q "Invariance Field" tools/invariant-field-v2/README.md`';
    expect(verificationMode(record, repositoryRoot, true)).toBe(
      'executed-pass',
    );
    record.fields.Verification =
      '`grep -q "not present in the guide" tools/invariant-field-v2/README.md`';
    expect(verificationMode(record, repositoryRoot, true)).toBe(
      'executed-fail',
    );
    record.fields.Verification =
      '`bun test tools/invariant-field-v2/ContractParser.test.ts`';
    expect(verificationMode(record, repositoryRoot, true)).toBe(
      'citation-only',
    );
    expect(verificationMode(record, repositoryRoot, false)).toBe(
      'citation-only',
    );
  });
});
