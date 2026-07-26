import { test, expect } from 'bun:test';
import { ScrollPhysics } from './ScrollPhysics';

test('key acceleration: quiet start, monotonic build, capped', () => {
  expect(ScrollPhysics.Class.keyAcceleration(0)).toBe(1);
  expect(ScrollPhysics.Class.keyAcceleration(2)).toBe(1); // tapping stays 1:1
  let previous = 1;
  for (let run = 3; run < 60; run++) {
    const rows = ScrollPhysics.Class.keyAcceleration(run);
    expect(rows).toBeGreaterThanOrEqual(previous); // monotonic
    previous = rows;
  }
  expect(previous).toBe(ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS); // reaches the cap
  expect(ScrollPhysics.Class.keyAcceleration(15)).toBeGreaterThanOrEqual(20); // NOTICEABLE mid-hold
});

test('the ramp kicks in almost immediately on hold (user tune: fast early phase)', () => {
  // Within the FIRST 10 repeats the traversal must already be substantial…
  let earlyLines = 0;
  for (let run = 0; run < 10; run++)
    earlyLines += ScrollPhysics.Class.keyAcceleration(run);
  expect(earlyLines).toBeGreaterThanOrEqual(60);
  // …while tapping stays exactly 1:1.
  expect(ScrollPhysics.Class.keyAcceleration(0)).toBe(1);
  expect(ScrollPhysics.Class.keyAcceleration(1)).toBe(1);
});

test('a two-second hold traverses ~1000 lines (feel target)', () => {
  // Key repeat ≈ 28/s after the initial delay -> ~56 repeats in 2s.
  let lines = 0;
  for (let run = 0; run < 56; run++)
    lines += ScrollPhysics.Class.keyAcceleration(run);
  expect(lines).toBeGreaterThan(900);
});

test('jump rows ramp from base to cap', () => {
  expect(ScrollPhysics.Class.jumpRows(0)).toBe(
    ScrollPhysics.Class.JUMP_BASE_ROWS,
  );
  expect(ScrollPhysics.Class.jumpRows(50)).toBe(
    ScrollPhysics.Class.JUMP_CAP_ROWS,
  );
});

test('terminal repeat runs reset on pause or direction without key up', () => {
  const scrollPhysics = new ScrollPhysics.Class();

  expect(scrollPhysics.keyAccelerationFor('down', 1_000)).toBe(1);
  expect(scrollPhysics.keyAccelerationFor('down', 1_020)).toBe(1);
  expect(scrollPhysics.keyAccelerationFor('down', 1_040)).toBe(1);
  expect(scrollPhysics.keyAccelerationFor('down', 1_060)).toBeGreaterThan(1);
  expect(scrollPhysics.keyAccelerationFor('up', 1_080)).toBe(1);
  expect(scrollPhysics.keyAccelerationFor('up', 1_500)).toBe(1);
});

test('the shared repeat tracker returns the bounded curve ceiling', () => {
  const scrollPhysics = new ScrollPhysics.Class();
  let movementRows = 0;
  for (let repeatNumber = 0; repeatNumber < 100; repeatNumber++) {
    movementRows = scrollPhysics.keyAccelerationFor(
      'down',
      1_000 + repeatNumber,
    );
  }

  expect(movementRows).toBe(ScrollPhysics.Class.KEY_ACCEL_CAP_ROWS);
});
