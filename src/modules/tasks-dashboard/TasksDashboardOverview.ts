// The tasks dashboard model: the three CLI lenses (LIVE / ACTIVE / DONE) as reactive rows, plus
// the selection, the optional cycling overview, and the honest absent-tree state the pane paints.
//
// THE CLI LENSES ARE THE PRIMITIVE. Every task fact here comes from the exported readers of
// `scripts/tasks/tasks-status.ts` — readTaskRecords, builderStanding, startedAtMilliseconds,
// landingStamp, agentIdentity, PRIORITY_ORDER, tasksTreeStamp. This module re-implements no
// reader; it adds only what a pane can do that a terminal cannot: ivue reactivity, selection,
// and opening the record files in the editor.
//
// COST TRACKS WHAT IS OBSERVED. A hidden pane owns no timer. While observed, a cheap
// directory-stamp probe (the same seven-stat fingerprint the CLI watch uses) decides whether the
// tree is re-read, durations re-derive once a minute, and the motion clock asks for a paint only
// while a visible row or gate moves.
//
// invariant: Task truth lives in the folders the CLI reads (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: The CLI lenses are the dashboard's one generator (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Dashboard motion exists only while observed (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Fleet extras name their repository scope (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Each dashboard lens has one stable row shape (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import {
  INVAR_FLEET_REPOSITORY_ROOT,
  PRIORITY_ORDER,
  agentIdentity,
  builderStanding,
  completedStateAttachment,
  formatDuration,
  landingStamp,
  readTaskRecords,
  readFleetGateGlance,
  readTaskFleetFacts,
  startedAtMilliseconds,
  tasksTreeStamp,
  type GateGlance,
  type TaskFleetFacts,
  type TaskRecord,
} from '../../../scripts/tasks/tasks-status';

class $TasksDashboardOverview {
  protected static readonly DATA_HEARTBEAT_MILLISECONDS = 1000;
  protected static readonly MOTION_HEARTBEAT_MILLISECONDS = 1000 / 30;
  protected static readonly PROBE_EVERY_TICKS = 2;
  protected static readonly DURATION_REFRESH_EVERY_TICKS = 60;
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  /** The lens rotation, in the CLI's own order. */
  static readonly LENS_ORDER: readonly TasksDashboardLens[] = [
    'live',
    'active',
    'done',
  ];

  // The CLI's priority badges, glyph vocabulary only — colour is the renderer's.
  protected static readonly PRIORITY_GLYPHS: Record<string, string> = {
    'user-directed': '★',
    'verification-integrity': '⚑',
    'flake-evidence': '◍',
    'performance-behaviour': '⚡',
    'architecture-hygiene': '⬡',
  };

  constructor(
    protected readonly dependencies: TasksDashboardOverviewDependencies,
  ) {}

  protected dataHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  protected motionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  protected observationStarted = false;
  protected heartbeatCount = 0;
  protected lastProbeStamp = '';
  protected lastLensChangeAtMs = Date.now();
  protected records: TaskRecord[] = [];
  protected fleetFactsByFolder = new Map<string, TaskFleetFacts>();

  get lens() {
    return ref<TasksDashboardLens>('live');
  }
  get rows() {
    return shallowRef<readonly TasksDashboardRow[]>([]);
  }
  get available() {
    return ref(false);
  }
  get cycling() {
    return ref(false);
  }
  get selectedIndex() {
    return ref(-1);
  }
  get hoveredIndex() {
    return ref(-1);
  }
  get scrollTop() {
    return ref(0);
  }
  get viewportHeight() {
    return ref(1);
  }
  get viewportWidth() {
    return ref(1);
  }
  get animationPaint() {
    return ref(0);
  }
  get gateGlance() {
    return shallowRef<GateGlance | null>(null);
  }
  get fleetScopeMatches() {
    return ref(true);
  }
  get actionNotice() {
    return shallowRef<TasksDashboardActionNotice | null>(null);
  }

  /** Bumped on every data change, so the pane's renderRevision observes one counter. */
  get version() {
    return ref(0);
  }

  /** The absolute tasks root for the active workspace. */
  tasksRootPath(): string {
    return join(this.dependencies.workspaceRoot(), '.invar', 'tasks');
  }

