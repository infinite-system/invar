// Symbol marks as swappable data, each level of the glyph fallback ladder.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { GlyphLevel } from './TerminalCapabilities';

class $ThemeIcons {
  protected static cache<Value>(propertyName: string, value: Value): Value {
    Object.defineProperty(this, propertyName, { configurable: true, value });
    return value;
  }

  // THE symbol-mark table: one row per capability tier, one column per symbol class. Every surface
  // that marks a classified thing — the file tree, the breadcrumb popup, the completion popup —
  // classifies into a `SymbolClass` and reads its mark here. There is no second table and no second
  // resolver, so a vocabulary change is one edit that reaches every consumer at once.
  //
  // The code-symbol classes are grouped into FAMILIES on purpose: related kinds must look related at
  // a glance, which is the whole value of a kind glyph. `callable` is the letterform you invoke;
  // `type`, `value`, and `module` share the square motif (a shape you instantiate, a slot holding a
  // value, a box whose contents you reach into) because they are one data world; `syntax` is a token
  // the language itself supplies; `unclassified` is the honest empty slot.
  //
  // The nerd row repeats the unicode marks for the code-symbol classes rather than guessing at
  // Nerd-Font codicon code points: a wrong private-use code point renders as a silent tofu box,
  // which is strictly worse than a correct portable mark, and no Nerd Font exists in this
  // repository to verify a guess against. `overviewMark` and the transcript rule already repeat a
  // portable mark at the nerd tier for the same reason.
  //
  // invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
  // invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
  protected static get $symbolMarks(): Record<GlyphLevel, SymbolMarkSet> {
    return this.cache('$symbolMarks', {
      nerd: {
        directoryOpen: '\u{f07c}',
        directoryClosed: '\u{f07b}',
        file: '\u{f15b}',
        typescript: '\u{e628}',
        javascript: '\u{e781}',
        json: '\u{e60b}',
        markdown: '\u{f48a}',
        lockfile: '\u{f023}',
        shellScript: '\u{f489}',
        stylesheet: '\u{e749}',
        markup: '\u{e736}',
        vueComponent: '\u{fd42}',
        webAssembly: '\u{e6a1}',
        image: '\u{f1c5}',
        versionControl: '\u{e702}',
        configuration: '\u{e6b2}',
        callable: 'ƒ',
        type: '▣',
        value: '▪',
        module: '▤',
        syntax: '✱',
        unclassified: '▫',
      },
      unicode: {
        directoryOpen: '▾',
        directoryClosed: '▸',
        file: '·',
        typescript: '◆',
        javascript: '●',
        json: '⛃',
        markdown: '✎',
        lockfile: '🔒',
        shellScript: '⚙',
        stylesheet: '❖',
        markup: '◈',
        vueComponent: '◇',
        webAssembly: '⬡',
        image: '🖼',
        versionControl: '⑂',
        configuration: '⚙',
        // ƒ (U+0192), the function letterform: a method, a function, and a constructor are the one
        // thing you CALL, so they share one mark.
        callable: 'ƒ',
        // A square holding something — a shape you instantiate.
        type: '▣',
        // A small filled square — one slot holding a value.
        value: '▪',
        // A ruled square — a box whose contents you reach into.
        module: '▤',
        // A heavy asterisk — a token the language itself supplies.
        syntax: '✱',
        // A hollow small square — the provider named no kind.
        unclassified: '▫',
      },
      ascii: {
        directoryOpen: '-',
        directoryClosed: '+',
        file: ' ',
        // A no-unicode terminal shows no file-TYPE mark, exactly as it did before this table existed:
        // the tree's ascii rung has always been the folder/file trio alone.
        typescript: ' ',
        javascript: ' ',
        json: ' ',
        markdown: ' ',
        lockfile: ' ',
        shellScript: ' ',
        stylesheet: ' ',
        markup: ' ',
        vueComponent: ' ',
        webAssembly: ' ',
        image: ' ',
        versionControl: ' ',
        configuration: ' ',
        // The code-symbol families still degrade LEGIBLY — one letter per family, and none of them
        // the folder/file marks that share this column when a completion list offers paths.
        callable: 'f',
        type: 't',
        value: 'v',
        module: 'm',
        syntax: 'k',
        unclassified: '.',
      },
    });
  }

  // The filesystem classifier's data: an extension names a file FAMILY, never a mark. Extensions that
  // shared a mark at every tier before this table existed share a class now, which is why the map
  // loses nothing — `.ts`/`.tsx`, `.js`/`.jsx`, the four image extensions, and `.toml`/`.yaml`/`.yml`
  // each painted one glyph per tier already.
  protected static get $symbolClassesByFileExtension(): Record<
    string,
    SymbolClass
  > {
    return this.cache('$symbolClassesByFileExtension', {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      lock: 'lockfile',
      sh: 'shellScript',
      css: 'stylesheet',
      html: 'markup',
      vue: 'vueComponent',
      wasm: 'webAssembly',
      png: 'image',
      jpg: 'image',
      svg: 'image',
      gif: 'image',
      git: 'versionControl',
      gitignore: 'versionControl',
      toml: 'configuration',
      yaml: 'configuration',
      yml: 'configuration',
    });
  }

