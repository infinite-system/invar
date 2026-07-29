// The reactive user-settings store (MODEL layer). Fields are ref-returning getters so every read is
// reactive and every change LIVE-APPLIES to consumers (`Settings.Class.<field>.value`). Values are
// layered defaults <- user <- project: a user file at `~/.config/invar/settings.json` overrides the
// built-in defaults, and a workspace file at `.invar/settings.json` overrides the user file. Loading
// a missing or corrupt file never throws — it silently falls back to the layer beneath it.
//
// The filesystem is reached through an overridable `createFileSystem()` seam (a constructor-injected
// `fileSystem` wins) so tests drive the whole load/merge/save cycle against an in-memory fake and
// never touch the real `~/.config`.
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import { Files } from '../system/Files';
import { Logging } from '../system/Logging';
import { Environment } from '../system/Environment';
import type {
  DockVerticalSpan,
  PanelAlignment,
  SidebarPosition,
} from '../layout/LayoutModel';
import type { GraphicsTierSetting } from '../theme/TerminalCapabilities';
import type {
  RegisteredSetting,
  SettingContribution,
  SettingValue,
} from './SettingContribution.interface';

class $Settings {
  protected static get $allowedScrollModifiers(): ReadonlySet<ScrollModifier> {
    return new Set(['alt', 'shift', 'ctrl', 'none']);
  }

  protected static get $allowedGlyphModes(): ReadonlySet<GlyphMode> {
    return new Set(['auto', 'nerd', 'unicode', 'ascii']);
  }

  protected static get $allowedGraphicsTiers(): ReadonlySet<GraphicsTierSetting> {
    return new Set(['auto', 'kitty', 'sixel', 'halfblock']);
  }

  protected static get $allowedWorkspaceTabPositions(): ReadonlySet<WorkspaceTabPosition> {
    return new Set(['top', 'left']);
  }

  protected static get $allowedSidebarPositions(): ReadonlySet<SidebarPosition> {
    return new Set(['left', 'right']);
  }

  protected static get $allowedPanelAlignments(): ReadonlySet<PanelAlignment> {
    return new Set(['center', 'right']);
  }

  protected static get $allowedDockVerticalSpans(): ReadonlySet<DockVerticalSpan> {
    return new Set(['full-height', 'ends-at-panel']);
  }

  protected static get $allowedAgentProviders(): ReadonlySet<AgentProvider> {
    return new Set(['auto', 'claude', 'codex']);
  }

  constructor(readonly options: SettingsOptions = {}) {}

  // ---- Reactive fields (ref-returning getters; read/write via `.value`) --------------------------

