// File-type icon sets as swappable data, each level of the glyph fallback ladder.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { GlyphLevel } from './TerminalCapabilities';

class $ThemeIcons {
  protected static cache<Value>(propertyName: string, value: Value): Value {
    Object.defineProperty(this, propertyName, { configurable: true, value });
    return value;
  }

  protected static get $nerd(): IconSet {
    return this.cache('$nerd', {
      ext: {
        ts: '',
        tsx: '',
        js: '',
        jsx: '',
        json: '',
        md: '',
        lock: '',
        sh: '',
        css: '',
        html: '',
        vue: '﵂',
        wasm: '',
        png: '',
        jpg: '',
        svg: '',
        gif: '',
        git: '',
        gitignore: '',
        toml: '',
        yaml: '',
        yml: '',
      },
      folderOpen: '',
      folderClosed: '',
      file: '',
    });
  }

  protected static get $unicode(): IconSet {
    return this.cache('$unicode', {
      ext: {
        ts: '◆',
        tsx: '◆',
        js: '●',
        jsx: '●',
        json: '⛃',
        md: '✎',
        lock: '🔒',
        sh: '⚙',
        css: '❖',
        html: '◈',
        vue: '◇',
        wasm: '⬡',
        png: '🖼',
        jpg: '🖼',
        svg: '🖼',
        gif: '🖼',
        git: '⑂',
        gitignore: '⑂',
        toml: '⚙',
        yaml: '⚙',
        yml: '⚙',
      },
      folderOpen: '▾',
      folderClosed: '▸',
      file: '·',
    });
  }

  protected static get $ascii(): IconSet {
    return this.cache('$ascii', {
      ext: {},
      folderOpen: '-',
      folderClosed: '+',
      file: ' ',
    });
  }

  // invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
  protected static get $sets(): Record<GlyphLevel, IconSet> {
    return this.cache('$sets', {
      nerd: this.$nerd,
      unicode: this.$unicode,
      ascii: this.$ascii,
    });
  }

  // Action-button glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
  // letter fallback (o/d/+/-) so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
  protected static get $actionIcons(): Record<GlyphLevel, ActionIconSet> {
    return this.cache('$actionIcons', {
      nerd: {
        open: '\u{f08e}',
        discard: '\u{f0e2}',
        stage: '\u{f067}',
        unstage: '\u{f068}',
        preview: '\u{f06e}',
      }, // fa external-link / undo / plus / minus / eye
      unicode: {
        open: '↗',
        discard: '↩',
        stage: '✚',
        unstage: '−',
        preview: '◫',
      },
      ascii: {
        open: 'o',
        discard: 'd',
        stage: '+',
        unstage: '-',
        preview: 'p',
      },
    });
  }

  // Staging-checkbox glyph ladder. nerd = fa square / check-square; unicode = ballot box ☐/☑;
  // ascii = blank / x so a no-nerd-font terminal still degrades to the classic ` ` / `x`.
  protected static get $checkboxIcons(): Record<GlyphLevel, CheckboxIconSet> {
    return this.cache('$checkboxIcons', {
      nerd: { unchecked: '\u{f0c8}', checked: '\u{f14a}' },
      unicode: { unchecked: '☐', checked: '☑' },
      ascii: { unchecked: ' ', checked: 'x' },
    });
  }

  // Semantic glyph slots are the indirection between behavior and vocabulary. Consumers name what
  // a cell means; this table alone chooses how that meaning looks at each capability tier.
  // invariant: Appearance is data with a capability fallback (project.invariants.md)
  protected static get $interfaceGlyphVocabularies(): Record<
    GlyphLevel,
    InterfaceGlyphVocabulary
  > {
    return this.cache('$interfaceGlyphVocabularies', {
      nerd: {
        activityFiles: '\u{f07b}',
        activitySourceControl: '\u{e702}',
        activityExtensions: '\u{f487}',
        activitySearch: '\u{f002}',
        activitySettings: '\u{f013}',
        activityAccentBar: '▎',
        panelAdd: '\u{f067}',
        panelExpand: '\u{f065}',
        panelRestore: '\u{f066}',
        panelClose: '\u{f00d}',
      },
      unicode: {
        activityFiles: '☰',
        activitySourceControl: '⑂',
        activityExtensions: '⊞',
        activitySearch: '⚲',
        activitySettings: '⚙',
        activityAccentBar: '▎',
        panelAdd: '+',
        panelExpand: '↗',
        panelRestore: '↙',
        panelClose: '×',
      },
      ascii: {
        activityFiles: 'F',
        activitySourceControl: 'G',
        activityExtensions: 'X',
        activitySearch: '/',
        activitySettings: '*',
        activityAccentBar: '|',
        panelAdd: '+',
        panelExpand: '>',
        panelRestore: '<',
        panelClose: 'x',
      },
    });
  }

