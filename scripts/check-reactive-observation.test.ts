// An instrument that can only fail toward "pass" is worthless, so this tests the
// checker from both sides: the known-bad fixture must be flagged, and the LIVE
// forms of the very same code must not be — a checker that flags the live shape
// too teaches people to ignore it.
import { describe, expect, it } from 'bun:test';
import {
  runDroppedObservationPositiveControl,
  scanSourceText,
  type CandidateCategory,
} from './check-reactive-observation';

function flaggedCategories(sourceText: string): CandidateCategory[] {
  return [
    ...new Set(
      scanSourceText(sourceText).map((candidate) => candidate.category),
    ),
  ].sort();
}

describe('runDroppedObservationPositiveControl', () => {
  it('flags every category in the known-bad fixture', () => {
    const candidates = runDroppedObservationPositiveControl();
    expect(
      [...new Set(candidates.map((candidate) => candidate.category))].sort(),
    ).toEqual([
      'construction-captured-reactive-read',
      'module-scope-captured-reactive-read',
      'shallow-payload-mutation',
    ]);
  });
});

describe('scanSourceText', () => {
  it('flags a Ref read captured into a field and reported later', () => {
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'class $ScrollProbe {',
          '  protected capturedScrollTop = 0;',
          '  get scrollTop() {',
          '    return ref(0);',
          '  }',
          '  constructor() {',
          '    this.capturedScrollTop = this.scrollTop.value;',
          '  }',
          '  reportedScrollTop(): number {',
          '    return this.capturedScrollTop;',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['construction-captured-reactive-read']);
  });

  it('leaves the live read of the same value alone', () => {
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'class $ScrollProbe {',
          '  get scrollTop() {',
          '    return ref(0);',
          '  }',
          '  reportedScrollTop(): number {',
          '    return this.scrollTop.value;',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves a construction seed paired with a live thunk alone', () => {
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'class $Splitter {',
          '  constructor(',
          '    readonly options: {',
          '      initialSize: number;',
          '      currentSize: () => number;',
          '    },',
          '  ) {}',
          '}',
          'class $PaneSplitters {',
          '  protected readonly splitter: $Splitter;',
          '  get sidebarWidth() {',
          '    return ref(20);',
          '  }',
          '  constructor() {',
          '    this.splitter = new $Splitter({',
          '      initialSize: this.sidebarWidth.value,',
          '      currentSize: () => this.sidebarWidth.value,',
          '    });',
          '  }',
          '  splitterSize(): number {',
          '    return this.splitter.options.currentSize();',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('flags an in-place shallowRef payload mutation', () => {
    expect(
      flaggedCategories(
        [
          "import { shallowRef } from 'vue';",
          'class $Transcript {',
          '  get rows() {',
          '    return shallowRef<string[]>([]);',
          '  }',
          '  append(row: string): void {',
          '    this.rows.value.push(row);',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual(['shallow-payload-mutation']);
  });

  it('leaves a wholesale shallowRef replacement alone', () => {
    expect(
      flaggedCategories(
        [
          "import { shallowRef } from 'vue';",
          'class $Transcript {',
          '  get rows() {',
          '    return shallowRef<readonly string[]>([]);',
          '  }',
          '  append(row: string): void {',
          '    this.rows.value = [...this.rows.value, row];',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('does not mistake a deep ref payload mutation for a lost signal', () => {
    // `ref()` returns a deep reactive proxy, so mutating the array DOES notify —
    // flagging it would be the confident false positive that kills a checker.
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'class $Transcript {',
          '  get rows() {',
          '    return ref<string[]>([]);',
          '  }',
          '  append(row: string): void {',
          '    this.rows.value.push(row);',
          '  }',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('flags a module-scope capture and spares a module-scope Ref binding', () => {
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'const sharedRows = ref(0);',
          'export const capturedRows = sharedRows.value;',
        ].join('\n'),
      ),
    ).toEqual(['module-scope-captured-reactive-read']);
    expect(
      flaggedCategories(
        [
          "import { ref } from 'vue';",
          'const sharedRows = ref(0);',
          'export function readRows(): number {',
          '  return sharedRows.value;',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});