  // Every cell mark another surface already owns, keyed to its OWNER. A new symbol class must not
  // paint one of these: the same mark carrying two meanings is unreadable. Two properties make this
  // table load-bearing rather than decorative. It records OWNERSHIP, not just membership, so a slot
  // can ask "is this mark reserved by someone ELSE"; and every entry the theme owns is READ from the
  // vocabulary that paints it, so swapping a vocabulary glyph can never leave the reserved table
  // describing the previous one. The `●` entry is the exception, and the reason is a defect: the
  // dirty/active tab marker is a literal inside `TabBarRenderer`, not a theme slot, so the theme
  // cannot read it from its owner.
  protected static get $reservedMarks(): ReadonlyMap<string, string> {
    const unicodeVocabulary = this.$interfaceGlyphVocabularies.unicode;
    return this.cache(
      '$reservedMarks',
      new Map([
        [
          unicodeVocabulary.activityAccentBar,
          'the diff and activity accent bar',
        ],
        ['●', 'the dirty and active tab marker (a TabBarRenderer literal)'],
        [
          this.$tabSeparators.unicode,
          'the buffer-tab separator and the terminal prompt',
        ],
        [unicodeVocabulary.overviewMark, 'the editor overview pip'],
        [unicodeVocabulary.panelExpand, 'panel expand'],
        [unicodeVocabulary.panelRestore, 'panel restore'],
        [unicodeVocabulary.panelAdd, 'panel add'],
        [unicodeVocabulary.panelClose, 'panel close'],
        [unicodeVocabulary.activityFiles, 'activity: Explorer'],
        [unicodeVocabulary.activitySourceControl, 'activity: Source Control'],
        [unicodeVocabulary.activityExtensions, 'activity: Extensions'],
        [
          unicodeVocabulary.activitySearch,
          'activity: Search, and the find field',
        ],
        [
          unicodeVocabulary.activitySettings,
          'activity: Settings, and the status-bar settings affordance',
        ],
        [this.$symbolMarks.unicode.webAssembly, 'the WebAssembly file mark'],
      ]),
    );
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
        overviewMark: '•',
      },
      unicode: {
        // ≡ (U+2261) not ☰ (U+2630): OpenTUI measures U+2630 as TWO cells while the terminal
        // renders ONE, so the active Explorer row shifted everything right of it one column left.
        // U+2261 carries the same list-of-lines meaning at an unambiguous single cell.
        activityFiles: '≡',
        activitySourceControl: '⑂',
        // ⬢ BLACK HEXAGON is the module/package convention and stays legible at terminal size,
        // where ⊞'s thin internal cross disappeared for the user who reported it.
        activityExtensions: '⬢',
        activitySearch: '⌕',
        activitySettings: '⚙',
        activityAccentBar: '▎',
        panelAdd: '+',
        panelExpand: '↗',
        panelRestore: '↙',
        panelClose: '×',
        overviewMark: '•',
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
        overviewMark: '.',
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
        search: '⌕',
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

  /** The whole symbol-mark row for a tier — read once by a consumer that marks many items. */
  static symbolMarksFor(level: GlyphLevel): SymbolMarkSet {
    return this.$symbolMarks[level];
  }

  /** The one resolver: a classified thing plus a capability tier resolve to one mark. */
  // invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
  static symbolMarkFor(level: GlyphLevel, symbolClass: SymbolClass): string {
    return this.$symbolMarks[level][symbolClass];
  }

  /** The recorded reserved marks, each mapped to the surface that already owns it. */
  static get reservedMarks(): ReadonlyMap<string, string> {
    return this.$reservedMarks;
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

  /** Classify a filesystem entry. The filesystem's half of the question: WHAT is this thing? */
  static symbolClassForFileEntry(
    name: string,
    isDirectory: boolean,
    open = false,
  ): SymbolClass {
    if (isDirectory) return open ? 'directoryOpen' : 'directoryClosed';
    if (name === '.gitignore') return 'versionControl';
    const dotIndex = name.lastIndexOf('.');
    const extension =
      dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
    return this.$symbolClassesByFileExtension[extension] ?? 'file';
  }

  /** Resolve a filesystem entry's mark: classify, then look the class up in the one table. */
  // invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
  // invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
  static iconFor(
    level: GlyphLevel,
    name: string,
    isDirectory: boolean,
    open = false,
  ): string {
    return this.symbolMarkFor(
      level,
      this.symbolClassForFileEntry(name, isDirectory, open),
    );
  }
}

export namespace ThemeIcons {
  export const $Class = $ThemeIcons;
  export const Class = Static($ThemeIcons);
}

/**
 * What a marked thing IS, independent of how it looks. The container and file-type classes are what
 * the file tree and the breadcrumb popup classify into; the code-symbol classes are what a completion
 * item classifies into; `file` and `directoryClosed` are shared by both, because an LSP file or folder
 * completion is the same thing the tree already marks.
 */
export type SymbolClass =
  // Container and default classes.
  | 'directoryOpen'
  | 'directoryClosed'
  | 'file'
  // File-type classes — one per file family the tree distinguishes.
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'lockfile'
  | 'shellScript'
  | 'stylesheet'
  | 'markup'
  | 'vueComponent'
  | 'webAssembly'
  | 'image'
  | 'versionControl'
  | 'configuration'
  // Code-symbol families — one per group of completion kinds that should look related.
  | 'callable'
  | 'type'
  | 'value'
  | 'module'
  | 'syntax'
  | 'unclassified';

/** One capability tier's complete row: every symbol class has a mark, so lookup is total. */
export type SymbolMarkSet = Record<SymbolClass, string>;

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
  overviewMark: string;
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