  protected static get $activityIcons(): Record<GlyphLevel, ActivityIconSet> {
    return this.cache('$activityIcons', {
      nerd: this.activityIconSetFrom(this.$interfaceGlyphVocabularies.nerd),
      unicode: this.activityIconSetFrom(
        this.$interfaceGlyphVocabularies.unicode,
      ),
      ascii: this.activityIconSetFrom(this.$interfaceGlyphVocabularies.ascii),
    });
  }

  protected static activityIconSetFrom(
    vocabulary: InterfaceGlyphVocabulary,
  ): ActivityIconSet {
    return {
      files: vocabulary.activityFiles,
      sourceControl: vocabulary.activitySourceControl,
      extensions: vocabulary.activityExtensions,
      accentBar: vocabulary.activityAccentBar,
    };
  }

  // Status-bar affordance glyph ladder. nerd = fa cog; unicode = the gear ⚙; ascii = `*` so a
  // no-nerd-font terminal still shows a settings mark. Single cell at every tier.
  protected static get $settingsIcons(): Record<GlyphLevel, string> {
    return this.cache('$settingsIcons', {
      nerd: '\u{f013}', // fa cog / gear
      unicode: '⚙',
      ascii: '*',
    });
  }

  protected static get $terminalIcons(): Record<GlyphLevel, string> {
    return this.cache('$terminalIcons', {
      nerd: '\u{f120}', // fa terminal (prompt)
      unicode: '❯',
      ascii: '>',
    });
  }

  protected static get $agentIcons(): Record<GlyphLevel, string> {
    return this.cache('$agentIcons', {
      nerd: '\u{f544}', // fa robot (the native agent pane)
      unicode: '✦', // matches AgentPaneContent's switcher glyph
      ascii: 'A',
    });
  }

  protected static get $rightDockIcons(): Record<GlyphLevel, string> {
    return this.cache('$rightDockIcons', {
      nerd: '\u{f0db}',
      unicode: '▥',
      ascii: 'R',
    });
  }

  // Find-bar action glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
  // letter/arrow fallback so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
  protected static get $findIcons(): Record<GlyphLevel, FindIconSet> {
    return this.cache('$findIcons', {
      nerd: {
        search: '\u{f002}',
        previous: '\u{f062}',
        next: '\u{f063}',
        replace: '\u{f021}',
        replaceAll: '\u{f051}',
        toggleMode: '\u{f0ec}',
      }, // fa search / up / down / refresh / step-forward / exchange
      unicode: {
        search: '⚲',
        previous: '↑',
        next: '↓',
        replace: '⟳',
        replaceAll: '⇊',
        toggleMode: '⇅',
      },
      ascii: {
        search: '/',
        previous: '^',
        next: 'v',
        replace: 'r',
        replaceAll: 'R',
        toggleMode: 'x',
      },
    });
  }

  static iconSetFor(level: GlyphLevel): IconSet {
    return this.$sets[level];
  }

  static settingsIconFor(level: GlyphLevel): string {
    return this.$settingsIcons[level];
  }

  static terminalIconFor(level: GlyphLevel): string {
    return this.$terminalIcons[level];
  }

  static agentIconFor(level: GlyphLevel): string {
    return this.$agentIcons[level];
  }

  static rightDockIconFor(level: GlyphLevel): string {
    return this.$rightDockIcons[level];
  }

  static actionIconsFor(level: GlyphLevel): ActionIconSet {
    return this.$actionIcons[level];
  }

  static checkboxIconsFor(level: GlyphLevel): CheckboxIconSet {
    return this.$checkboxIcons[level];
  }

  static activityIconsFor(level: GlyphLevel): ActivityIconSet {
    return this.$activityIcons[level];
  }

  static interfaceGlyphVocabularyFor(
    level: GlyphLevel,
  ): InterfaceGlyphVocabulary {
    return this.$interfaceGlyphVocabularies[level];
  }

  static glyphFor(level: GlyphLevel, slot: GlyphSlot): string {
    return this.$interfaceGlyphVocabularies[level][slot];
  }

  static findIconsFor(level: GlyphLevel): FindIconSet {
    return this.$findIcons[level];
  }

  // Alert / warning glyph ladder (single cell): nerd = fa exclamation-triangle; unicode = ⚠; ascii = !.
  // Used to flag an un-openable path in the open-project navigator, painted in the theme warning colour.
  protected static get $alertIcons(): Record<GlyphLevel, string> {
    return this.cache('$alertIcons', {
      nerd: '\u{f071}',
      unicode: '⚠',
      ascii: '!',
    });
  }

