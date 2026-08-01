import { describe, expect, test } from 'bun:test';
import {
  NavigationHistory,
  type NavigationHistoryContributor,
} from './NavigationHistory';

interface FakeState {
  place: string;
  detail: number;
}

class FakeContributor implements NavigationHistoryContributor {
  constructor(readonly identifier: string) {}
  currentState: FakeState | null = null;
  readonly restoredPlaces: string[] = [];
  readonly unrestorablePlaces = new Set<string>();

  captureCurrentState(): FakeState | null {
    return this.currentState ? { ...this.currentState } : null;
  }

  restoreState(payload: unknown): boolean {
    if (!isFakeState(payload) || this.unrestorablePlaces.has(payload.place)) {
      return false;
    }
    this.currentState = { ...payload };
    this.restoredPlaces.push(payload.place);
    return true;
  }

  samePlace(previousPayload: unknown, nextPayload: unknown): boolean {
    return (
      isFakeState(previousPayload) &&
      isFakeState(nextPayload) &&
      previousPayload.place === nextPayload.place
    );
  }
}

function isFakeState(payload: unknown): payload is FakeState {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Partial<FakeState>;
  return (
    typeof candidate.place === 'string' && typeof candidate.detail === 'number'
  );
}

function record(
  history: NavigationHistory.Model,
  contributor: FakeContributor,
  place: string,
  detail = 0,
): void {
  contributor.currentState = { place, detail };
  history.recordCurrentState();
}

function currentPayload(history: NavigationHistory.Model): FakeState | null {
  return (history.currentEntry?.payload as FakeState | undefined) ?? null;
}

function registeredHistory(identifier = 'fake.view') {
  const history = new NavigationHistory.Class();
  const contributor = new FakeContributor(identifier);
  const dispose = history.register(contributor);
  return { history, contributor, dispose };
}

describe('NavigationHistory', () => {
  test('starts empty and cannot move', () => {
    const { history } = registeredHistory();
    expect(history.size).toBe(0);
    expect(history.currentEntry).toBeNull();
    expect(history.canGoBack).toBe(false);
    expect(history.canGoForward).toBe(false);
    expect(history.back()).toBe(false);
    expect(history.forward()).toBe(false);
  });

  test('captures opaque contributor states and restores them in both directions', () => {
    const { history, contributor } = registeredHistory();
    record(history, contributor, 'first', 1);
    record(history, contributor, 'second', 2);
    record(history, contributor, 'third', 3);

    expect(history.back()).toBe(true);
    expect(contributor.currentState).toEqual({ place: 'second', detail: 2 });
    expect(history.back()).toBe(true);
    expect(contributor.currentState).toEqual({ place: 'first', detail: 1 });
    expect(history.back()).toBe(false);
    expect(history.forward()).toBe(true);
    expect(history.forward()).toBe(true);
    expect(history.forward()).toBe(false);
    expect(contributor.restoredPlaces).toEqual([
      'second',
      'first',
      'second',
      'third',
    ]);
  });

  test('a new capture after going back truncates the forward trail', () => {
    const { history, contributor } = registeredHistory();
    record(history, contributor, 'first');
    record(history, contributor, 'second');
    record(history, contributor, 'third');
    expect(history.back()).toBe(true);

    record(history, contributor, 'branch');

    expect(history.size).toBe(3);
    expect(currentPayload(history)?.place).toBe('branch');
    expect(history.canGoForward).toBe(false);
  });

  test('the contributor defines same-place collapse while retaining the newest payload', () => {
    const { history, contributor } = registeredHistory();
    record(history, contributor, 'same', 1);
    record(history, contributor, 'same', 8);

    expect(history.size).toBe(1);
    expect(currentPayload(history)).toEqual({ place: 'same', detail: 8 });
  });

  test('states from different contributors never collapse', () => {
    const history = new NavigationHistory.Class();
    const first = new FakeContributor('first.view');
    const second = new FakeContributor('second.view');
    history.register(first);
    history.register(second);
    record(history, first, 'shared');
    first.currentState = null;
    record(history, second, 'shared');
    expect(history.size).toBe(2);
  });

  test('replay suppresses recording by every contributor', () => {
    const history = new NavigationHistory.Class();
    const first = new FakeContributor('first.view');
    const second = new FakeContributor('second.view');
    history.register(first);
    history.register(second);
    record(history, first, 'first');
    first.currentState = null;
    record(history, second, 'second');

    history.runWithoutRecording(() => {
      second.currentState = { place: 'would-record', detail: 0 };
      history.recordCurrentState();
    });

    expect(history.size).toBe(2);
  });

  test('an unrestorable entry is dropped and navigation continues', () => {
    const { history, contributor } = registeredHistory();
    record(history, contributor, 'first');
    record(history, contributor, 'missing');
    record(history, contributor, 'third');
    contributor.unrestorablePlaces.add('missing');

    expect(history.back()).toBe(true);
    expect(contributor.currentState?.place).toBe('first');
    expect(history.size).toBe(2);
    expect(history.currentIndex.value).toBe(0);
  });

  test('entries for a removed contributor are dropped', () => {
    const { history, contributor, dispose } = registeredHistory();
    record(history, contributor, 'first');
    record(history, contributor, 'second');
    dispose();

    expect(history.back()).toBe(false);
    expect(history.size).toBe(1);
    expect(currentPayload(history)?.place).toBe('second');
  });

  test('the list caps at 100 and drops the oldest states', () => {
    const { history, contributor } = registeredHistory();
    for (let index = 0; index < 150; index += 1) {
      record(history, contributor, `place-${index}`);
    }
    expect(history.size).toBe(100);
    expect(currentPayload(history)?.place).toBe('place-149');
    let steps = 0;
    while (history.back()) steps += 1;
    expect(steps).toBe(99);
    expect(currentPayload(history)?.place).toBe('place-50');
  });

  test('clear resets the sequence', () => {
    const { history, contributor } = registeredHistory();
    record(history, contributor, 'first');
    record(history, contributor, 'second');
    history.clear();
    expect(history.size).toBe(0);
    expect(history.currentEntry).toBeNull();
    expect(history.canGoBack).toBe(false);
  });
});
