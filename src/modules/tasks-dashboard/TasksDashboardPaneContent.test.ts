import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { ThemePalettes } from '../theme/ThemePalettes';
import { TasksDashboardOverview } from './TasksDashboardOverview';
import { TasksDashboardPaneContent } from './TasksDashboardPaneContent';

function makeWorkspaceRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tasks-dashboard-pane-'));
  for (const folder of ['901-planted-one', '902-planted-two']) {
    const folderPath = join(root, '.invar', 'tasks', 'in-progress', folder);
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      join(folderPath, `task-${folder}.md`),
      '# planted\n\nState: IN-PROGRESS\n\n## Outline\n' +
        'body line\n'.repeat(30),
    );
  }
  return root;
}

function makeFixture() {
  const root = makeWorkspaceRoot();
  const blurCount = { value: 0 };
  const openCount = { value: 0 };
  const overview = new TasksDashboardOverview.Class({
    workspaceRoot: () => root,
    isObserved: () => true,
    requestRender: () => {},
    cycleSeconds: () => 10,
  });
  const application = {
    theme: { glyphLevel: ref('unicode') },
    settings: { scrollbarThickness: ref(1) },
    rightDockHost: {
      blur: () => {
        blurCount.value += 1;
      },
    },
    requestRender: () => {},
  } as never as ApplicationContributionContext;
  const pane = new TasksDashboardPaneContent.Class(
    application,
    overview,
    () => {
      openCount.value += 1;
      return true;
    },
  );
  return {
    root,
    overview,
    pane,
    blurCount,
    openCount,
    dispose: () => {
      overview.dispose();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function renderedText(styled: { chunks: unknown }): string {
  return (styled.chunks as { text: string }[])
    .map((chunk) => chunk.text)
    .join('');
}

test('the pane renders the lens rows and its revision moves with every model change', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  const revisionBefore = pane.renderRevision.value;
  const rendered = renderedText(
    pane.render({
      width: 60,
      height: 10,
      palette: ThemePalettes.Class.DARK,
      glyphLevel: 'unicode',
      colorDepth: 'truecolor',
      focused: false,
    }),
  );
  expect(rendered).toContain('#902');
  expect(rendered).toContain('#901');
  overview.setLens('done');
  expect(pane.renderRevision.value).not.toBe(revisionBefore);
  fixture.dispose();
});

test('a pointer-down on a body row selects the task and opens it, blurring the dock', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(60, 10);
  // Screen row 0 is the tab line; row 2 is the second lens row (#901).
  expect(pane.onPointerDown(5, 2)).toBe(true);
  expect(overview.selectedIndex.value).toBe(1);
  expect(fixture.openCount.value).toBe(1);
  expect(fixture.blurCount.value).toBe(1);
  fixture.dispose();
});

test('a pointer-down on the tab line switches the lens without opening anything', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  expect(pane.onPointerDown(16, 0)).toBe(true); // the DONE label's columns
  expect(overview.lens.value).toBe('done');
  expect(fixture.openCount.value).toBe(0);
  fixture.dispose();
});

test('hover tracks only task rows and clears on pointer-out', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(60, 10);
  pane.onPointerMove(5, 1);
  expect(overview.hoveredIndex.value).toBe(0);
  pane.onPointerMove(5, 9);
  expect(overview.hoveredIndex.value).toBe(-1);
  pane.onPointerMove(5, 1);
  pane.onPointerOut();
  expect(overview.hoveredIndex.value).toBe(-1);
  fixture.dispose();
});

test('resize reserves the tab line row from the scroll viewport', () => {
  const fixture = makeFixture();
  const { pane, overview } = fixture;
  pane.onResize(40, 12);
  expect(overview.viewportHeight.value).toBe(11);
  expect(overview.viewportWidth.value).toBe(39);
  expect(pane.scrollbarRowOffset).toBe(1);
  fixture.dispose();
});
