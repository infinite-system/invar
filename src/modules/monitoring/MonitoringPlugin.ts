// Invar Monitoring: the app observing itself from the inside, as an ordinary contribution.
//
// It registers one dock pane, its commands, its keybindings, its contributed settings, and one
// status projection, through the same `ApplicationContributionContext` seams the Tasks Dashboard
// uses. It edits no host file of its own. Disabling it in the Extensions pane stops the sampling
// clock and withdraws all of it.
//
// MONITORING IS APP-GLOBAL, NOT PER-WORKSPACE. Processor time, resident set, and heap belong to the
// process, and the process is one however many workspaces are open. So this is an application
// contributor with no workspace contributor: one shared reading, projected into whichever dock the
// reader is looking at. The document ledger names each row's workspace instead of splitting the
// model into one reading per workspace, which would double-count the same process.
//
// invariant: The monitor is a pane content citizen (src/modules/monitoring/monitoring.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
// invariant: The host canvas is complete without plugins (project.invariants.md)
// invariant: Plugin boundaries grant one authority (project.invariants.md)
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  ApplicationContributionContext,
  ApplicationContributor,
  RegisteredDockContent,
} from '../app/ApplicationContributor.interface';
import type { StatusSnapshot } from '../system/StatusChannel';
import { MonitoringPaneContent } from './MonitoringPaneContent';
import { MonitoringStats } from './MonitoringStats';
import type { MonitoredWorkspaceLedger } from './MonitoringStats';

class $MonitoringPlugin implements ApplicationContributor {
  readonly identifier = 'monitoring';
  readonly name = 'Invar Monitoring';
  protected application: ApplicationContributionContext | null = null;
  protected stats: MonitoringStats.Model | null = null;
  protected paneContent: MonitoringPaneContent.Model | null = null;
  protected disposeCommands: (() => void) | null = null;
  protected disposeStatusProjection: (() => void) | null = null;
  protected dockContent: RegisteredDockContent | null = null;
  protected readLoggingEnabled: () => boolean = () => false;

  /** Where sample lines land, relative to the active workspace root. */
  protected static get LOG_FILE_RELATIVE_PATH(): string {
    return '.invar/monitoring-samples.jsonl';
  }

  /** An explicit override, so a driven run writes into its own fixture rather than a real project. */
  protected static get LOG_PATH_ENVIRONMENT_NAME(): string {
    return 'INVAR_MONITORING_LOG_PATH';
  }

  activateApplication(context: ApplicationContributionContext): void {
    this.application = context;
    context.registerKeybindings([
      {
        // Ctrl+Shift+M belongs to terminal-follow, and Ctrl+I/Ctrl+M/Ctrl+K collapse onto
        // control codes or a multi-step prefix when a terminal drops the shift.
        chord: { key: 'n', ctrl: true, shift: true },
        action: 'view.showMonitoring',
      },
      {
        chord: { key: 'l' },
        action: 'monitoring.toggleLogging',
        context: 'monitoring',
      },
      {
        chord: { key: 'c' },
        action: 'monitoring.heapCensus',
        context: 'monitoring',
      },
    ]);
    const sampleSecondsSetting = context.registerSetting({
      identifier: 'monitoringSampleSeconds',
      label: 'Sample interval seconds',
      section: this.name,
      defaultValue: 1,
      spec: { kind: 'number', step: 1, minimum: 1, maximum: 60, decimals: 0 },
    });
    const loggingSetting = context.registerSetting({
      identifier: 'monitoringLogging',
      label: 'Write samples to a log file',
      section: this.name,
      defaultValue: false,
      spec: { kind: 'boolean' },
      changed: () => this.applyLoggingSetting(),
    });
    this.readLoggingEnabled = () => loggingSetting.value.value;
    this.stats = this.createStats(
      context,
      () => sampleSecondsSetting.value.value,
    );
    this.paneContent = this.createPaneContent(
      context,
      () => sampleSecondsSetting.value.value,
    );
    this.dockContent = context.registerDockContent({
      content: this.paneContent,
      settingIdentifier: 'monitoring.dockSide',
      settingLabel: 'Dock side',
      section: this.name,
      suggestedSide: 'right',
    });
    this.requireStats().startObservation();
    this.applyLoggingSetting();
    this.registerCommands(context);
    this.disposeStatusProjection =
      context.statusProjectionContributions.register({
        snapshot: () => this.statusSnapshot(),
      });
  }

  // invariant: Construction goes through overridable seams (project.invariants.md)
  protected createStats(
    context: ApplicationContributionContext,
    sampleIntervalSeconds: () => number,
  ): MonitoringStats.Model {
    return new MonitoringStats.Class({
      isObserved: () => this.paneIsObserved(),
      requestRender: () => context.requestRender(),
      sampleIntervalSeconds,
      workspaceLedgers: () => this.workspaceLedgers(),
      logFilePath: () => this.logFilePath(),
      ownIdentifier: () => this.identifier,
    });
  }

  protected createPaneContent(
    context: ApplicationContributionContext,
    sampleIntervalSeconds: () => number,
  ): MonitoringPaneContent.Model {
    return new MonitoringPaneContent.Class(
      context,
      this.requireStats(),
      sampleIntervalSeconds,
    );
  }

