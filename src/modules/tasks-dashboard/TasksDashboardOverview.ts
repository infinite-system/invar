// The tasks dashboard model: the three CLI lenses (LIVE / ACTIVE / DONE) as reactive rows, plus
// the selection, the optional cycling overview, and the honest absent-tree state the pane paints.
//
// THE CLI LENSES ARE THE PRIMITIVE. Every task fact here comes from the exported readers of
// `scripts/tasks/tasks-status.ts` — readTaskRecords, builderStanding, startedAtMilliseconds,
// landingStamp, agentIdentity, PRIORITY_ORDER, tasksStateDirectoriesStamp. This module re-implements no
// reader; it adds only what a pane can do that a terminal cannot: ivue reactivity, selection,
// and opening the record files in the editor.
//
// COST TRACKS WHAT IS OBSERVED. A hidden pane owns no timer. While observed, a cheap
// state-directory stamp decides whether the tree is re-read. Fleet and session facts are sampled
// only for painted task rows. Durations re-derive once a minute for that same painted window. The
// motion clock asks for a paint only while a painted row or gate moves.
//
// invariant: Task truth lives in the folders the CLI reads (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: The CLI lenses are the dashboard's one generator (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Dashboard motion exists only while observed (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Fleet extras name their repository scope (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Each dashboard lens has one stable row shape (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import {
  INVAR_FLEET_REPOSITORY_ROOT,
  PRIORITY_ORDER,
  TASKS_MOTION_STEP_MILLISECONDS,
  agentIdentity,
  builderStanding,
  completedStateAttachment,
  formatDuration,
  landingStamp,
  readTaskRecords,
  readFleetGateGlance,
  readTaskFleetFacts,
  readTmuxSessionNames,
  startedAtMilliseconds,
  taskSessionName,
  tasksStateDirectoriesStamp,
  type GateGlance,
  type TaskFleetFacts,
  type TaskRecord,
} from '../../../scripts/tasks/tasks-status';

class $TasksDashboardOverview {
  protected readonly dataHeartbeatMilliseconds = 1000;
  // One heartbeat is one wall-clock motion step (#348's contract): the
  // interval IS the step duration, so each tick advances exactly one step
  // and the elapsed math below stays a pure product of tick count and time.
  protected readonly motionHeartbeatMilliseconds =
    TASKS_MOTION_STEP_MILLISECONDS;
  protected readonly probeEveryTicks = 2;
  protected readonly durationRefreshEveryTicks = 60;
  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  /** The lens rotation, in the CLI's own order. */
  protected readonly lensOrder: readonly TasksDashboardLens[] = [
    'live',
    'active',
    'done',
  ];

