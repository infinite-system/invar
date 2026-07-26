import { describe, expect, test } from 'bun:test';
import { DiffAlignment } from './DiffAlignment';
import { GutterDiff } from './GutterDiff';

describe('GutterDiff', () => {
  test('equal text has no gutter statuses', () => {
    expect(GutterDiff.Class.marksByLine('one\ntwo', 'one\ntwo')).toEqual(
      new Map(),
    );
  });

  test('a replaced line is modified', () => {
    expect(
      GutterDiff.Class.marksByLine('one\nold\nthree', 'one\nnew\nthree'),
    ).toEqual(new Map([[1, [{ kind: 'modified', hoverLabel: 'modified' }]]]));
  });

  test('an inserted line is added', () => {
    expect(
      GutterDiff.Class.marksByLine('one\nthree', 'one\ntwo\nthree'),
    ).toEqual(new Map([[1, [{ kind: 'added', hoverLabel: 'added' }]]]));
  });

  test('a deleted run marks the following buffer line', () => {
    expect(
      GutterDiff.Class.marksByLine(
        'one\nremoved one\nremoved two\nfour',
        'one\nfour',
      ),
    ).toEqual(
      new Map([
        [
          1,
          [
            {
              kind: 'deleted',
              hoverLabel: '2 lines deleted above',
              deletedLineCount: 2,
            },
          ],
        ],
      ]),
    );
  });

  test('an untracked file marks every buffer line as added', () => {
    expect(GutterDiff.Class.marksByLine('', 'one\ntwo\nthree')).toEqual(
      new Map([
        [0, [{ kind: 'added', hoverLabel: 'added' }]],
        [1, [{ kind: 'added', hoverLabel: 'added' }]],
        [2, [{ kind: 'added', hoverLabel: 'added' }]],
      ]),
    );
  });

  test('a deletion at end of file marks the last buffer line', () => {
    expect(
      GutterDiff.Class.marksByLine('one\ntwo\nremoved', 'one\ntwo'),
    ).toEqual(
      new Map([
        [
          1,
          [
            {
              kind: 'deleted',
              hoverLabel: '1 line deleted at end of file',
              deletedLineCount: 1,
            },
          ],
        ],
      ]),
    );
  });

  test('a modified placement line keeps its nearby deletion recoverable', () => {
    expect(
      GutterDiff.Class.marksByLine(
        'one\nremoved one\nremoved two\nold four',
        'one\nnew four',
      ),
    ).toEqual(
      new Map([
        [
          1,
          [
            { kind: 'modified', hoverLabel: 'modified' },
            {
              kind: 'deleted',
              hoverLabel: '2 lines deleted above',
              deletedLineCount: 2,
            },
          ],
        ],
      ]),
    );
  });

  test('alignment remains an overridable late-bound dependency', () => {
    class SingleLineDiffAlignment extends DiffAlignment.$Class {
      static override splitLines(_text: string): string[] {
        return ['replacement'];
      }
    }
    class TestGutterDiff extends GutterDiff.$Class {
      protected static override get DiffAlignment() {
        return SingleLineDiffAlignment;
      }
    }

    expect(TestGutterDiff.marksByLine('', 'one\ntwo')).toEqual(
      new Map([[0, [{ kind: 'added', hoverLabel: 'added' }]]]),
    );
  });
});
