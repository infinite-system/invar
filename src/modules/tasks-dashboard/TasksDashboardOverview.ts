// The tasks dashboard model: the three CLI lenses (LIVE / ACTIVE / DONE) as reactive rows, plus
// the selection, the optional cycling overview, and the honest absent-tree state the pane paints.
//
// THE CLI LENSES ARE THE PRIMITIVE. Every task fact here comes from the exported readers of
// `scripts/tasks/tasks-status.ts` — readTaskRecords, builderStanding, startedAtMilliseconds,
// landingStamp, agentIdentity, PRIORITY_ORDER, tasksTreeStamp. This module re-implements no
// reader; it adds only what a pane can do that a terminal cannot: ivue reactivity, selection,
// and opening the record files in the editor.
//
// COST TRACKS WHAT IS OBSERVED. A hidden pane costs zero task-tree reads: the heartbeat returns
// before probing when the pane is not observed. While observed, a cheap directory-stamp probe
// (the same seven-stat fingerprint the CLI watch uses) decides whether the tree is re-read, and
// durations re-derive once a minute — data cadence, never paint polling; paints happen only when
// a ref actually changed.
//
// invariant: Task truth lives in the folders the CLI reads (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: The CLI lenses are the dashboard's one generator (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import {
  PRIORITY_ORDER,
  agentIdentity,
  builderStanding,
  completedStateAttachment,
  formatDuration,
  landingStamp,
  readTaskRecords,
  startedAtMilliseconds,
  tasksTreeStamp,
  type TaskRecord,
} from '../../../scripts/tasks/tasks-status';

class $TasksDashboardOverview {
  protected static readonly HEARTBEAT_MILLISECONDS = 1000;
  protected static readonly PROBE_EVERY_TICKS = 2;
  protected static readonly DURATION_REFRESH_EVERY_TICKS = 60;

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
  ) {
    this.refresh();
    this.heartbeatTimer = setInterval(
      () => this.heartbeatTick(),
      $TasksDashboardOverview.HEARTBEAT_MILLISECONDS,
    );
  }

  protected heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  protected heartbeatCount = 0;
  protected lastProbeStamp = '';
  protected lastLensChangeAtMs = Date.now();
  protected records: TaskRecord[] = [];

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

  /** Bumped on every data change, so the pane's renderRevision observes one counter. */
  get version() {
    return ref(0);
  }

  /** The absolute tasks root for the active workspace. */
  tasksRootPath(): string {
    return join(this.dependencies.workspaceRoot(), '.invar', 'tasks');
  }

  /** Re-read the tree through the CLI readers and rebuild the current lens's rows. */
  refresh(): void {
    const tasksRoot = this.tasksRootPath();
    this.available.value = existsSync(tasksRoot);
    this.records = this.available.value ? readTaskRecords(tasksRoot) : [];
    this.lastProbeStamp = this.probeStamp();
    this.rebuildRows();
  }

  /** One shared clock: cycling advance, the cheap tree probe, and the per-minute duration
   *  re-derivation. Returns before any work while the pane is not observed. */
  protected heartbeatTick(): void {
    if (!this.dependencies.isObserved()) return;
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
    if (this.probeStamp() !== this.lastProbeStamp) this.refresh();
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
    this.rows.value = rows;
    this.clampSelection();
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  protected byNumberDescending(left: TaskRecord, right: TaskRecord): number {
    return right.taskNumber - left.taskNumber;
  }

  protected taskFilePath(record: TaskRecord): string | null {
    if (record.taskFileName === null) return null;
    return join(
      this.tasksRootPath(),
      record.directoryState,
      record.folderName,
      record.taskFileName,
    );
  }

  protected shortName(record: TaskRecord): string {
    return record.folderName.replace(/^\d+-/, '');
  }

  protected taskRow(
    record: TaskRecord,
    overrides: Partial<TasksDashboardRow>,
  ): TasksDashboardRow {
    return {
      kind: 'task',
      label: this.shortName(record),
      taskNumber: record.taskNumber,
      standing: null,
      round: 1,
      durationLabel: '',
      identity: agentIdentity(record) ?? '',
      attachment: '',
      taskFilePath: this.taskFilePath(record),
      ...overrides,
    };
  }

  protected buildLiveRows(): TasksDashboardRow[] {
    const tasksRoot = this.tasksRootPath();
    return this.records
      .filter((record) => record.directoryState === 'in-progress')
      .sort((left, right) => this.byNumberDescending(left, right))
      .map((record) => {
        const { round, ready } = builderStanding(tasksRoot, record);
        const startedAt = startedAtMilliseconds(tasksRoot, record);
        return this.taskRow(record, {
          standing: ready ? 'ready' : 'building',
          round,
          durationLabel:
            startedAt === null ? '' : formatDuration(Date.now() - startedAt),
        });
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
      rows.push({
        kind: 'group',
        label: `${glyph} ${group ?? 'unprioritised'} (${inGroup.length})`,
        taskNumber: null,
        standing: null,
        round: 1,
        durationLabel: '',
        identity: '',
        attachment: '',
        taskFilePath: null,
      });
      for (const record of inGroup) rows.push(this.taskRow(record, {}));
    }
    return rows;
  }

  protected buildDoneRows(): TasksDashboardRow[] {
    const tasksRoot = this.tasksRootPath();
    return this.records
      .filter((record) => record.directoryState === 'completed')
      .sort((left, right) => this.byNumberDescending(left, right))
      .map((record) => {
        const { durationMinutes } = landingStamp(tasksRoot, record);
        return this.taskRow(record, {
          attachment: completedStateAttachment(record),
          durationLabel:
            durationMinutes === null
              ? ''
              : formatDuration(durationMinutes * 60000),
        });
      });
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

  dispose(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
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
  kind: 'group' | 'task';
  /** Group rows: the heading text. Task rows: the task's short name (folder minus number). */
  label: string;
  taskNumber: number | null;
  /** READY holds still, building carries the motion vocabulary; null outside the live lens. */
  standing: 'ready' | 'building' | null;
  /** `round N` past round 1, live lens only. */
  round: number;
  /** Running time (live) or dispatch-to-landing time (done); empty when unknown. */
  durationLabel: string;
  /** The compact agent identity (`claude·fable-5·medium`), or empty. */
  identity: string;
  /** Done lens: whatever the State line carries after COMPLETED (the landing commit). */
  attachment: string;
  /** Absolute path of the task's `task-<n>-<slug>.md`, or null when the folder has none. */
  taskFilePath: string | null;
}

export interface TasksDashboardOverviewDependencies {
  /** The active workspace root — resolved late so workspace switches re-anchor the tree. */
  workspaceRoot: () => string;
  /** True while the pane is on screen (dock visible, tasks content active). */
  isObserved: () => boolean;
  requestRender: () => void;
  /** The contributed cycle interval, seconds per lens while the overview plays. */
  cycleSeconds: () => number;
}
