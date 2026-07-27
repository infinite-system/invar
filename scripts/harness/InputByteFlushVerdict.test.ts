import { expect, test } from 'bun:test';
import { InputByteFlushVerdict } from './InputByteFlushVerdict';

test('a cursor assertion failure reports driven behaviour', () => {
  const failureMessage = InputByteFlushVerdict.Class.sessionFailureMessage(
    2,
    1,
    '',
    InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
      'Measured Left press 14 did not move the terminal cursor',
    ),
  );

  expect(failureMessage).toBe(
    'input-byte-flush-gate: DRIVEN BEHAVIOUR WRONG — session 2: ' +
      'Measured Left press 14 did not move the terminal cursor',
  );
  expect(failureMessage).not.toContain('TOO SLOW');
});

test('an unsuccessful session without a behavior verdict is invalid', () => {
  expect(
    InputByteFlushVerdict.Class.sessionFailureMessage(
      3,
      1,
      'partial output',
      'process exited',
    ),
  ).toBe(
    'input-byte-flush-gate: MEASUREMENT INVALID — session 3 exited 1 ' +
      'before producing a valid datum',
  );
});

test('a failed measurement without a behavior verdict is invalid', () => {
  expect(
    InputByteFlushVerdict.Class.measurementFailureMessage(
      'application startup timed out',
    ),
  ).toBe(
    'input-byte-flush: MEASUREMENT INVALID — application startup timed out',
  );
});

test('a breached latency ceiling reports a slow measurement', () => {
  expect(InputByteFlushVerdict.Class.tooSlowMessage(10.125, 2)).toBe(
    'input-byte-flush-gate: MEASUREMENT TOO SLOW — p50 10.125 ms ' +
      'exceeds baseline×2 on both passes',
  );
});
