import type { KeyEvent, StyledText } from '@opentui/core';
import { StyledText as OpenTuiStyledText, fg } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import { ThemeIcons } from '../theme/ThemeIcons';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import type { DatabaseConsumerWorkspace } from './DatabaseConsumerWorkspace';

class $DatabasePaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly activeWorkspace: () => DatabaseConsumerWorkspace.Model,
  ) {}

  get id(): string {
    return 'database';
  }

  get title(): string {
    return 'Database';
  }

  get activityLabel(): string {
    return 'Database';
  }

  get icon(): string {
    return ThemeIcons.Class.symbolMarkFor(
      this.application.theme.glyphLevel.value,
      'module',
    );
  }

  get activityAction(): string {
    return 'view.showDatabase';
  }

  get keybindingContext(): string {
    return 'database';
  }

  get renderRevision() {
    return computed(() => this.readRenderRevision());
  }

  protected readRenderRevision(): string {
    void this.application.workspaceSet.activeWorkspaceIndex.value;
    const workspace = this.activeWorkspace();
    return `${workspace.version.value}:${workspace.status.value}`;
  }

  render(context: PaneRenderContext): StyledText {
    const workspace = this.activeWorkspace();
    const chunks = [fg(context.palette.fg)('\n   Database\n\n')];
    if (workspace.status.value === 'idle') {
      chunks.push(fg(context.palette.dim)('   Open this pane to connect.\n'));
    } else if (workspace.status.value === 'loading') {
      chunks.push(fg(context.palette.dim)('   Connecting to provider…\n'));
    } else if (workspace.status.value === 'unavailable') {
      chunks.push(
        fg(context.palette.dim)('   No database provider is installed.\n'),
      );
    } else if (workspace.status.value === 'error') {
      chunks.push(
        fg(context.palette.error)(
          `   Provider error: ${workspace.failure.value ?? 'unknown'}\n`,
        ),
      );
    } else {
      chunks.push(
        fg(context.palette.accent)(
          `   Provider: ${workspace.providerIdentifier.value ?? 'unknown'}\n`,
        ),
        fg(context.palette.fg)(
          `   Query value: ${workspace.queryValue.value ?? 'none'}\n`,
        ),
        fg(context.palette.fg)(
          `   Schema: ${
            workspace.descriptions.value
              .map((entry) => entry.name)
              .join(', ') || 'empty'
          }\n`,
        ),
      );
    }
    return new OpenTuiStyledText(chunks);
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onResize(_columns: number, _rows: number): void {}

  onFocus(): void {
    this.application.workspaceSet.active.focusPrimaryPane('database');
    void this.activeWorkspace().refresh();
  }

  onBlur(): void {}

  dispose(): void {}
}

export namespace DatabasePaneContent {
  export const $Class = $DatabasePaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
