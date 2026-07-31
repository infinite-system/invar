import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseAnnotations,
  parseContract,
  parseLatticeCompositions,
  recordKey,
  slugifyInvariantName,
} from './ContractParser';
import {
  assignStableIdentities,
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