  get verticalFlingCeiling(): Ref<number> {
    return ref(220);
  }
  get scrollAccelGain(): Ref<number> {
    return ref(34);
  }
  get scrollFriction(): Ref<number> {
    return ref(0.015);
  }
  get maximumGlideDurationMilliseconds(): Ref<number> {
    return ref(900);
  }
  get linesPerNotch(): Ref<number> {
    return ref(1);
  }
  get horizontalScrollModifier(): Ref<ScrollModifier> {
    return ref<ScrollModifier>('alt');
  }
  get fastScrollModifier(): Ref<ScrollModifier> {
    return ref<ScrollModifier>('none');
  }
  get fastScrollMultiplier(): Ref<number> {
    return ref(3);
  }
  get scrollbarThickness(): Ref<number> {
    return ref(1);
  }
  get glyphMode(): Ref<GlyphMode> {
    return ref<GlyphMode>('auto');
  }
  get graphicsTier(): Ref<GraphicsTierSetting> {
    return ref<GraphicsTierSetting>('auto');
  }
  get theme(): Ref<string> {
    return ref('dark');
  }
  get wordWrap(): Ref<boolean> {
    return ref(false);
  }
  get showActivityBar(): Ref<boolean> {
    return ref(true);
  }
  get showRightActivityBar(): Ref<boolean> {
    return ref(false);
  }
  get showIndentGuides(): Ref<boolean> {
    return ref(true);
  }
  get reducedMotion(): Ref<boolean> {
    return ref(false);
  }
  get workspaceTabPosition(): Ref<WorkspaceTabPosition> {
    return ref<WorkspaceTabPosition>('top');
  }
  get sidebarPosition(): Ref<SidebarPosition> {
    return ref<SidebarPosition>('left');
  }
  get panelAlignment(): Ref<PanelAlignment> {
    return ref<PanelAlignment>('center');
  }
  get leftDockVerticalSpan(): Ref<DockVerticalSpan> {
    return ref<DockVerticalSpan>('full-height');
  }
  get rightDockVerticalSpan(): Ref<DockVerticalSpan> {
    return ref<DockVerticalSpan>('ends-at-panel');
  }
  get agentProvider(): Ref<AgentProvider> {
    return ref<AgentProvider>('auto');
  }
  get agentSkipPermissions(): Ref<boolean> {
    return ref(true);
  }
  get agentTerminalFollowMode(): Ref<AgentTerminalFollowMode> {
    return ref<AgentTerminalFollowMode>('off');
  }
  get agentModel(): Ref<string> {
    return ref('');
  }
  get agentTypingSpeed(): Ref<number> {
    return ref(40);
  }
  get terminalCleanPrompt(): Ref<boolean> {
    return ref(true);
  }
  get agentNarrationVoice(): Ref<string> {
    return ref('');
  }
  /** Narration SPEED MULTIPLIER (higher = faster: 1.0 = normal, 2.0 = twice as fast, 0.5 = half
   *  speed). Engines map it: piper `--length_scale = 1/rate`; espeak/`say` `-s ≈ 175×rate` wpm. */
  get agentNarrationRate(): Ref<number> {
    return ref(1.0);
  }
  get agentAudioNarration(): Ref<boolean> {
    return ref(false);
  }
  get sidebarWidth(): Ref<number> {
    return ref(32);
  }
  get rightDockWidth(): Ref<number> {
    return ref(28);
  }
  get primaryDockContentOrder(): Ref<string[]> {
    return shallowRef([]);
  }
  get panelContentOrder(): Ref<string[]> {
    return shallowRef(['agent', 'terminal']);
  }

  /** Every field keyed by name — the one place each name maps to its reactive cell. */
  protected get fields(): {
    [Key in keyof SettingsValues]: Ref<SettingsValues[Key]>;
  } {
    return {
      verticalFlingCeiling: this.verticalFlingCeiling,
      scrollAccelGain: this.scrollAccelGain,
      scrollFriction: this.scrollFriction,
      maximumGlideDurationMilliseconds: this.maximumGlideDurationMilliseconds,
      linesPerNotch: this.linesPerNotch,
      horizontalScrollModifier: this.horizontalScrollModifier,
      fastScrollModifier: this.fastScrollModifier,
      fastScrollMultiplier: this.fastScrollMultiplier,
      scrollbarThickness: this.scrollbarThickness,
      glyphMode: this.glyphMode,
      graphicsTier: this.graphicsTier,
      theme: this.theme,
      wordWrap: this.wordWrap,
      showActivityBar: this.showActivityBar,
      showRightActivityBar: this.showRightActivityBar,
      showIndentGuides: this.showIndentGuides,
      reducedMotion: this.reducedMotion,
      workspaceTabPosition: this.workspaceTabPosition,
      sidebarPosition: this.sidebarPosition,
      panelAlignment: this.panelAlignment,
      leftDockVerticalSpan: this.leftDockVerticalSpan,
      rightDockVerticalSpan: this.rightDockVerticalSpan,
      agentProvider: this.agentProvider,
      agentSkipPermissions: this.agentSkipPermissions,
      agentTerminalFollowMode: this.agentTerminalFollowMode,
      agentModel: this.agentModel,
      agentTypingSpeed: this.agentTypingSpeed,
      terminalCleanPrompt: this.terminalCleanPrompt,
      agentAudioNarration: this.agentAudioNarration,
      agentNarrationVoice: this.agentNarrationVoice,
      agentNarrationRate: this.agentNarrationRate,
      sidebarWidth: this.sidebarWidth,
      rightDockWidth: this.rightDockWidth,
      primaryDockContentOrder: this.primaryDockContentOrder,
      panelContentOrder: this.panelContentOrder,
    };
  }