  static alertIconFor(level: GlyphLevel): string {
    return this.$alertIcons[level];
  }

  // The spinner animation cycles: braille at glyph-capable tiers, a rotating ascii bar below — a
  // no-unicode terminal still animates.
  protected static get $brailleSpinnerFrames(): readonly string[] {
    return this.cache('$brailleSpinnerFrames', [
      '⠋',
      '⠙',
      '⠹',
      '⠸',
      '⠼',
      '⠴',
      '⠦',
      '⠧',
    ]);
  }

  protected static get $asciiSpinnerFrames(): readonly string[] {
    return this.cache('$asciiSpinnerFrames', ['|', '/', '-', '\\']);
  }

  // Agent transcript glyph ladder. The tool cog reuses SETTINGS_ICON per tier (one cog definition);
  // carets are fa caret-right/caret-down degrading to ▸/▾ then >/v; results are fa check/times
  // degrading to ✓/✗ then +/x. Single cell everywhere a column is indexed.
  protected static get $agentTranscriptIcons(): Record<
    GlyphLevel,
    AgentTranscriptIconSet
  > {
    return this.cache('$agentTranscriptIcons', {
      nerd: {
        caretCollapsed: '\u{f0da}',
        caretExpanded: '\u{f0d7}',
        tool: this.$settingsIcons.nerd,
        resultOk: '\u{f00c}',
        resultError: '\u{f00d}',
        ellipsis: '…',
        ellipsisCell: '…',
        rule: '─',
        spinnerFrames: this.$brailleSpinnerFrames,
      },
      unicode: {
        caretCollapsed: '▸',
        caretExpanded: '▾',
        tool: this.$settingsIcons.unicode,
        resultOk: '✓',
        resultError: '✗',
        ellipsis: '…',
        ellipsisCell: '…',
        rule: '─',
        spinnerFrames: this.$brailleSpinnerFrames,
      },
      ascii: {
        caretCollapsed: '>',
        caretExpanded: 'v',
        tool: this.$settingsIcons.ascii,
        resultOk: '+',
        resultError: 'x',
        ellipsis: '...',
        ellipsisCell: '.',
        rule: '-',
        spinnerFrames: this.$asciiSpinnerFrames,
      },
    });
  }

  static agentTranscriptIconsFor(level: GlyphLevel): AgentTranscriptIconSet {
    return this.$agentTranscriptIcons[level];
  }

  // Between-buffer-tab powerline separator ladder: solid nerd powerline glyph → portable ❯ → ascii >.
  protected static get $tabSeparators(): Record<GlyphLevel, string> {
    return this.cache('$tabSeparators', {
      nerd: '\u{e0b0}',
      unicode: '❯',
      ascii: '>',
    });
  }

  static tabSeparatorFor(level: GlyphLevel): string {
    return this.$tabSeparators[level];
  }

  /** Resolve an icon for a filename against a set (extension keyed, with folder/file default). */
  // invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
  static iconFor(
    set: IconSet,
    name: string,
    isDirectory: boolean,
    open = false,
  ): string {
    if (isDirectory) return open ? set.folderOpen : set.folderClosed;
    const dotIndex = name.lastIndexOf('.');
    const extension =
      dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
    if (name === '.gitignore') return set.ext.git ?? set.file;
    return set.ext[extension] ?? set.file;
  }
}

export namespace ThemeIcons {
  export const $Class = $ThemeIcons;
  export const Class = Static($ThemeIcons);
}

export interface IconSet {
  ext: Record<string, string>;
  folderOpen: string;
  folderClosed: string;
  file: string;
}

export interface ActionIconSet {
  open: string;
  discard: string;
  stage: string;
  unstage: string;
  preview: string;
}

export interface CheckboxIconSet {
  unchecked: string;
  checked: string;
}

export interface ActivityIconSet {
  files: string;
  sourceControl: string;
  extensions: string;
  accentBar: string;
}

export interface InterfaceGlyphVocabulary {
  activityFiles: string;
  activitySourceControl: string;
  activityExtensions: string;
  activitySearch: string;
  activitySettings: string;
  activityAccentBar: string;
  panelAdd: string;
  panelExpand: string;
  panelRestore: string;
  panelClose: string;
}

export type GlyphSlot = keyof InterfaceGlyphVocabulary;

export interface FindIconSet {
  search: string;
  previous: string;
  next: string;
  replace: string;
  replaceAll: string;
  toggleMode: string;
}

export interface AgentTranscriptIconSet {
  caretCollapsed: string;
  caretExpanded: string;
  tool: string;
  resultOk: string;
  resultError: string;
  ellipsis: string;
  ellipsisCell: string;
  rule: string;
  spinnerFrames: readonly string[];
}
