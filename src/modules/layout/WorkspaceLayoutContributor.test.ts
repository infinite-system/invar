import { expect, test } from 'bun:test';
import type { Workspace } from '../workspace/Workspace';
import { WorkspaceLayoutContributor } from './WorkspaceLayoutContributor';
import type { WorkspaceLayoutSlotValues } from './WorkspaceLayoutSlotPorts.interface';

const applicationDefaults: WorkspaceLayoutSlotValues = {
  primaryDockVisible: true,
  primaryDockColumns: 32,
  rightDockVisible: false,
  rightDockColumns: 28,
  rightDockContentIdentifier: 'structure',
  bottomPanelRows: 16,
};

function createContributor(activeWorkspace: () => Workspace.Model | null) {
  let live: WorkspaceLayoutSlotValues = { ...applicationDefaults };
  const contributor = new WorkspaceLayoutContributor.Class({
    workspaceIsActive: (workspace) => activeWorkspace() === workspace,
    ports: {
      readSlots: () => ({ ...live }),
      applySlots: (values) => {
        live = { ...values };
      },
    },
  });
  return {
    contributor,
    get live(): WorkspaceLayoutSlotValues {
      return live;
    },
    set live(next: WorkspaceLayoutSlotValues) {
      live = { ...next };
    },
  };
}

/** Two stand-in workspaces; the contributor only ever compares identity. */
const firstWorkspace = {} as Workspace.Model;
const secondWorkspace = {} as Workspace.Model;

test('each attached workspace gets its own contribution', () => {
  const host = createContributor(() => firstWorkspace);
  const first = host.contributor.attachWorkspace(firstWorkspace);
  const second = host.contributor.attachWorkspace(secondWorkspace);
  expect(first).not.toBe(second);
});

test('the defaults a new workspace starts at are captured once, not read live', () => {
  let active: Workspace.Model | null = firstWorkspace;
  const host = createContributor(() => active);
  const first = host.contributor.attachWorkspace(firstWorkspace);
  first.opened('/projects/first');

  // The user drags the first workspace much wider. That is this workspace's geometry, never the
  // width the next workspace should be born at.
  host.live = { ...applicationDefaults, primaryDockColumns: 64 };
  first.suspended();

  active = secondWorkspace;
  const second = host.contributor.attachWorkspace(secondWorkspace);
  second.opened('/projects/second');
  expect(host.live.primaryDockColumns).toBe(32);

  // Positive control: the same sequence with the defaults read LIVE would publish 64 here.
  expect(host.live.primaryDockColumns).not.toBe(64);
});

test('returning to the first workspace restores the width it was dragged to', () => {
  let active: Workspace.Model | null = firstWorkspace;
  const host = createContributor(() => active);
  const first = host.contributor.attachWorkspace(firstWorkspace);
  first.opened('/projects/first');
  host.live = { ...applicationDefaults, primaryDockColumns: 64 };
  first.suspended();

  active = secondWorkspace;
  const second = host.contributor.attachWorkspace(secondWorkspace);
  second.opened('/projects/second');
  second.suspended();

  active = firstWorkspace;
  first.resumed();
  expect(host.live.primaryDockColumns).toBe(64);
});
