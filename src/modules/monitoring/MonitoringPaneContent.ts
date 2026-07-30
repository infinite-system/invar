// The monitoring pane as a bottom-panel content citizen: the host paints the StyledText this
// returns. It owns no renderable, no clock, and no state beyond the scroll offset — every number
// comes from the one stats model.
//
// invariant: A pane content projects through exactly one surface (src/modules/ui/ui.invariants.md)
// invariant: Plugin panes use the shared pane and popup hosts (src/modules/ui/ui.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: The monitor is a pane content citizen (src/modules/monitoring/monitoring.invariants.md)
import type { KeyEvent, StyledText } from '@opentui/core';
import { Reactive } from 'ivue';
import { computed, ref } from 'vue';
import type { ApplicationContributionContext } from '../app/ApplicationContributor.interface';
import type {
  PaneContent,
  PaneRenderContext,
} from '../ui/PaneContent.interface';
import { MonitoringPaneRenderer } from './MonitoringPaneRenderer';
import type { MonitoringStats } from './MonitoringStats';

class $MonitoringPaneContent implements PaneContent {
  constructor(
    protected readonly application: ApplicationContributionContext,
    protected readonly stats: MonitoringStats.Model,
    protected readonly sampleIntervalSeconds: () => number,
  ) {}

  get id(): string {
    return 'monitoring';
  }

  get title(): string {
    return 'Monitoring';
  }

  get activityLabel(): string {
    return 'Monitoring';
  }

  get activityAction(): string {
    return 'view.showMonitoring';
  }

  get keybindingContext(): string {
    return 'monitoring';
  }

  get renderRevision() {
    return computed(() => this.stats.version.value);
  }

  protected get paneScrollTop() {
    return ref(0);
  }

  protected get paneRows() {
    return ref(1);
  }

  protected get paneColumns() {
    return ref(1);
  }

  render(context: PaneRenderContext): StyledText {
    return MonitoringPaneRenderer.Class.render({
      palette: context.palette,
      width: Math.max(1, context.width),
      height: Math.max(1, context.height),
      sample: this.stats.sample.value,
      processorPercent: this.stats.processorPercent.value,
      census: this.stats.census.value,
      documentRows: this.stats.documentRows.value,
      retainedDocumentBytes: this.stats.retainedDocumentBytes,
      renderLoadRows: this.stats.renderLoadRows.value,
      renderRequestsSinceOpen: this.stats.renderRequestsSinceOpen,
      sampleIntervalSeconds: this.sampleIntervalSeconds(),
      sampleCount: this.stats.sampleCount.value,
      sampleCostMilliseconds: this.stats.sampleCostMilliseconds.value,
      logging: this.stats.logging.value,
      logLineCount: this.stats.logLineCount.value,
    });
  }

  handleKey(_key: KeyEvent): boolean {
    return false;
  }

  onResize(columns: number, rows: number): void {
    this.paneColumns.value = Math.max(1, columns);
    this.paneRows.value = Math.max(1, rows);
  }

  onFocus(): void {}

  onBlur(): void {}

  dispose(): void {}
}

export namespace MonitoringPaneContent {
  export const $Class = $MonitoringPaneContent;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