  /** Start the observation-priced clocks after the pane has joined its real dock host. */
  startObservation(): void {
    if (this.observationStarted) return;
    this.observationStarted = true;
    this.$watch(
      () => this.dependencies.isObserved(),
      (isObserved) => this.onObservationChanged(isObserved),
      { immediate: true, flush: 'sync' },
    );
  }

  protected onObservationChanged(isObserved: boolean): void {
    this.stopHeartbeatTimers();
    if (!isObserved) return;
    this.refresh();
    this.dataHeartbeatTimer = setInterval(
      () => this.heartbeatTick(),
      $TasksDashboardOverview.DATA_HEARTBEAT_MILLISECONDS,
    );
    this.motionHeartbeatTimer = setInterval(
      () => this.motionHeartbeatTick(),
      $TasksDashboardOverview.MOTION_HEARTBEAT_MILLISECONDS,
    );
  }

  protected stopHeartbeatTimers(): void {
    if (this.dataHeartbeatTimer !== null) {
      clearInterval(this.dataHeartbeatTimer);
    }
    if (this.motionHeartbeatTimer !== null) {
      clearInterval(this.motionHeartbeatTimer);
    }
    this.dataHeartbeatTimer = null;
    this.motionHeartbeatTimer = null;
  }

  /** Re-read the tree through the CLI readers and rebuild the current lens's rows. */
  refresh(): void {
    const tasksRoot = this.tasksRootPath();
    this.available.value = existsSync(tasksRoot);
    this.records = this.available.value ? readTaskRecords(tasksRoot) : [];
    this.refreshFleetFacts();
    this.lastProbeStamp = this.probeStamp();
    this.rebuildRows();
  }

  /** The data clock: cycling advance, the cheap tree probe, and duration re-derivation. */
  protected heartbeatTick(): void {
    this.heartbeatCount += 1;
    if (this.cycling.value && this.cycleIsDue()) this.advanceLens(1);
    if (this.heartbeatCount % $TasksDashboardOverview.PROBE_EVERY_TICKS === 0)
      this.probeTick();
    if (
      this.heartbeatCount %
        $TasksDashboardOverview.DURATION_REFRESH_EVERY_TICKS ===
        0 &&
      this.available.value
    ) {
      this.refresh(); // durations re-derive from now(); records re-read is one small tree walk
    }
  }

  protected motionHeartbeatTick(): void {
    if (!this.hasLiveMotion()) return;
    this.animationPaint.value += 1;
    this.dependencies.requestRender();
  }

  protected hasLiveMotion(): boolean {
    if (this.gateGlance.value?.exitCode === null) return true;
    return (
      this.lens.value === 'live' &&
      this.rows.value.some(
        (row) =>
          row.kind === 'task' &&
          (row.phase === 'exploring' || row.phase === 'building'),
      )
    );
  }

  protected cycleIsDue(): boolean {
    const intervalMs = Math.max(1, this.dependencies.cycleSeconds()) * 1000;
    return Date.now() - this.lastLensChangeAtMs >= intervalMs;
  }

  /** The change fingerprint: workspace root + tree presence + the CLI's directory stamp. */
  protected probeStamp(): string {
    const tasksRoot = this.tasksRootPath();
    return existsSync(tasksRoot)
      ? `${tasksRoot}:${tasksTreeStamp(tasksRoot)}`
      : `${tasksRoot}:absent`;
  }

  protected probeTick(): void {
    if (this.probeStamp() !== this.lastProbeStamp) {
      this.refresh();
      return;
    }
    if (this.refreshFleetFacts()) this.rebuildRows();
  }

  protected refreshFleetFacts(): boolean {
    const fleetRepositoryRoot =
      this.dependencies.fleetRepositoryRoot?.() ?? INVAR_FLEET_REPOSITORY_ROOT;
    const fleetScopeMatches =
      resolve(this.dependencies.workspaceRoot()) ===
      resolve(fleetRepositoryRoot);
    const previousFingerprint = this.fleetFactsFingerprint();
    this.fleetScopeMatches.value = fleetScopeMatches;
    this.fleetFactsByFolder.clear();
    this.gateGlance.value = null;
    if (fleetScopeMatches && this.dependencies.isObserved()) {
      const taskFleetFacts =
        this.dependencies.readTaskFleetFacts ?? readTaskFleetFacts;
      for (const record of this.records) {
        if (record.directoryState !== 'in-progress') continue;
        this.fleetFactsByFolder.set(
          record.folderName,
          taskFleetFacts(fleetRepositoryRoot, record),
        );
      }
      this.gateGlance.value = (
        this.dependencies.readFleetGateGlance ?? readFleetGateGlance
      )();
    }
    return previousFingerprint !== this.fleetFactsFingerprint();
  }

