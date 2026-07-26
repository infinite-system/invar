import type { KeyEvent, StyledText } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref } from 'vue';
import type { ApplicationContributionCatalog } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';

class $ExtensionsPaneContent implements PaneContent {
  constructor(
    protected readonly iconGlyph: () => string,
    protected readonly contributions: ApplicationContributionCatalog,
    protected readonly requestRender: () => void,
  ) {}

  get selectedIndex() {
    return ref(0);
  }

  get id(): string {
    return 'extensions';
  }

  get title(): string {
    return 'Extensions';
  }

  get activityLabel(): string {
    return 'Extensions';
  }

  get icon(): string {
    return this.iconGlyph();
  }

  get activityAction(): string {
    return 'view.showExtensions';
  }

  get renderRevision() {
    return computed(
      () => `${this.contributions.revision.value}:${this.selectedIndex.value}`,
    );
  }

  render(context: PaneRenderContext): StyledText {
    const chunks = [fg(context.palette.fg)('\n   Extensions\n\n')];
    for (const [entryIndex, entry] of this.toggleableEntries.entries()) {
      const selected = entryIndex === this.selectedIndex.value;
      const marker = selected ? '›' : ' ';
      const state = entry.enabled ? '[x]' : '[ ]';
      const color = selected ? context.palette.accent : context.palette.fg;
      chunks.push(fg(color)(` ${marker} ${state} ${entry.name}\n`));
    }
    chunks.push(
      fg(context.palette.dim)('\n   Space/Enter installs or uninstalls\n'),
    );
    return new OpenTuiStyledText(chunks);
  }

  handleKey(key: KeyEvent): boolean {
    if (key.name === 'up' || key.name === 'down') {
      const rowDelta = key.name === 'up' ? -1 : 1;
      this.moveSelection(rowDelta);
      return true;
    }
    if (key.name === 'space' || key.name === 'return') {
      this.toggleSelected();
      return true;
    }
    return false;
  }

  protected get toggleableEntries() {
    return this.contributions.entries().filter((entry) => entry.canDisable);
  }

  protected moveSelection(rowDelta: number): void {
    const lastIndex = this.toggleableEntries.length - 1;
    this.selectedIndex.value = Math.max(
      0,
      Math.min(lastIndex, this.selectedIndex.value + rowDelta),
    );
    this.requestRender();
  }

  protected toggleSelected(): void {
    const entry = this.toggleableEntries[this.selectedIndex.value];
    if (!entry) return;
    this.contributions.setEnabled(entry.identifier, !entry.enabled);
    this.requestRender();
  }

  onPointerDown(_column: number, row: number): boolean {
    const entryIndex = row - 3;
    if (entryIndex < 0 || entryIndex >= this.toggleableEntries.length) {
      return false;
    }
    this.selectedIndex.value = entryIndex;
    this.toggleSelected();
    return true;
  }

  onResize(_columns: number, _rows: number): void {}

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}
}

export namespace ExtensionsPaneContent {
  export const $Class = $ExtensionsPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
