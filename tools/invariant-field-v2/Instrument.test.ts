import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Instrument } from './Instrument';

const toolRoot = join(import.meta.dir);

function toolSource(fileName: string) {
  return readFileSync(join(toolRoot, fileName), 'utf8');
}

describe('Instrument identity', () => {
  test('the page title and the chrome name come from one place', () => {
    const page = toolSource('index.html');
    expect(page).toContain(`<title>${Instrument.Class.DOCUMENT_TITLE}</title>`);
    expect(Instrument.Class.DOCUMENT_TITLE).toContain(Instrument.Class.NAME);
  });

  test('the instrument names its own contract and lattice', () => {
    expect(Instrument.Class.CONTRACT_PATH).toBe(
      'tools/invariant-field-v2/invariant-field.invariants.md',
    );
    expect(Instrument.Class.LATTICE_PATH).toBe(
      'tools/invariant-field-v2/invariant-field.lattice.md',
    );
    expect(toolSource('invariant-field.invariants.md')).toContain(
      '## Reality-based invariants',
    );
    expect(toolSource('invariant-field.lattice.md')).toContain(
      '## Compositions',
    );
  });
});

// The next two guards are the enforcement points for invariants whose
// mechanism is an absence. An absence has no line to annotate, so the test is
// the annotation.
describe('Instrument absences', () => {
  // invariant: An idle instrument does no work (tools/invariant-field-v2/invariant-field.invariants.md)
  test('the server starts no timer and no watcher', () => {
    const server = toolSource('server.ts');
    expect(server).not.toContain('setInterval');
    expect(server).not.toContain('setTimeout');
    expect(server).not.toMatch(/\bwatch\s*\(/);
    expect(server).not.toContain('watchFile');
  });

  // invariant: Design tokens are the only source of colour and timing (tools/invariant-field-v2/invariant-field.invariants.md)
  test('the stylesheet names no literal colour and no literal duration', () => {
    const stylesheet = toolSource('styles.css');
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stylesheet).not.toMatch(/\brgb\(\s*[0-9]/);
    expect(stylesheet).not.toMatch(/\b[0-9]+m?s\b/);
    expect(stylesheet).toContain('var(--color-');
    expect(stylesheet).toContain('var(--duration-');
  });
});
