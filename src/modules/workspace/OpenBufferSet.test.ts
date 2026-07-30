import { test, expect, describe } from 'bun:test';
import { Reactive } from 'ivue';
import { Static } from 'ivue/extras';
import {
  OpenBufferSet,
  type LiveBuffer,
  type BufferPosition,
  type OpenBufferSetSeams,
} from './OpenBufferSet';
import type { DocumentHandle } from './DocumentHandle';

class $SingleHydratedDocumentOpenBufferSet extends OpenBufferSet.$Class {
  protected static override get MAXIMUM_RECENTLY_ACTIVE_HYDRATED_DOCUMENTS(): number {
    return 1;
  }
}

const SingleHydratedDocumentOpenBufferSetClass = Reactive(
  Static($SingleHydratedDocumentOpenBufferSet),
);

// A fake live buffer: records dispose, carries a mutable dirty flag + position.
class FakeBuffer implements LiveBuffer {
  disposed = false;
  dirty = false;
  protected position: BufferPosition = {
    cursorLine: 0,
    cursorColumn: 0,
    scrollTop: 0,
    scrollLeft: 0,
  };
  constructor(readonly path: string) {}
  openFile(): void {}
  snapshotPosition(): BufferPosition {
    return { ...this.position };
  }
  restorePosition(position: BufferPosition): void {
    this.position = { ...position };
  }
  setPosition(position: Partial<BufferPosition>): void {
    this.position = { ...this.position, ...position };
  }
}

function makeSet(singleHydratedDocument = false) {
  const created: FakeBuffer[] = [];
  const createdHandles: DocumentHandle.Model[] = [];
  const disposed: FakeBuffer[] = [];
  const seams: OpenBufferSetSeams = {
    createBuffer: (path, documentHandle) => {
      const buffer = new FakeBuffer(path);
      created.push(buffer);
      createdHandles.push(documentHandle);
      return buffer;
    },
    disposeBuffer: (buffer) => {
      (buffer as FakeBuffer).disposed = true;
      disposed.push(buffer as FakeBuffer);
    },
  };
  const set = singleHydratedDocument
    ? new SingleHydratedDocumentOpenBufferSetClass(seams)
    : new OpenBufferSet.Class(seams);
  return { set, created, createdHandles, disposed };
}