  protected contributedSettings = new Map<
    string,
    ContributedSettingRecord<SettingValue>
  >();
  protected storedUserRecord: Record<string, unknown> = {};
  protected storedProjectRecord: Record<string, unknown> = {};

  get schemaRevision(): Ref<number> {
    return ref(0);
  }

  // ---- Filesystem seam ---------------------------------------------------------------------------

  protected fileSystemInstance: SettingsFileSystem | undefined;

  /** Overridable owned construction of the filesystem capability. */
  protected createFileSystem(): SettingsFileSystem {
    const settingsClass = this.constructor as typeof $Settings;
    return this.options.fileSystem ?? settingsClass.defaultFileSystem();
  }

  protected get fileSystem(): SettingsFileSystem {
    return (this.fileSystemInstance ??= this.createFileSystem());
  }

  /** The default Files/Environment-backed filesystem (dependencies read late, inside each method). */
  static defaultFileSystem(): SettingsFileSystem {
    return {
      readTextFile(path: string): string | null {
        if (!Files.Class.exists(path)) return null;
        try {
          return Files.Class.read(path);
        } catch {
          return null;
        }
      },
      writeTextFile(path: string, content: string): void {
        Files.Class.write(path, content);
      },
      homeDirectory(): string {
        return (
          Environment.Class.env('HOME') ??
          Environment.Class.env('USERPROFILE') ??
          Environment.Class.cwd
        );
      },
    };
  }

  // ---- Path resolution ---------------------------------------------------------------------------

  protected storedUserPath: string | undefined;

  /** Where `save()` writes — the resolved user path from the last `load()`, else the OS default. */
  get userSettingsPath(): string {
    return this.storedUserPath ?? this.resolvePaths().userPath;
  }

  protected resolvePaths(paths: SettingsPaths = {}): {
    userPath: string;
    projectPath: string;
  } {
    const home = this.fileSystem.homeDirectory();
    const workspaceRoot = paths.workspaceRoot ?? Environment.Class.cwd;
    return {
      userPath:
        paths.userPath ??
        Files.Class.join(home, '.config', 'invar', 'settings.json'),
      projectPath:
        paths.projectPath ??
        Files.Class.join(workspaceRoot, '.invar', 'settings.json'),
    };
  }

  // ---- Load / merge / save -----------------------------------------------------------------------

  /**
   * Load the store: merge defaults <- user file <- project file and apply the result to the reactive
   * fields. Missing or corrupt files fall back to the layer beneath them and never throw. Remembers
   * the resolved user path so a later `save()` writes back to the right place.
   */
  load(paths: SettingsPaths = {}): void {
    const resolved = this.resolvePaths(paths);
    this.storedUserPath = resolved.userPath;
    this.storedUserRecord = this.readSettingsRecord(resolved.userPath);
    this.storedProjectRecord = this.readSettingsRecord(resolved.projectPath);
    const settingsClass = this.constructor as typeof $Settings;
    this.applyValues({
      ...settingsClass.DEFAULTS,
      ...settingsClass.sanitize(this.storedUserRecord),
      ...settingsClass.sanitize(this.storedProjectRecord),
    });
    for (const record of this.contributedSettings.values()) {
      record.value.value = this.contributedValue(record.contribution);
    }
  }

