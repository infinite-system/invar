import type { KeyEvent, StyledText } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type {
  PaneContent,
  PaneContentSpace,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import { WrapText } from '../ui/WrapText';
import type { TaskPanelNoticeRequest } from './TaskLauncher';

// invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
// invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
class $TaskNoticePaneContent implements PaneContent {
  constructor(
    protected readonly notice: TaskPanelNoticeRequest,
    readonly panelSpace?: PaneContentSpace,
  ) {}

  get renderRevision() {
    return ref(0);
  }

  get id(): string {
    return this.notice.identifier;
  }

  get kind(): string {
    return 'task-notice';
  }

  get instanceLabel(): string {
    return this.notice.label;
  }

  get title(): string {
    return this.notice.label;
  }

  render(context: PaneRenderContext): StyledText {
    const severityLabel =
      this.notice.severity === 'warning' ? 'Warning' : 'Error';
    const severityColor = context.palette[this.notice.severity];
    const label = WrapText.Class.wrap(
      this.notice.label,
      Math.max(1, context.width - 6),
    )
      .map((line) => `   ${line}\n`)
      .join('');
    const message = WrapText.Class.wrap(
      this.notice.message,
      Math.max(1, context.width - 6),
    )
      .map((line) => `   ${line}\n`)
      .join('');
    return new OpenTuiStyledText([
      fg(severityColor)(`\n   ${severityLabel}\n\n${label}\n`),
      fg(context.palette.fg)(message),
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

export namespace TaskNoticePaneContent {
  export const $Class = $TaskNoticePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
