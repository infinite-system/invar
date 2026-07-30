import { beforeEach, describe, expect, test } from 'bun:test';
import { RenderLoadLedger } from './RenderLoadLedger';

describe('RenderLoadLedger', () => {
  beforeEach(() => {
    RenderLoadLedger.Class.reset();
  });

  test('attributes each request to the owner whose closure raised it', () => {
    let hostRequestCount = 0;
    const gitRequestRender = RenderLoadLedger.Class.attribute('git', () => {
      hostRequestCount += 1;
    });
    const tasksRequestRender = RenderLoadLedger.Class.attribute('tasks', () => {
      hostRequestCount += 1;
    });
    gitRequestRender();
    gitRequestRender();
    tasksRequestRender();
    expect(RenderLoadLedger.Class.countFor('git')).toBe(2);
    expect(RenderLoadLedger.Class.countFor('tasks')).toBe(1);
    expect(RenderLoadLedger.Class.countFor('never-asked')).toBe(0);
    // The wrapper must still call through, or attribution would suppress the frame it counts.
    expect(hostRequestCount).toBe(3);
  });

  test('orders owners by lifetime load, heaviest first', () => {
    RenderLoadLedger.Class.record('quiet');
    for (let index = 0; index < 5; index += 1) {
      RenderLoadLedger.Class.record('noisy');
    }
    expect(
      RenderLoadLedger.Class.counts().map((entry) => entry.ownerIdentifier),
    ).toEqual(['noisy', 'quiet']);
  });

  test('a quiet baseline separates requests raised while watching from lifetime load', () => {
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.markQuietBaseline();
    expect(RenderLoadLedger.Class.totalSinceQuietBaseline()).toBe(0);
    expect(RenderLoadLedger.Class.sinceQuietBaseline()).toEqual([]);
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.record('structure');
    const sinceBaseline = RenderLoadLedger.Class.sinceQuietBaseline();
    expect(RenderLoadLedger.Class.totalSinceQuietBaseline()).toBe(2);
    expect(
      sinceBaseline.map((entry) => [
        entry.ownerIdentifier,
        entry.requestCountSinceBaseline,
        entry.requestCount,
      ]),
    ).toEqual([
      ['git', 1, 3],
      ['structure', 1, 1],
    ]);
  });

  test('an owner first seen after the baseline reports its whole count as new load', () => {
    RenderLoadLedger.Class.markQuietBaseline();
    RenderLoadLedger.Class.record('late-arrival');
    RenderLoadLedger.Class.record('late-arrival');
    const [entry] = RenderLoadLedger.Class.sinceQuietBaseline();
    expect(entry?.ownerIdentifier).toBe('late-arrival');
    expect(entry?.requestCountSinceBaseline).toBe(2);
  });

  test('a second baseline replaces the first rather than accumulating', () => {
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.markQuietBaseline();
    RenderLoadLedger.Class.record('git');
    RenderLoadLedger.Class.markQuietBaseline();
    expect(RenderLoadLedger.Class.totalSinceQuietBaseline()).toBe(0);
    expect(RenderLoadLedger.Class.countFor('git')).toBe(2);
  });
});