  // The CLI's priority badges, glyph vocabulary only — colour is the renderer's.
  protected readonly priorityGlyphs: Record<string, string> = {
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
  protected fleetFactStampsByFolder = new Map<string, string>();
  protected paintedRecordStampsByFolder = new Map<string, string>();
  protected availableSessionNames: ReadonlySet<string> = new Set();
  protected dataHeartbeatTicks = 0;
  protected taskTreeReads = 0;
  protected fleetFactProbes = 0;
  protected sessionProbes = 0;
  protected rowRebuilds = 0;
  protected fleetAuditOffset = 0;

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
      this.dataHeartbeatMilliseconds,
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

  dataHeartbeatAtRest(): boolean {
    return this.dataHeartbeatTimer === null;
  }

  observationCounts(): TasksDashboardObservationCounts {
    return {
      dataHeartbeatTicks: this.dataHeartbeatTicks,
      taskTreeReads: this.taskTreeReads,
      fleetFactProbes: this.fleetFactProbes,
      sessionProbes: this.sessionProbes,
      rowRebuilds: this.rowRebuilds,
    };
  }

  /** Re-read the tree through the CLI readers and rebuild the current lens's rows. */
  refresh(): void {
    const tasksRoot = this.tasksRootPath();
    this.available.value = existsSync(tasksRoot);
    this.records = this.available.value ? readTaskRecords(tasksRoot) : [];
    if (this.available.value) this.taskTreeReads += 1;
    this.paintedRecordStampsByFolder.clear();
    this.prepareFleetScope();
    this.lastProbeStamp = this.probeStamp();
    this.rebuildRows();
    if (this.refreshPaintedFacts()) this.rebuildPaintedTaskRows();
    this.rememberPaintedRecordStamps();
  }

  /** The data clock: cycling advance, the cheap tree probe, and duration re-derivation. */
  protected heartbeatTick(): void {
    if (!this.dependencies.isObserved()) {
      this.stopHeartbeatTimers();
      return;
    }
    this.heartbeatCount += 1;
    this.dataHeartbeatTicks += 1;
    if (this.cycling.value && this.cycleIsDue()) this.advanceLens(1);
    if (this.heartbeatCount % this.probeEveryTicks === 0) this.probeTick();
    if (
      this.heartbeatCount % this.durationRefreshEveryTicks === 0 &&
      this.available.value
    ) {
      this.rebuildPaintedTaskRows();
    }
  }

  /**
   * How long the pane's motion has run, in milliseconds. The motion tables in
   * `tasks-status.ts` step on wall-clock time, so the pane hands them TIME and
   * never its paint count: the pane paints at 30 fps and the CLI watch at
   * 60 fps, and both must show the same step at the same moment (#348).
   */
  get animationElapsedMilliseconds(): number {
    return this.animationPaint.value * this.motionHeartbeatMilliseconds;
  }

  protected motionHeartbeatTick(): void {
    if (!this.dependencies.isObserved() || !this.hasLiveMotion()) {
      this.syncMotionHeartbeatTimer();
      return;
    }
    this.animationPaint.value += 1;
    this.dependencies.requestRender();
  }

  protected syncMotionHeartbeatTimer(): void {
    const motionIsObserved =
      this.dependencies.isObserved() && this.hasLiveMotion();
    if (!motionIsObserved) {
      if (this.motionHeartbeatTimer !== null)
        clearInterval(this.motionHeartbeatTimer);
      this.motionHeartbeatTimer = null;
      return;
    }
    if (this.motionHeartbeatTimer !== null) return;
    this.motionHeartbeatTimer = setInterval(
      () => this.motionHeartbeatTick(),
      this.motionHeartbeatMilliseconds,
    );
  }

  protected hasLiveMotion(): boolean {
    const visibleRows = this.rows.value.slice(
      this.windowTop(),
      this.windowTop() + Math.max(1, this.viewportHeight.value),
    );
    if (
      this.gateGlance.value?.exitCode === null &&
      visibleRows.some((row) => row.kind === 'gate')
    ) {
      return true;
    }
    return (
      this.lens.value === 'live' &&
      visibleRows.some(
        (row) =>
          row.kind === 'detail' &&
          (row.phase === 'exploring' || row.phase === 'building'),
      )
    );
  }

  motionHeartbeatAtRest(): boolean {
    return this.motionHeartbeatTimer === null;
  }

  protected cycleIsDue(): boolean {
    const intervalMs = Math.max(1, this.dependencies.cycleSeconds()) * 1000;
    return Date.now() - this.lastLensChangeAtMs >= intervalMs;
  }

  /** The change fingerprint: workspace root + tree presence + four state-directory stats. */
  protected probeStamp(): string {
    const tasksRoot = this.tasksRootPath();
    return existsSync(tasksRoot)
      ? `${tasksRoot}:${tasksStateDirectoriesStamp(tasksRoot)}`
      : `${tasksRoot}:absent`;
  }

  protected probeTick(): void {
    if (this.probeStamp() !== this.lastProbeStamp) {
      this.refresh();
      return;
    }
    if (this.paintedRecordChanged()) {
      this.refresh();
      return;
    }
    if (this.refreshPaintedFacts()) this.rebuildPaintedTaskRows();
  }

  protected paintedRecordChanged(): boolean {
    return this.paintedTaskRecords().some(
      (record) =>
        this.paintedRecordStampsByFolder.get(record.folderName) !==
        this.paintedRecordStamp(record),
    );
  }

  protected rememberPaintedRecordStamps(): void {
    for (const record of this.paintedTaskRecords()) {
      this.paintedRecordStampsByFolder.set(
        record.folderName,
        this.paintedRecordStamp(record),
      );
    }
  }

  protected paintedRecordStamp(record: TaskRecord): string {
    const folderPath = this.taskFolderPath(record);
    return [
      folderPath,
      join(folderPath, 'meta.json'),
      record.taskFileName === null
        ? join(folderPath, 'task-record-absent')
        : join(folderPath, record.taskFileName),
    ]
      .map((path) => {
        try {
          return String(statSync(path).mtimeMs);
        } catch {
          return '0';
        }
      })
      .join(':');
  }

  protected prepareFleetScope(): void {
    const fleetRepositoryRoot =
      this.dependencies.fleetRepositoryRoot?.() ?? INVAR_FLEET_REPOSITORY_ROOT;
    this.fleetScopeMatches.value =
      resolve(this.dependencies.workspaceRoot()) ===
      resolve(fleetRepositoryRoot);
    this.fleetFactsByFolder.clear();
    this.fleetFactStampsByFolder.clear();
    this.availableSessionNames = new Set();
    this.gateGlance.value = null;
    if (this.fleetScopeMatches.value && this.dependencies.isObserved()) {
      this.gateGlance.value = (
        this.dependencies.readFleetGateGlance ?? readFleetGateGlance
      )();
    }
  }

  protected paintedTaskRecords(): TaskRecord[] {
    const folderNames = new Set(
      this.rows.value
        .slice(
          this.windowTop(),
          this.windowTop() + Math.max(1, this.viewportHeight.value),
        )
        .map((row) => row.folderName)
        .filter((folderName): folderName is string => folderName !== null),
    );
    return this.records.filter((record) => folderNames.has(record.folderName));
  }

  protected refreshPaintedFacts(): boolean {
    const paintedRecords = this.paintedTaskRecords();
    const previousFingerprint = this.paintedFactsFingerprint(paintedRecords);
    if (this.fleetScopeMatches.value && this.dependencies.isObserved()) {
      const fleetRepositoryRoot =
        this.dependencies.fleetRepositoryRoot?.() ??
        INVAR_FLEET_REPOSITORY_ROOT;
      const taskFleetFacts =
        this.dependencies.readTaskFleetFacts ?? readTaskFleetFacts;
      const inProgressRecords = paintedRecords.filter(
        (record) => record.directoryState === 'in-progress',
      );
      const auditedFolderName =
        inProgressRecords.length === 0
          ? null
          : (inProgressRecords[this.fleetAuditOffset % inProgressRecords.length]
              ?.folderName ?? null);
      this.fleetAuditOffset += 1;
      for (const record of inProgressRecords) {
        const stamp = this.fleetFactStamp(fleetRepositoryRoot, record);
        if (
          this.fleetFactsByFolder.has(record.folderName) &&
          this.fleetFactStampsByFolder.get(record.folderName) === stamp &&
          record.folderName !== auditedFolderName
        ) {
          continue;
        }
        this.fleetFactProbes += 1;
        this.fleetFactsByFolder.set(
          record.folderName,
          taskFleetFacts(fleetRepositoryRoot, record),
        );
        this.fleetFactStampsByFolder.set(record.folderName, stamp);
      }
    }
    const hasSessionRows = paintedRecords.some(
      (record) => record.directoryState === 'in-progress',
    );
    this.availableSessionNames = hasSessionRows
      ? this.dependencies.readTmuxSessionNames
        ? ((this.sessionProbes += 1), this.dependencies.readTmuxSessionNames())
        : ((this.sessionProbes += 1), readTmuxSessionNames())
      : new Set();
    return previousFingerprint !== this.paintedFactsFingerprint(paintedRecords);
  }

  protected paintedFactsFingerprint(records: readonly TaskRecord[]): string {
    return JSON.stringify({
      facts: records.map((record) => [
        record.folderName,
        this.fleetFactsByFolder.get(record.folderName),
      ]),
      sessions: [...this.availableSessionNames].sort(),
    });
  }

  protected fleetFactStamp(
    fleetRepositoryRoot: string,
    record: TaskRecord,
  ): string {
    const worktreePath = join(
      fleetRepositoryRoot,
      '.invar',
      'worktrees',
      record.folderName,
    );
    return [worktreePath, join(worktreePath, '.git')]
      .map((path) => {
        try {
          return String(statSync(path).mtimeMs);
        } catch {
          return '0';
        }
      })
      .join(':');
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
    const currentIndex = this.lensOrder.indexOf(this.lens.value);
    const lensCount = this.lensOrder.length;
    const nextIndex = (currentIndex + step + lensCount) % lensCount;
    this.setLens(this.lensOrder[nextIndex] ?? 'live');
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
    this.rowRebuilds += this.rows.value.length;
    this.clampSelection();
    this.syncMotionHeartbeatTimer();
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  /** Replace only task rows which the side-dock painter can currently project. */
  protected rebuildPaintedTaskRows(): void {
    const paintedFolderNames = new Set(
      this.paintedTaskRecords().map((record) => record.folderName),
    );
    if (paintedFolderNames.size === 0) return;
    const replacementRows = new Map<string, TasksDashboardRow[]>();
    for (const record of this.records) {
      if (!paintedFolderNames.has(record.folderName)) continue;
      replacementRows.set(record.folderName, this.rowsForRecord(record));
    }
    const replacementOffsets = new Map<string, number>();
    let rebuiltRowCount = 0;
    const rows = this.rows.value.map((row) => {
      if (row.folderName === null) return row;
      const replacements = replacementRows.get(row.folderName);
      if (!replacements) return row;
      const offset = replacementOffsets.get(row.folderName) ?? 0;
      const replacement = replacements[offset];
      if (!replacement) return row;
      replacementOffsets.set(row.folderName, offset + 1);
      rebuiltRowCount += 1;
      return replacement;
    });
    if (rebuiltRowCount === 0) return;
    this.rows.value = rows;
    this.rowRebuilds += rebuiltRowCount;
    this.syncMotionHeartbeatTimer();
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  protected rowsForRecord(record: TaskRecord): TasksDashboardRow[] {
    if (this.lens.value === 'live') {
      const { round, ready } = builderStanding(this.tasksRootPath(), record);
      const startedAt = startedAtMilliseconds(this.tasksRootPath(), record);
      return this.taskRows(
        record,
        {
          standing: ready ? 'ready' : 'building',
          phase: ready
            ? null
            : (this.fleetFactsByFolder.get(record.folderName)?.phase ??
              'building'),
          round,
          durationLabel:
            startedAt === null ? '' : formatDuration(Date.now() - startedAt),
        },
        true,
      );
    }
    if (this.lens.value === 'done') {
      const { durationMinutes } = landingStamp(this.tasksRootPath(), record);
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
    }
    return this.taskRows(record, {}, false);
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
      folderName: null,
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
      sessionAvailable: null,
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
      folderName: record.folderName,
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
        record.directoryState === 'in-progress' ? record.tmuxSession : null,
      sessionAvailable:
        record.directoryState === 'in-progress' && record.tmuxSession !== null
          ? this.availableSessionNames.has(record.tmuxSession)
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
      const glyph = group === null ? '◌' : (this.priorityGlyphs[group] ?? '·');
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
    if (this.refreshPaintedFacts()) this.rebuildPaintedTaskRows();
    this.rememberPaintedRecordStamps();
    this.syncMotionHeartbeatTimer();
    this.version.value += 1;
  }

  setViewportSize(columns: number, rows: number): void {
    const viewportHeight = Math.max(1, rows);
    const viewportWidth = Math.max(1, columns);
    const viewportChanged =
      this.viewportHeight.value !== viewportHeight ||
      this.viewportWidth.value !== viewportWidth;
    if (!viewportChanged) return;
    this.viewportHeight.value = viewportHeight;
    this.viewportWidth.value = viewportWidth;
    if (this.refreshPaintedFacts()) this.rebuildPaintedTaskRows();
    this.rememberPaintedRecordStamps();
    this.syncMotionHeartbeatTimer();
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

  /** Resolve the attach target from disk at activation time, never from the painted row snapshot. */
  currentSessionTarget(
    rowIndex: number,
  ): { sessionName: string; available: boolean } | null {
    const row = this.rows.value[rowIndex];
    if (
      !row ||
      (row.kind !== 'task' && row.kind !== 'detail') ||
      row.folderName === null
    ) {
      return null;
    }
    const sessionName = taskSessionName(this.tasksRootPath(), row.folderName);
    if (sessionName === null) return null;
    const availableSessionNames = this.dependencies.readTmuxSessionNames
      ? this.dependencies.readTmuxSessionNames()
      : readTmuxSessionNames();
    return {
      sessionName,
      available: availableSessionNames.has(sessionName),
    };
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
  folderName: string | null;
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
  sessionAvailable: boolean | null;
  worktreePath: string | null;
  /** Absolute path of the task's `task-<n>-<slug>.md`, or null when the folder has none. */
  taskFilePath: string | null;
  latestBriefFilePath: string | null;
  latestReportFilePath: string | null;
}

export interface TasksDashboardOverviewDependencies {
  /** The active workspace root — resolved late so workspace switches re-anchor the tree. */
  workspaceRoot: () => string;
  /** True only while the side-dock painter projects the tasks content. */
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
  readTmuxSessionNames?: () => ReadonlySet<string>;
}

export interface TasksDashboardActionNotice {
  readonly taskNumber: number;
  readonly message: string;
}

export interface TasksDashboardObservationCounts {
  readonly dataHeartbeatTicks: number;
  readonly taskTreeReads: number;
  readonly fleetFactProbes: number;
  readonly sessionProbes: number;
  readonly rowRebuilds: number;
}
