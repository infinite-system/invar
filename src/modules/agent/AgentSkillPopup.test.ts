import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { Files } from '../system/Files';
import {
  BoundedListPopup,
  type BoundedListPopupItem,
  type BoundedListPopupOpenOptions,
} from '../ui/BoundedListPopup';
import { WrapText } from '../ui/WrapText';
import { AgentSkillPopup } from './AgentSkillPopup';

class FakeBoundedListPopup {
  readonly open = ref(false);
  readonly paintRevision = ref(0);
  readonly items = ref<readonly BoundedListPopupItem[]>([]);
  readonly selectedIndex = ref(-1);
  filteredMatches: Array<{
    item: BoundedListPopupItem;
    sourceIndex: number;
    score: number;
  }> = [];
  geometry = null;
  lastOptions: BoundedListPopupOpenOptions | null = null;
  moveDirection: 1 | -1 | null = null;
  protected selectionHandler: ((item: BoundedListPopupItem) => void) | null =
    null;

  openAt(
    items: readonly BoundedListPopupItem[],
    _anchor: { column: number; row: number },
    selectionHandler: (item: BoundedListPopupItem) => void,
    options: BoundedListPopupOpenOptions,
  ): void {
    this.items.value = items;
    this.filteredMatches = items.map((item, sourceIndex) => ({
      item,
      sourceIndex,
      score: 0,
    }));
    this.selectedIndex.value = 0;
    this.selectionHandler = selectionHandler;
    this.lastOptions = options;
    this.open.value = true;
  }

  close(): void {
    this.open.value = false;
  }

  moveSelection(direction: 1 | -1): void {
    this.moveDirection = direction;
  }

  runSelected(): void {
    const item = this.items.value[this.selectedIndex.value];
    if (item) this.selectionHandler?.(item);
  }

  tick(): boolean {
    return false;
  }

  update(): void {}

  dispose(): void {
    this.close();
  }
}

let fakePopupForConstruction: FakeBoundedListPopup;

class TestAgentSkillPopup extends AgentSkillPopup.$Class {
  protected override createPopup(): BoundedListPopup.Model {
    return fakePopupForConstruction as unknown as BoundedListPopup.Model;
  }
}

function createPopup(
  columns = 100,
  rows = 40,
): {
  popup: TestAgentSkillPopup;
  fakePopup: FakeBoundedListPopup;
} {
  fakePopupForConstruction = new FakeBoundedListPopup();
  return {
    popup: new TestAgentSkillPopup({
      renderer: { width: columns, height: rows },
      settings: { scrollbarThickness: ref(1) },
    } as never),
    fakePopup: fakePopupForConstruction,
  };
}

describe('AgentSkillPopup', () => {
  test('adapts filtered workspace skills to the bounded popup', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-skill-popup-',
    );
    try {
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'ivue',
          'SKILL.md',
        ),
        [
          '---',
          'description: >-',
          '  Reactive substrate guidance',
          '  across model boundaries.',
          '---',
          'Use ivue.',
        ].join('\n'),
      );
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'review',
          'SKILL.md',
        ),
        'Review.',
      );
      const { popup, fakePopup } = createPopup();
      const accepted: string[] = [];
      const invocation = { prefix: 'iv', start: 0, end: 3 };

      popup.synchronize(
        'agent',
        workspaceRoot,
        invocation,
        { column: 8, row: 30 },
        (_acceptedInvocation, skillName) => accepted.push(skillName),
      );

      expect(popup.items.map((item) => item.identifier)).toEqual(['ivue']);
      expect(popup.items[0]?.label).toContain(
        'Reactive substrate guidance across model boundaries.',
      );
      expect(popup.items[0]?.label).not.toContain('>-');
      expect(fakePopup.lastOptions).toMatchObject({
        searchVisible: false,
        showBackdrop: false,
        itemsAlreadyFiltered: true,
        availableBottomExclusive: 30,
      });
      popup.moveSelection(1);
      expect(fakePopup.moveDirection).toBe(1);
      popup.runSelected();
      expect(accepted).toEqual(['ivue']);
      expect(popup.open.value).toBe(false);
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('ellipsizes only the description to the usable display-cell width', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-skill-ellipsis-',
    );
    try {
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'ivue',
          'SKILL.md',
        ),
        [
          '---',
          'description: |-',
          '  Wide 界界 glyphs and astral 🚀 characters continue through',
          '  a deliberately overlong description.',
          '---',
          'Use ivue.',
        ].join('\n'),
      );
      const { popup, fakePopup } = createPopup(30, 40);

      popup.synchronize(
        'agent',
        workspaceRoot,
        { prefix: '', start: 0, end: 1 },
        { column: 2, row: 20 },
        () => {},
      );

      const label = popup.items[0]?.label ?? '';
      expect(label.startsWith('/ivue  ')).toBe(true);
      expect(label.endsWith('…')).toBe(true);
      expect(label).not.toContain('\n');
      expect(label).not.toContain('|-');
      const geometry = BoundedListPopup.$Class.layoutGeometry({
        screenWidth: 30,
        screenHeight: 40,
        anchor: { column: 2, row: 20 },
        desiredBoxWidth: fakePopup.lastOptions?.minimumWidth ?? 0,
        itemCount: 1,
        searchVisible: false,
        iconColumns: 0,
        scrollbarThickness: 1,
        firstVisible: 0,
        availableBottomExclusive: 20,
      });
      expect(WrapText.Class.displayWidth(` ${label}`)).toBeLessThanOrEqual(
        geometry.listColumns,
      );
      expect(label).toContain('/ivue');
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('dismissal suppresses only the unchanged invocation', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-skill-dismiss-',
    );
    try {
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'ivue',
          'SKILL.md',
        ),
        'Use ivue.',
      );
      const { popup } = createPopup();
      const accept = () => {};
      popup.synchronize(
        'agent',
        workspaceRoot,
        { prefix: 'i', start: 0, end: 2 },
        { column: 1, row: 20 },
        accept,
      );
      popup.dismiss();
      popup.synchronize(
        'agent',
        workspaceRoot,
        { prefix: 'i', start: 0, end: 2 },
        { column: 1, row: 20 },
        accept,
      );
      expect(popup.open.value).toBe(false);

      popup.synchronize(
        'agent',
        workspaceRoot,
        { prefix: 'iv', start: 0, end: 3 },
        { column: 1, row: 20 },
        accept,
      );
      expect(popup.open.value).toBe(true);
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });
});