  /** Serialize the current values to the user-level file (best-effort; write errors are swallowed). */
  save(): void {
    const snapshot = this.persistenceSnapshot();
    const serialized = JSON.stringify(snapshot, null, 2);
    try {
      this.fileSystem.writeTextFile(this.userSettingsPath, serialized + '\n');
    } catch {
      // Best-effort persistence — a failed write must never crash the app.
    }
    this.storedUserRecord = { ...snapshot };
    // save() is a SYNCHRONOUS disk write and MUST be infrequent (persist-on-settle, never per drag/scroll
    // tick — that stalls the frame). This trace lets the perf smoke assert exactly one save per drag.
    Logging.Class.info('settings-save');
  }

  /** Set one field and live-apply it; type-checked per key. */
  set<Key extends keyof SettingsValues>(
    key: Key,
    value: SettingsValues[Key],
  ): void {
    this.applyValues({ [key]: value } as Partial<SettingsValues>);
  }

  setContributed(identifier: string, value: SettingValue): void {
    const record = this.contributedSettings.get(identifier);
    if (!record) return;
    const sanitized = this.sanitizeContributedValue(record.contribution, value);
    if (sanitized === undefined || sanitized === record.value.value) return;
    record.value.value = sanitized;
    record.contribution.changed?.(sanitized);
  }

  // invariant: Plugin settings live in contributed schema (src/modules/settings/settings.invariants.md)
  registerSetting<Value extends SettingValue>(
    contribution: SettingContribution<Value>,
  ): RegisteredSetting<Value> {
    if (this.fields[contribution.identifier as keyof SettingsValues]) {
      throw new Error(
        `Contributed setting duplicates host setting: ${contribution.identifier}`,
      );
    }
    if (this.contributedSettings.has(contribution.identifier)) {
      throw new Error(
        `Contributed setting already registered: ${contribution.identifier}`,
      );
    }
    const value = ref(this.contributedValue(contribution)) as Ref<Value>;
    const record: ContributedSettingRecord<Value> = { contribution, value };
    this.contributedSettings.set(
      contribution.identifier,
      record as unknown as ContributedSettingRecord<SettingValue>,
    );
    this.schemaRevision.value += 1;
    let registered = true;
    return {
      value,
      save: () => this.save(),
      dispose: () => {
        if (!registered) return;
        registered = false;
        this.contributedSettings.delete(contribution.identifier);
        this.schemaRevision.value += 1;
      },
    };
  }

  contributedSettingDescriptors(): readonly SettingContribution[] {
    void this.schemaRevision.value;
    return [...this.contributedSettings.values()].map(
      (record) => record.contribution,
    );
  }

  /** A plain snapshot of every current value. */
  snapshot(): SettingsValues {
    const values = {} as SettingsValues;
    const fields = this.fields;
    for (const key of Object.keys(fields) as (keyof SettingsValues)[]) {
      (values[key] as SettingsValues[typeof key]) = fields[key].value;
    }
    return values;
  }

  settingValue(identifier: string): SettingValue | undefined {
    const hostField = this.fields[identifier as keyof SettingsValues];
    return (
      hostField?.value ?? this.contributedSettings.get(identifier)?.value.value
    );
  }

  // invariant: Persistence preserves unrecognized user settings (src/modules/settings/settings.invariants.md)
  protected persistenceSnapshot(): Record<string, unknown> {
    const values: Record<string, unknown> = {
      ...this.storedUserRecord,
      ...this.snapshot(),
    };
    for (const [identifier, record] of this.contributedSettings) {
      values[identifier] = record.value.value;
    }
    return values;
  }

  /** Assign the provided fields to their reactive cells. */
  protected applyValues(values: Partial<SettingsValues>): void {
    const fields = this.fields;
    for (const key of Object.keys(values) as (keyof SettingsValues)[]) {
      const value = values[key];
      if (value === undefined) continue;
      (fields[key] as Ref<SettingsValues[typeof key]>).value =
        value as SettingsValues[typeof key];
    }
  }