describe('open / focus', () => {
  test('opening adds tabs and activates; reopening focuses the existing tab', () => {
    const { set, created } = makeSet();
    set.open('a.ts');
    set.open('b.ts');
    set.open('c.ts');
    expect(set.count).toBe(3);
    expect(set.tabs().map((tab) => tab.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(set.tabs()[2]!.active).toBe(true);
    const index = set.open('a.ts'); // reopen -> focus the EXISTING tab (no new entry)
    expect(index).toBe(0);
    expect(set.count).toBe(3); // no duplicate tab
    expect(set.tabs()[0]!.active).toBe(true);
    void created;
  });
});

describe('flyweight: N tabs are NOT N live documents', () => {
  test('only the bounded recent set stays live; older clean tabs dehydrate + dispose', () => {
    const { set, created, disposed } = makeSet();
    for (const path of ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']) set.open(path);
    // Five tabs retain only the two-document compare-and-edit working set.
    expect(set.count).toBe(5);
    expect(set.liveCount).toBe(2);
    expect(disposed.length).toBe(3);
    expect(created.length).toBe(5);
  });

  test('activation rehydrates and restores the saved position', () => {
    const { set, created } = makeSet();
    set.open('a.ts');
    (set.activeBuffer as FakeBuffer).setPosition({
      cursorLine: 42,
      scrollTop: 30,
    });
    set.open('b.ts');
    set.open('c.ts'); // a.ts leaves the two-document window -> snapshot + dispose
    expect(set.liveCount).toBe(2);
    set.activate(0); // rehydrate a.ts
    const rehydrated = created[created.length - 1] as FakeBuffer;
    expect(rehydrated.snapshotPosition().cursorLine).toBe(42);
    expect(rehydrated.snapshotPosition().scrollTop).toBe(30);
  });

  test('document fold state survives rehydration and is dropped on close', () => {
    const { set, createdHandles } = makeSet();
    set.open('a.ts');
    const firstHandle = createdHandles.at(-1);
    expect(firstHandle).toBeDefined();
    firstHandle?.foldState.collapsedLineStarts.add(4);

    set.open('b.ts');
    set.open('c.ts');
    set.activate(0);
    expect(createdHandles.at(-1)).toBe(firstHandle);
    expect(createdHandles.at(-1)?.foldState.collapsedLineStarts.has(4)).toBe(
      true,
    );

    set.close(0);
    set.open('a.ts');
    const reopenedHandle = createdHandles.at(-1);
    expect(reopenedHandle).not.toBe(firstHandle);
    expect(reopenedHandle?.foldState.collapsedLineStarts.size).toBe(0);
  });

  test('a DIRTY background buffer is retained (never dehydrated — edits must survive)', () => {
    const { set } = makeSet();
    set.open('a.ts');
    (set.activeBuffer as FakeBuffer).dirty = true;
    set.syncActiveDirty();
    set.open('b.ts');
    set.open('c.ts'); // a.ts leaves the recent window but stays live because it is dirty
    expect(set.liveCount).toBe(3); // recent b/c + dirty-retained a
    expect(set.tabs()[0]!.dirty).toBe(true);
  });

  test('recent switch cycles perform zero full-document reads at small and large scale', () => {
    const fullDocumentReadCounts: number[] = [];
    for (const documentLineCount of [10, 500_000]) {
      const { set, created } = makeSet();
      set.open(`first-${documentLineCount}.txt`);
      set.open(`second-${documentLineCount}.txt`);
      const fullDocumentReadCountBeforeSwitchCycles = created.length;
      for (let switchIndex = 0; switchIndex < 6; switchIndex++) {
        set.cycle(1);
      }
      fullDocumentReadCounts.push(
        created.length - fullDocumentReadCountBeforeSwitchCycles,
      );
    }
    expect(fullDocumentReadCounts).toEqual([0, 0]);
  });

  test('reload counter detects the one-document dehydration defect', () => {
    const { set, created } = makeSet(true);
    set.open('first-500000.txt');
    set.open('second-500000.txt');
    const fullDocumentReadCountBeforeSwitchCycles = created.length;
    for (let switchIndex = 0; switchIndex < 6; switchIndex++) {
      set.cycle(1);
    }
    expect(created.length - fullDocumentReadCountBeforeSwitchCycles).toBe(6);
  });
});

describe('close disposes', () => {
  test('closing a tab disposes its live buffer and activates a neighbour', () => {
    const { set, disposed } = makeSet();
    set.open('a.ts');
    set.open('b.ts');
    const activeBuffer = set.activeBuffer as FakeBuffer;
    set.close(1); // close active b
    expect(activeBuffer.disposed).toBe(true);
    expect(set.count).toBe(1);
    expect(set.tabs()[0]!.path).toBe('a.ts');
    expect(set.tabs()[0]!.active).toBe(true);
    expect(set.activeBuffer).not.toBeNull(); // neighbour rehydrated
    void disposed;
  });

  test('disposeAll releases every live buffer', () => {
    const { set } = makeSet();
    set.open('a.ts');
    (set.activeBuffer as FakeBuffer).dirty = true;
    set.syncActiveDirty();
    set.open('b.ts'); // now 2 live (dirty a + active b)
    expect(set.liveCount).toBe(2);
    set.disposeAll();
    expect(set.liveCount).toBe(0);
    expect(set.count).toBe(0);
  });
});

describe('cycle', () => {
  test('wraps forward and backward', () => {
    const { set } = makeSet();
    for (const path of ['a.ts', 'b.ts', 'c.ts']) set.open(path);
    expect(set.activeIndex.value).toBe(2);
    set.cycle(1); // wrap to 0
    expect(set.activeIndex.value).toBe(0);
    set.cycle(-1); // wrap to 2
    expect(set.activeIndex.value).toBe(2);
  });
});

describe('document ledger: what each tab actually retains', () => {
  /** A stand-in document carrying only the two facts the ledger reads. */
  function fakeDocument(textUnits: number, lineCount: number) {
    return { contentLength: textUnits, lineCount } as never;
  }

  function makeAttachingSet() {
    const documentsByPath = new Map<string, unknown>([
      ['a.ts', fakeDocument(1_000, 40)],
      ['b.ts', fakeDocument(2_500, 90)],
      ['c.ts', fakeDocument(9_000, 300)],
    ]);
    const seams: OpenBufferSetSeams = {
      createBuffer: (path) => new FakeBuffer(path),
      disposeBuffer: () => {},
      opened: (handle, buffer) => {
        handle.attach(
          documentsByPath.get((buffer as FakeBuffer).path) as never,
        );
      },
      closed: (handle, buffer) => {
        handle.detach(
          documentsByPath.get((buffer as FakeBuffer).path) as never,
        );
      },
    };
    return new OpenBufferSet.Class(seams);
  }

  test('a hydrated tab reports its retained text units; a cold tab reports none', () => {
    const set = makeAttachingSet();
    set.open('a.ts');
    set.open('b.ts');
    set.open('c.ts');
    const ledger = set.documentLedger();
    expect(ledger.length).toBe(3);
    expect(ledger.map((row) => row.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    // The two-document recent window is what stays live; the oldest tab is cold.
    expect(ledger.map((row) => row.hydrated)).toEqual([false, true, true]);
    expect(ledger.map((row) => row.retainedTextUnits)).toEqual([
      0, 2_500, 9_000,
    ]);
    expect(ledger.map((row) => row.retainedLineCount)).toEqual([0, 90, 300]);
    expect(ledger.filter((row) => row.active).length).toBe(1);
  });

  test('retained units do not grow with tab count, which is the bounded-cache claim', () => {
    const set = makeAttachingSet();
    set.open('a.ts');
    const afterOne = set
      .documentLedger()
      .reduce((total, row) => total + row.retainedTextUnits, 0);
    set.open('b.ts');
    set.open('c.ts');
    set.open('a.ts');
    set.open('b.ts');
    set.open('c.ts');
    const afterMany = set
      .documentLedger()
      .reduce((total, row) => total + row.retainedTextUnits, 0);
    expect(set.count).toBe(3);
    expect(set.liveCount).toBe(2);
    expect(afterOne).toBe(1_000);
    // Six activations over three tabs still retain exactly the two-document window.
    expect(afterMany).toBe(11_500);
  });

  test('closing a tab removes its row and its retained units', () => {
    const set = makeAttachingSet();
    set.open('a.ts');
    set.open('b.ts');
    set.close(1);
    set.close(0);
    expect(set.documentLedger()).toEqual([]);
  });
});