  /** Every open workspace's retained-document rows, read from each workspace's own buffer set. */
  protected workspaceLedgers(): readonly MonitoredWorkspaceLedger[] {
    const application = this.application;
    if (!application) return [];
    return application.workspaceSet.entries.value.map((workspace) => ({
      root: workspace.root,
      rows: workspace.buffers.documentLedger(),
    }));
  }

  /**
   * Where a sample line lands. This answers only WHERE, never WHETHER: the stats model owns the
   * on/off state, so the command toggle and the contributed setting reach the file through the same
   * one switch. Gating here as well made the command flip a state that could never write.
   */
  protected logFilePath(): string | null {
    const application = this.application;
    if (!application) return null;
    const override =
      process.env[$MonitoringPlugin.LOG_PATH_ENVIRONMENT_NAME] ?? '';
    if (override.length > 0) return override;
    const logPath = join(
      application.workspaceSet.active.root,
      $MonitoringPlugin.LOG_FILE_RELATIVE_PATH,
    );
    mkdirSync(dirname(logPath), { recursive: true });
    return logPath;
  }

  protected applyLoggingSetting(): void {
    const stats = this.stats;
    if (!stats) return;
    if (stats.logging.value !== this.readLoggingEnabled())
      stats.toggleLogging();
  }

  /** True while the monitoring pane is on screen. Hidden means no timer and no sample. */
  protected paneIsObserved(): boolean {
    return this.dockContent?.isPainted() ?? false;
  }

  protected requireDockContent(): RegisteredDockContent {
    const dockContent = this.dockContent;
    if (!dockContent) {
      throw new Error('Monitoring dock content is not registered');
    }
    return dockContent;
  }

  protected requireStats(): MonitoringStats.Model {
    const stats = this.stats;
    if (!stats) {
      throw new Error('Monitoring application contribution is not active');
    }
    return stats;
  }

  protected registerCommands(context: ApplicationContributionContext): void {
    this.disposeCommands = context.commands.registerAll([
      {
        id: 'view.showMonitoring',
        title: 'View: Show Monitoring',
        category: 'View',
        run: () => {
          context.workspaceSet.active.focusEditor();
          this.requireDockContent().show();
        },
      },
      {
        id: 'monitoring.toggleLogging',
        title: 'Monitoring: Toggle Sample Logging',
        category: 'Monitoring',
        run: () => this.requireStats().toggleLogging(),
      },
      {
        id: 'monitoring.heapCensus',
        title: 'Monitoring: Heap Census',
        category: 'Monitoring',
        run: () => void this.requireStats().takeCensus(),
      },
    ]);
  }

  disposeApplication(): void {
    this.paneContent = null;
    this.stats?.dispose();
    this.stats = null;
    this.disposeCommands?.();
    this.disposeCommands = null;
    this.disposeStatusProjection?.();
    this.disposeStatusProjection = null;
    this.dockContent = null;
    this.readLoggingEnabled = () => false;
    this.application = null;
  }

  protected statusSnapshot(): Partial<StatusSnapshot> {
    const stats = this.stats;
    if (!stats) return {};
    return {
      monitoringObserved: this.paneIsObserved(),
      monitoringSamplingAtRest: stats.samplingAtRest(),
      monitoringSampleCount: stats.sampleCount.value,
      monitoringSampleCostMilliseconds: Number(
        stats.sampleCostMilliseconds.value.toFixed(3),
      ),
      monitoringProcessorPercent: Number(
        stats.processorPercent.value.toFixed(2),
      ),
      monitoringResidentSetBytes: stats.sample.value?.residentSetBytes ?? 0,
      monitoringHeapUsedBytes: stats.sample.value?.heapUsedBytes ?? 0,
      monitoringOpenDocumentCount: stats.documentRows.value.length,
      monitoringHydratedDocumentCount: stats.hydratedDocumentCount,
      monitoringDehydratedDocumentCount: stats.dehydratedDocumentCount,
      monitoringRetainedDocumentBytes: stats.retainedDocumentBytes,
      monitoringRenderRequestsSinceOpen: stats.renderRequestsSinceOpen,
      monitoringOwnRenderRequestsSinceOpen: stats.ownRenderRequestsSinceOpen,
      monitoringRenderRequestsByPlugin: stats.renderRequestsByOwnerSinceOpen,
      monitoringStrayCandidate: stats.strayCandidate()?.ownerIdentifier ?? null,
      monitoringLogging: stats.logging.value,
      monitoringLogLineCount: stats.logLineCount.value,
      monitoringCensusCount: stats.censusCount.value,
      monitoringCensusLiveHeapBytes: stats.census.value?.liveHeapBytes ?? null,
      monitoringCensusCapacityBytes:
        stats.census.value?.heapCapacityBytes ?? null,
      monitoringCensusResidentSetAfterBytes:
        stats.census.value?.residentSetAfterBytes ?? null,
      monitoringCensusCostMilliseconds:
        stats.census.value === null
          ? null
          : Number(stats.census.value.costMilliseconds.toFixed(1)),
    };
  }
}

export namespace MonitoringPlugin {
  export const $Class = $MonitoringPlugin;
  export let Class = $MonitoringPlugin;
  export type Model = InstanceType<typeof Class>;
}