  protected readSettingsRecord(path: string): Record<string, unknown> {
    const text = this.fileSystem.readTextFile(path);
    if (text === null) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {};
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as Record<string, unknown>;
  }

  protected contributedValue<Value extends SettingValue>(
    contribution: SettingContribution<Value>,
  ): Value {
    const projectValue = this.sanitizeContributedValue(
      contribution,
      this.storedProjectRecord[contribution.identifier],
    );
    if (projectValue !== undefined) return projectValue;
    const userValue = this.sanitizeContributedValue(
      contribution,
      this.storedUserRecord[contribution.identifier],
    );
    return userValue ?? contribution.defaultValue;
  }

  protected sanitizeContributedValue<Value extends SettingValue>(
    contribution: SettingContribution<Value>,
    candidate: unknown,
  ): Value | undefined {
    const spec = contribution.spec;
    if (spec.kind === 'boolean') {
      return typeof candidate === 'boolean' ? (candidate as Value) : undefined;
    }
    if (spec.kind === 'number') {
      return typeof candidate === 'number' && Number.isFinite(candidate)
        ? (candidate as Value)
        : undefined;
    }
    const options = spec.kind === 'enum' ? spec.options : spec.resolveOptions();
    return typeof candidate === 'string' &&
      (candidate === '' || options.includes(candidate))
      ? (candidate as Value)
      : undefined;
  }

  // ---- Static helpers ----------------------------------------------------------------------------

  static get DEFAULTS(): SettingsValues {
    return {
      verticalFlingCeiling: 220,
      scrollAccelGain: 34,
      scrollFriction: 0.015,
      maximumGlideDurationMilliseconds: 900,
      linesPerNotch: 1,
      horizontalScrollModifier: 'alt',
      fastScrollModifier: 'none',
      fastScrollMultiplier: 3,
      scrollbarThickness: 1,
      glyphMode: 'auto',
      graphicsTier: 'auto',
      theme: 'dark',
      wordWrap: false,
      showActivityBar: true,
      showRightActivityBar: false,
      showIndentGuides: true,
      reducedMotion: false,
      workspaceTabPosition: 'top',
      sidebarPosition: 'left',
      panelAlignment: 'center',
      leftDockVerticalSpan: 'full-height',
      rightDockVerticalSpan: 'ends-at-panel',
      agentProvider: 'auto',
      agentSkipPermissions: true,
      agentTerminalFollowMode: 'off',
      agentModel: '',
      agentTypingSpeed: 40,
      terminalCleanPrompt: true,
      agentAudioNarration: false,
      agentNarrationVoice: '',
      agentNarrationRate: 1.0,
      sidebarWidth: 32,
      rightDockWidth: 28,
      primaryDockContentOrder: [],
      panelContentOrder: ['agent', 'terminal'],
    };
  }

  protected static sanitizeIdentifierOrder(
    candidate: unknown,
  ): string[] | undefined {
    if (
      !Array.isArray(candidate) ||
      candidate.length === 0 ||
      !candidate.every(
        (identifier) => typeof identifier === 'string' && identifier.length > 0,
      )
    ) {
      return undefined;
    }
    return [...new Set(candidate as string[])];
  }

