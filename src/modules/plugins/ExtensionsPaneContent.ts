import type { KeyEvent, StyledText } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';

class $ExtensionsPaneContent implements PaneContent {
  constructor(protected readonly iconGlyph: () => string) {}

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
    return ref(0);
  }

  render(context: PaneRenderContext): StyledText {
    return new OpenTuiStyledText([
      fg(context.palette.fg)('\n   Extensions\n\n'),
      fg(context.palette.dim)('   Coming soon.\n'),
    ]);
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
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