  protected fleetFactsFingerprint(): string {
    return JSON.stringify({
      scope: this.fleetScopeMatches.value,
      facts: [...this.fleetFactsByFolder.entries()],
      gate: this.gateGlance.value,
    });
  }

  // ---- lenses -------------------------------------------------------------

  setLens(lens: TasksDashboardLens): void {
    if (this.lens.value === lens) return;
    this.lens.value = lens;
    this.lastLensChangeAtMs = Date.now();
    this.scrollTop.value = 0;
    this.rebuildRows();
  }

  advanceLens(step: number): void {
    const currentIndex = $TasksDashboardOverview.LENS_ORDER.indexOf(
      this.lens.value,
    );
    const lensCount = $TasksDashboardOverview.LENS_ORDER.length;
    const nextIndex = (currentIndex + step + lensCount) % lensCount;
    this.setLens($TasksDashboardOverview.LENS_ORDER[nextIndex] ?? 'live');
  }

  toggleCycling(): void {
    this.cycling.value = !this.cycling.value;
    this.lastLensChangeAtMs = Date.now();
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  // ---- rows ---------------------------------------------------------------

  protected rebuildRows(): void {
    const lens = this.lens.value;
    const rows =
      lens === 'live'
        ? this.buildLiveRows()
        : lens === 'active'
          ? this.buildActiveRows()
          : this.buildDoneRows();
    const fleetRows: TasksDashboardRow[] = [];
    if (this.available.value && !this.fleetScopeMatches.value) {
      fleetRows.push(
        this.nonTaskRow(
          'scope',
          'Fleet extras describe the main Invar checkout only.',
        ),
      );
    } else if (this.available.value && this.gateGlance.value !== null) {
      fleetRows.push(this.nonTaskRow('gate', ''));
    }
    this.rows.value = [...fleetRows, ...rows];
    this.clampSelection();
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  protected byNumberDescending(left: TaskRecord, right: TaskRecord): number {
    return right.taskNumber - left.taskNumber;
  }

  protected taskFolderPath(record: TaskRecord): string {
    return join(this.tasksRootPath(), record.directoryState, record.folderName);
  }

  protected artifactPath(
    record: TaskRecord,
    fileName: string | null,
  ): string | null {
    return fileName === null
      ? null
      : join(this.taskFolderPath(record), fileName);
  }

  protected shortName(record: TaskRecord): string {
    return record.folderName.replace(/^\d+-/, '');
  }

  protected nonTaskRow(
    kind: 'group' | 'scope' | 'gate',
    label: string,
  ): TasksDashboardRow {
    return {
      kind,
      label,
      taskNumber: null,
      standing: null,
      phase: null,
      round: 1,
      durationLabel: '',
      identity: '',
      attachment: '',
      addedLines: null,
      removedLines: null,
      sessionName: null,
      worktreePath: null,
      taskFilePath: null,
      latestBriefFilePath: null,
      latestReportFilePath: null,
    };
  }

  protected taskRows(
    record: TaskRecord,
    overrides: Partial<TasksDashboardRow>,
    includeDetailRow: boolean,
  ): TasksDashboardRow[] {
    const fleetFacts = this.fleetFactsByFolder.get(record.folderName) ?? null;
    const shared: TasksDashboardRow = {
      kind: 'task',
      label: this.shortName(record),
      taskNumber: record.taskNumber,
      standing: null,
      phase: null,
      round: 1,
      durationLabel: '',
      identity: agentIdentity(record) ?? '',
      attachment: '',
      addedLines: fleetFacts?.lineDelta?.added ?? null,
      removedLines: fleetFacts?.lineDelta?.removed ?? null,
      sessionName:
        record.directoryState === 'in-progress'
          ? (fleetFacts?.sessionName ?? `invar/${record.folderName}`)
          : null,
      worktreePath:
        fleetFacts?.worktreePath ??
        join(
          this.dependencies.fleetRepositoryRoot?.() ??
            INVAR_FLEET_REPOSITORY_ROOT,
          '.invar',
          'worktrees',
          record.folderName,
        ),
      taskFilePath: this.artifactPath(record, record.taskFileName),
      latestBriefFilePath: this.artifactPath(
        record,
        record.latestBriefFileName,
      ),
      latestReportFilePath: this.artifactPath(
        record,
        record.latestReportFileName,
      ),
      ...overrides,
    };
    return includeDetailRow
      ? [shared, { ...shared, kind: 'detail' }]
      : [shared];
  }

  protected buildLiveRows(): TasksDashboardRow[] {
    const tasksRoot = this.tasksRootPath();
    return this.records
      .filter((record) => record.directoryState === 'in-progress')
      .sort((left, right) => this.byNumberDescending(left, right))
      .flatMap((record) => {
        const { round, ready } = builderStanding(tasksRoot, record);
        const startedAt = startedAtMilliseconds(tasksRoot, record);
        const fleetFacts = this.fleetFactsByFolder.get(record.folderName);
        return this.taskRows(
          record,
          {
            standing: ready ? 'ready' : 'building',
            phase: ready ? null : (fleetFacts?.phase ?? 'building'),
            round,
            durationLabel:
              startedAt === null ? '' : formatDuration(Date.now() - startedAt),
          },
          true,
        );
      });
  }

  protected buildActiveRows(): TasksDashboardRow[] {
    const activeRecords = this.records.filter(
      (record) => record.directoryState === 'active',
    );
    const rows: TasksDashboardRow[] = [];
    for (const group of [...PRIORITY_ORDER, null]) {
      const inGroup = activeRecords
        .filter((record) => record.priorityGroup === group)
        .sort((left, right) => this.byNumberDescending(left, right));
      if (inGroup.length === 0) continue;
      const glyph =
        group === null
          ? '◌'
          : ($TasksDashboardOverview.PRIORITY_GLYPHS[group] ?? '·');
      rows.push(
        this.nonTaskRow(
          'group',
          `${glyph} ${this.capitalizedSectionName(group ?? 'unprioritised')} (${inGroup.length})`,
        ),
      );
      for (const record of inGroup)
        rows.push(...this.taskRows(record, {}, false));
    }
    return rows;
  }

  protected buildDoneRows(): TasksDashboardRow[] {
    const tasksRoot = this.tasksRootPath();
    return this.records
      .filter((record) => record.directoryState === 'completed')
      .sort((left, right) => this.byNumberDescending(left, right))
      .flatMap((record) => {
        const { durationMinutes } = landingStamp(tasksRoot, record);
        return this.taskRows(
          record,
          {
            attachment: completedStateAttachment(record),
            durationLabel:
              durationMinutes === null
                ? ''
                : formatDuration(durationMinutes * 60000),
          },
          false,
        );
      });
  }

  protected capitalizedSectionName(sectionName: string): string {
    return sectionName.replace(/^[a-z]/, (firstLetter) =>
      firstLetter.toUpperCase(),
    );
  }

  // ---- selection and scroll -----------------------------------------------

  /** Selectable means a task row; group headings are skipped by keyboard motion. */
  protected isSelectable(rowIndex: number): boolean {
    return this.rows.value[rowIndex]?.kind === 'task';
  }

  protected clampSelection(): void {
    const rows = this.rows.value;
    if (rows.length === 0) {
      this.selectedIndex.value = -1;
      return;
    }
    const current = this.selectedIndex.value;
    if (current >= 0 && current < rows.length && this.isSelectable(current))
      return;
    this.selectedIndex.value = rows.findIndex((row) => row.kind === 'task');
  }

  moveSelection(step: number): void {
    const rows = this.rows.value;
    if (rows.length === 0) return;
    let candidate = this.selectedIndex.value;
    for (let hop = 0; hop < rows.length; hop += 1) {
      candidate += step;
      if (candidate < 0 || candidate >= rows.length) return;
      if (this.isSelectable(candidate)) {
        this.selectedIndex.value = candidate;
        this.revealSelection();
        this.version.value += 1;
        this.dependencies.requestRender();
        return;
      }
    }
  }

  setSelection(rowIndex: number): boolean {
    if (!this.isSelectable(rowIndex)) return false;
    this.selectedIndex.value = rowIndex;
    this.version.value += 1;
    return true;
  }

  protected revealSelection(): void {
    const selected = this.selectedIndex.value;
    if (selected < 0) return;
    const height = Math.max(1, this.viewportHeight.value);
    if (selected < this.scrollTop.value) this.scrollTop.value = selected;
    else if (selected >= this.scrollTop.value + height)
      this.scrollTop.value = selected - height + 1;
  }

  /** The window's first row, clamped so the last page is always full. */
  windowTop(): number {
    const maxTop = Math.max(
      0,
      this.rows.value.length - Math.max(1, this.viewportHeight.value),
    );
    return Math.min(Math.max(0, this.scrollTop.value), maxTop);
  }

  scrollBy(rowDelta: number): void {
    const maxTop = Math.max(
      0,
      this.rows.value.length - Math.max(1, this.viewportHeight.value),
    );
    const next = Math.min(Math.max(0, this.scrollTop.value + rowDelta), maxTop);
    if (next === this.scrollTop.value) return;
    this.scrollTop.value = next;
    this.version.value += 1;
  }

  selectedTaskFilePath(): string | null {
    const row = this.rows.value[this.selectedIndex.value];
    return row?.kind === 'task' ? row.taskFilePath : null;
  }

  rowAtVisibleRow(visibleRow: number): TasksDashboardRow | null {
    return this.rows.value[this.windowTop() + visibleRow] ?? null;
  }

  stateActionMiss(taskNumber: number, message: string): void {
    this.actionNotice.value = { taskNumber, message };
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  clearActionNotice(): void {
    if (this.actionNotice.value === null) return;
    this.actionNotice.value = null;
    this.version.value += 1;
  }

  dispose(): void {
    this.stopHeartbeatTimers();
    if (this.observationStarted) this.$stopEffects();
  }
}

export namespace TasksDashboardOverview {
  export const $Class = $TasksDashboardOverview;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export type TasksDashboardLens = 'live' | 'active' | 'done';

/** One paintable row: a priority-group heading or a selectable task line. */
export interface TasksDashboardRow {
  kind: 'group' | 'scope' | 'gate' | 'task' | 'detail';
  /** Group rows: the heading text. Task rows: the task's short name (folder minus number). */
  label: string;
  taskNumber: number | null;
  /** READY holds still, building carries the motion vocabulary; null outside the live lens. */
  standing: 'ready' | 'building' | null;
  /** Fleet-only work phase. Null for READY and outside the live lens. */
  phase: 'exploring' | 'building' | null;
  /** `round N` past round 1, live lens only. */
  round: number;
  /** Running time (live) or dispatch-to-landing time (done); empty when unknown. */
  durationLabel: string;
  /** The compact agent identity (`claude·fable-5·medium`), or empty. */
  identity: string;
  /** Done lens: whatever the State line carries after COMPLETED (the landing commit). */
  attachment: string;
  addedLines: number | null;
  removedLines: number | null;
  sessionName: string | null;
  worktreePath: string | null;
  /** Absolute path of the task's `task-<n>-<slug>.md`, or null when the folder has none. */
  taskFilePath: string | null;
  latestBriefFilePath: string | null;
  latestReportFilePath: string | null;
}

export interface TasksDashboardOverviewDependencies {
  /** The active workspace root — resolved late so workspace switches re-anchor the tree. */
  workspaceRoot: () => string;
  /** True while the pane is on screen (dock visible, tasks content active). */
  isObserved: () => boolean;
  requestRender: () => void;
  /** The contributed cycle interval, seconds per lens while the overview plays. */
  cycleSeconds: () => number;
  /** The main checkout that owns fleet worktrees and gate registry facts. */
  fleetRepositoryRoot?: () => string;
  readTaskFleetFacts?: (
    fleetRepositoryRoot: string,
    record: TaskRecord,
  ) => TaskFleetFacts;
  readFleetGateGlance?: () => GateGlance | null;
}

export interface TasksDashboardActionNotice {
  readonly taskNumber: number;
  readonly message: string;
}