  /** Keep only recognized keys whose value has the right shape — corrupt entries are dropped. */
  static sanitize(parsed: unknown): Partial<SettingsValues> {
    if (typeof parsed !== 'object' || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const result: Partial<SettingsValues> = {};
    const readNumber = (key: keyof SettingsValues): void => {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value))
        result[key] = value as never;
    };
    const readModifier = (key: keyof SettingsValues): void => {
      const value = record[key];
      if (
        typeof value === 'string' &&
        this.$allowedScrollModifiers.has(value as ScrollModifier)
      ) {
        result[key] = value as never;
      }
    };
    readNumber('verticalFlingCeiling');
    readNumber('scrollAccelGain');
    readNumber('scrollFriction');
    readNumber('maximumGlideDurationMilliseconds');
    readNumber('linesPerNotch');
    readModifier('horizontalScrollModifier');
    readModifier('fastScrollModifier');
    readNumber('fastScrollMultiplier');
    readNumber('scrollbarThickness');
    if (
      typeof record.glyphMode === 'string' &&
      this.$allowedGlyphModes.has(record.glyphMode as GlyphMode)
    ) {
      result.glyphMode = record.glyphMode as GlyphMode;
    }
    if (
      typeof record.graphicsTier === 'string' &&
      this.$allowedGraphicsTiers.has(record.graphicsTier as GraphicsTierSetting)
    ) {
      result.graphicsTier = record.graphicsTier as GraphicsTierSetting;
    }
    if (typeof record.theme === 'string') result.theme = record.theme;
    if (typeof record.wordWrap === 'boolean') result.wordWrap = record.wordWrap;
    if (typeof record.showActivityBar === 'boolean')
      result.showActivityBar = record.showActivityBar;
    if (typeof record.showRightActivityBar === 'boolean')
      result.showRightActivityBar = record.showRightActivityBar;
    if (typeof record.showIndentGuides === 'boolean')
      result.showIndentGuides = record.showIndentGuides;
    if (typeof record.reducedMotion === 'boolean')
      result.reducedMotion = record.reducedMotion;
    if (
      typeof record.workspaceTabPosition === 'string' &&
      this.$allowedWorkspaceTabPositions.has(
        record.workspaceTabPosition as WorkspaceTabPosition,
      )
    ) {
      result.workspaceTabPosition =
        record.workspaceTabPosition as WorkspaceTabPosition;
    }
    if (
      typeof record.sidebarPosition === 'string' &&
      this.$allowedSidebarPositions.has(
        record.sidebarPosition as SidebarPosition,
      )
    ) {
      result.sidebarPosition = record.sidebarPosition as SidebarPosition;
    }
    if (
      record.panelAlignment === 'justify' ||
      record.panelAlignment === 'left'
    ) {
      result.panelAlignment = 'center';
    } else if (
      typeof record.panelAlignment === 'string' &&
      this.$allowedPanelAlignments.has(record.panelAlignment as PanelAlignment)
    ) {
      result.panelAlignment = record.panelAlignment as PanelAlignment;
    }
    if (
      typeof record.leftDockVerticalSpan === 'string' &&
      this.$allowedDockVerticalSpans.has(
        record.leftDockVerticalSpan as DockVerticalSpan,
      )
    ) {
      result.leftDockVerticalSpan =
        record.leftDockVerticalSpan as DockVerticalSpan;
    }
    if (
      typeof record.rightDockVerticalSpan === 'string' &&
      this.$allowedDockVerticalSpans.has(
        record.rightDockVerticalSpan as DockVerticalSpan,
      )
    ) {
      result.rightDockVerticalSpan =
        record.rightDockVerticalSpan as DockVerticalSpan;
    }
    if (
      typeof record.agentProvider === 'string' &&
      this.$allowedAgentProviders.has(record.agentProvider as AgentProvider)
    ) {
      result.agentProvider = record.agentProvider as AgentProvider;
    }
    if (typeof record.agentSkipPermissions === 'boolean')
      result.agentSkipPermissions = record.agentSkipPermissions;
    if (
      typeof record.agentTerminalFollowMode === 'string' &&
      this.$allowedAgentTerminalFollowModes.has(
        record.agentTerminalFollowMode as AgentTerminalFollowMode,
      )
    ) {
      result.agentTerminalFollowMode =
        record.agentTerminalFollowMode as AgentTerminalFollowMode;
    }
    if (typeof record.agentModel === 'string')
      result.agentModel = record.agentModel;
    readNumber('agentTypingSpeed');
    if (typeof record.terminalCleanPrompt === 'boolean')
      result.terminalCleanPrompt = record.terminalCleanPrompt;
    if (typeof record.agentAudioNarration === 'boolean')
      result.agentAudioNarration = record.agentAudioNarration;
    if (typeof record.agentNarrationVoice === 'string')
      result.agentNarrationVoice = record.agentNarrationVoice;
    readNumber('agentNarrationRate');
    readNumber('sidebarWidth');
    readNumber('rightDockWidth');
    const primaryDockContentOrder = this.sanitizeIdentifierOrder(
      record.primaryDockContentOrder,
    );
    if (primaryDockContentOrder)
      result.primaryDockContentOrder = primaryDockContentOrder;
    const panelContentOrder = this.sanitizeIdentifierOrder(
      record.panelContentOrder,
    );
    if (panelContentOrder) result.panelContentOrder = panelContentOrder;
    return result;
  }

  protected static get $allowedAgentTerminalFollowModes(): ReadonlySet<AgentTerminalFollowMode> {
    return new Set(['follow-all', 'on-error', 'on-request', 'off']);
  }
}

