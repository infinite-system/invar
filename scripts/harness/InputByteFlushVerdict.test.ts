import { expect, test } from 'bun:test';
import { InputByteFlushVerdict } from './InputByteFlushVerdict';

test('a glyph assertion failure reports driven behaviour', () => {
  const failureMessage = InputByteFlushVerdict.Class.sessionFailureMessage(
    2,
    1,
    '',
    InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
      'Measured glyph 14 was absent from the first completed frame',
    ),
  );

  expect(failureMessage).toBe(
    'input-byte-flush-gate: DRIVEN BEHAVIOUR WRONG — session 2: ' +
      'Measured glyph 14 was absent from the first completed frame',
  );
  expect(failureMessage).not.toContain('INSTRUMENT FAILED');
});

test('an unsuccessful session without a behavior verdict is an instrument failure', () => {
  expect(
    InputByteFlushVerdict.Class.sessionFailureMessage(
      3,
      1,
      'partial output',
      'process exited',
    ),
  ).toBe(
    'input-byte-flush-gate: INSTRUMENT FAILED — session 3 exited 1 ' +
      'before producing a valid datum',
  );
});

test('a failed measurement without a behavior verdict is an instrument failure', () => {
  expect(
    InputByteFlushVerdict.Class.measurementFailureMessage(
      'application startup timed out',
    ),
  ).toBe('input-byte-flush: INSTRUMENT FAILED — application startup timed out');
});

test('the frame-ordering check rejects a glyph delayed to the second frame', () => {
  expect(InputByteFlushVerdict.Class.firstFrameOrderingFailure(2)).toBe(
    'the edited glyph appeared in completed frame 2 after input; ' +
      'expected the first',
  );
  expect(InputByteFlushVerdict.Class.firstFrameOrderingFailure(1)).toBeNull();
});
