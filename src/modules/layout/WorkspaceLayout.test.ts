import { expect, test } from 'bun:test';
import { WorkspaceLayout } from './WorkspaceLayout';
import type { WorkspaceLayoutSlotValues } from './WorkspaceLayoutSlotPorts.interface';

const applicationDefaults: WorkspaceLayoutSlotValues = {
  primaryDockVisible: true,
  primaryDockColumns: 32,
  rightDockVisible: false,
  rightDockColumns: 28,
  rightDockContentIdentifier: 'structure',
  bottomPanelRows: 16,
};

/** A stand-in for the running application's live slots. */
function createLiveSlots(
  initial: WorkspaceLayoutSlotValues = {
    ...applicationDefaults,
  },
) {
  let live: WorkspaceLayoutSlotValues = { ...initial };
  return {
    get values(): WorkspaceLayoutSlotValues {
      return live;
    },
    set values(next: WorkspaceLayoutSlotValues) {
      live = { ...next };
    },
    ports: {
      readSlots: (): WorkspaceLayoutSlotValues => ({ ...live }),
      applySlots: (values: WorkspaceLayoutSlotValues): void => {
        live = { ...values };
      },
    },
  };
}

test('an opened workspace starts at the application defaults, not the live slots', () => {
  const liveSlots = createLiveSlots({
    ...applicationDefaults,
    primaryDockColumns: 60,
    rightDockVisible: true,
  });
  const layout = new WorkspaceLayout.Class(
    liveSlots.ports,
    () => ({ ...applicationDefaults }),
    () => true,
  );
  layout.opened('/projects/second');
  expect(liveSlots.values.primaryDockColumns).toBe(32);
  expect(liveSlots.values.rightDockVisible).toBe(false);
});

test('a hidden workspace keeps its own slots and puts them back on return', () => {
  const liveSlots = createLiveSlots();
  const layout = new WorkspaceLayout.Class(
    liveSlots.ports,
    () => ({ ...applicationDefaults }),
    () => true,
  );
  layout.opened('/projects/first');
  liveSlots.values = {
    ...applicationDefaults,
    primaryDockColumns: 48,
    rightDockVisible: true,
    rightDockContentIdentifier: 'tasks',
    bottomPanelRows: 25,
  };
  layout.suspended();
  // Another workspace takes the screen and drags everything somewhere else.
  liveSlots.values = { ...applicationDefaults, primaryDockColumns: 12 };
  layout.resumed();
  expect(liveSlots.values.primaryDockColumns).toBe(48);
  expect(liveSlots.values.rightDockVisible).toBe(true);
  expect(liveSlots.values.rightDockContentIdentifier).toBe('tasks');
  expect(liveSlots.values.bottomPanelRows).toBe(25);
});

test('an inactive workspace never applies or captures the live slots', () => {
  const liveSlots = createLiveSlots({
    ...applicationDefaults,
    primaryDockColumns: 60,
  });
  // Late registration: the contributor attaches to a workspace that is NOT the one on screen.
  const layout = new WorkspaceLayout.Class(
    liveSlots.ports,
    () => ({ ...applicationDefaults }),
    () => false,
  );
  layout.opened('/projects/hidden');
  expect(liveSlots.values.primaryDockColumns).toBe(60);
  layout.suspended();
  expect(layout.slots?.primaryDockColumns).toBe(32);
});

test('a workspace that was never suspended still restores its opening slots', () => {
  const liveSlots = createLiveSlots();
  const layout = new WorkspaceLayout.Class(
    liveSlots.ports,
    () => ({ ...applicationDefaults, primaryDockColumns: 40 }),
    () => true,
  );
  layout.opened('/projects/first');
  liveSlots.values = { ...applicationDefaults, primaryDockColumns: 8 };
  layout.resumed();
  expect(liveSlots.values.primaryDockColumns).toBe(40);
});