export namespace Settings {
  export const $Class = Static($Settings);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

/** The modifier key that re-routes wheel input, or `none` to leave it unbound. */
export type ScrollModifier = 'alt' | 'shift' | 'ctrl' | 'none';

/** How glyphs are selected for rendering: automatic detection or a forced tier. */
export type GlyphMode = 'auto' | 'nerd' | 'unicode' | 'ascii';

/** Where the project-layer tab strip is mounted in the root frame. */
export type WorkspaceTabPosition = 'top' | 'left';

/** Which engine backs the native agent pane. */
export type AgentProvider = 'auto' | 'claude' | 'codex';

/** When completed terminal commands enter the native agent session. */
export type AgentTerminalFollowMode =
  'follow-all' | 'on-error' | 'on-request' | 'off';

/** The full set of settable values — one field per reactive getter on the store. */
export interface SettingsValues {
  verticalFlingCeiling: number;
  scrollAccelGain: number;
  scrollFriction: number;
  maximumGlideDurationMilliseconds: number;
  linesPerNotch: number;
  horizontalScrollModifier: ScrollModifier;
  fastScrollModifier: ScrollModifier;
  fastScrollMultiplier: number;
  scrollbarThickness: number;
  glyphMode: GlyphMode;
  graphicsTier: GraphicsTierSetting;
  theme: string;
  wordWrap: boolean;
  showActivityBar: boolean;
  showRightActivityBar: boolean;
  showIndentGuides: boolean;
  reducedMotion: boolean;
  workspaceTabPosition: WorkspaceTabPosition;
  sidebarPosition: SidebarPosition;
  panelAlignment: PanelAlignment;
  leftDockVerticalSpan: DockVerticalSpan;
  rightDockVerticalSpan: DockVerticalSpan;
  agentProvider: AgentProvider;
  agentSkipPermissions: boolean;
  agentTerminalFollowMode: AgentTerminalFollowMode;
  agentModel: string;
  agentTypingSpeed: number;
  terminalCleanPrompt: boolean;
  agentAudioNarration: boolean;
  agentNarrationVoice: string;
  agentNarrationRate: number;
  sidebarWidth: number;
  rightDockWidth: number;
  primaryDockContentOrder: string[];
  panelContentOrder: string[];
}

/** Narrow filesystem seam the store depends on — the whole surface a fake must satisfy. */
export interface SettingsFileSystem {
  readTextFile(path: string): string | null;
  writeTextFile(path: string, content: string): void;
  homeDirectory(): string;
}

/** Locations the store reads from and writes back to; any omitted field is derived from the OS. */
export interface SettingsPaths {
  userPath?: string;
  projectPath?: string;
  workspaceRoot?: string;
}

export interface SettingsOptions {
  fileSystem?: SettingsFileSystem;
}

interface ContributedSettingRecord<Value extends SettingValue> {
  contribution: SettingContribution<Value>;
  value: Ref<Value>;
}
