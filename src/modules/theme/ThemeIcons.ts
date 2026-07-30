// Symbol marks as swappable data, each level of the glyph fallback ladder.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { GlyphLevel } from './TerminalCapabilities';

class $ThemeIcons {
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
  protected static get SYMBOL_MARKS(): Record<GlyphLevel, SymbolMarkSet> {
    return {
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
        // ◉ (U+25C9) not ● (U+25CF): the solid circle is ALSO the dirty and active-tab marker, and
        // "JavaScript source" and "unsaved changes" are unrelated meanings. Nothing composes a file
        // mark and a dirty dot into one row TODAY, but that is a position argument, not a structural
        // one, and this vocabulary already gained a second consumer and now a third. The fisheye keeps
        // the round silhouette users read as JS, is solid so no thin stroke can vanish at terminal
        // size, and measures one cell in BOTH the app's width table and the terminal's.
        javascript: '◉',
        json: '⛃',
        markdown: '✎',
        // ⚿ SQUARED KEY: a portable lock-family mark without emoji
        // presentation. It is one cell in both width authorities and keeps
        // enough solid structure to remain legible at terminal size.
        lockfile: '⚿',
        // $ DOLLAR SIGN: the shell prompt users already read inside these
        // files. No platform association, no font dependency, and it is its
        // own exact ASCII fallback.
        shellScript: '$',
        stylesheet: '❖',
        markup: '◈',
        vueComponent: '◇',
        webAssembly: '⬡',
        // ▞ QUADRANT UPPER RIGHT AND LOWER LEFT: two solid raster cells
        // suggest image pixels without thin detail, emoji presentation, or
        // the ambiguous-width Geometric Shapes block.
        image: '▞',
        versionControl: '⑂',
        // : COLON: the YAML key/value delimiter, read inside the file itself.
        // Same properties as the shell mark, and the ASCII tier keeps it.
        configuration: ':',
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
        shellScript: '$',
        stylesheet: ' ',
        markup: ' ',
        vueComponent: ' ',
        webAssembly: ' ',
        image: ' ',
        versionControl: ' ',
        configuration: ':',
        // The code-symbol families still degrade LEGIBLY — one letter per family, and none of them
        // the folder/file marks that share this column when a completion list offers paths.
        callable: 'f',
        type: 't',
        value: 'v',
        module: 'm',
        syntax: 'k',
        unclassified: '.',
      },
    };
  }

  // The filesystem classifier's data: an extension names a file FAMILY, never a mark. Extensions that
  // shared a mark at every tier before this table existed share a class now, which is why the map
  // loses nothing — `.ts`/`.tsx`, `.js`/`.jsx`, the four image extensions, and `.toml`/`.yaml`/`.yml`
  // each painted one glyph per tier already.
  protected static get SYMBOL_CLASSES_BY_FILE_EXTENSION(): Record<
    string,
    SymbolClass
  > {
    return {
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
    };
  }

  // WHO OWNS WHICH MARK. Every mark that can land in a list row's mark column or a single-cell chrome
  // strip, paired with the surface that means something by it. Three properties make this table an
  // instrument rather than a note.
  //
  // It is COMPLETE for those surfaces — including the file-type marks, whose absence was why the
  // recorded collisions below could not be checked. An impossibility claim whose data source is
  // incomplete is a claim that cannot fail.
  //
  // It is DERIVED from the vocabularies that paint the marks, so swapping a glyph cannot leave this
  // table describing the previous one. The single literal is `●`, and that is itself the finding: the
  // dirty/active tab marker is written inside `TabBarRenderer` instead of being a theme slot, so the
  // theme cannot read it from its owner.
  //
  // It is scoped to the UNICODE tier on purpose. That is the tier where every surface draws from one
  // small portable alphabet, so it is the tier where marks are forced to meet. The nerd tier gives
  // each slot its own private-use code point, and the ascii rung is a deliberately degenerate alphabet
  // of letters and punctuation where reuse is unavoidable; the ascii column's own distinctness is
  // asserted separately.
  //
  // NOT yet covered, and named rather than silently omitted: the git-panel action buttons, the staging
  // checkboxes, the find-bar buttons, and the agent-transcript carets. Each lives in its own dedicated
  // affordance column rather than a shared mark column, and each has its own candidate collisions
  // (`↗` is both panel-expand and open-externally; `▸`/`▾` are both directory state and transcript
  // disclosure). Auditing those is a separate change, because resolving any of them moves a hit
  // column.
  protected static get $markOwnerships(): readonly MarkOwnership[] {
    const unicodeVocabulary = this.INTERFACE_GLYPH_VOCABULARIES.unicode;
    const unicodeSymbolMarks = this.SYMBOL_MARKS.unicode;
    return [
      { mark: unicodeVocabulary.activityFiles, owner: 'activity: Explorer' },
      {
        mark: unicodeVocabulary.activitySourceControl,
        owner: 'activity: Source Control',
      },
      {
        mark: unicodeVocabulary.activityExtensions,
        owner: 'activity: Extensions',
      },
      { mark: unicodeVocabulary.activitySearch, owner: 'activity: Search' },
      { mark: unicodeVocabulary.activitySettings, owner: 'activity: Settings' },
      {
        mark: unicodeVocabulary.activityAccentBar,
        owner: 'the diff and activity accent bar',
      },
      { mark: unicodeVocabulary.panelAdd, owner: 'panel add' },
      { mark: unicodeVocabulary.panelExpand, owner: 'panel expand' },
      { mark: unicodeVocabulary.panelRestore, owner: 'panel restore' },
      { mark: unicodeVocabulary.panelClose, owner: 'panel close' },
      {
        mark: unicodeVocabulary.diffPreviousChange,
        owner: 'diff previous change',
      },
      { mark: unicodeVocabulary.diffNextChange, owner: 'diff next change' },
      { mark: unicodeVocabulary.overviewMark, owner: 'the overview pip' },
      { mark: unicodeVocabulary.foldOpen, owner: 'the open fold control' },
      { mark: unicodeVocabulary.foldClosed, owner: 'the closed fold control' },
      {
        mark: unicodeVocabulary.structureDepth,
        owner: 'the structure depth selector',
      },
      {
        mark: this.TAB_SEPARATORS.unicode,
        owner: 'the buffer-tab separator',
      },
      {
        mark: this.TERMINAL_ICONS.unicode,
        owner: 'the status-bar terminal affordance',
      },
      {
        mark: this.SETTINGS_ICONS.unicode,
        owner: 'the status-bar settings affordance',
      },
      {
        mark: this.AGENT_ICONS.unicode,
        owner: 'the status-bar agent affordance',
      },
      {
        mark: unicodeVocabulary.statusUser,
        owner: 'the status-bar current-line author',
      },
      {
        mark: this.RIGHT_DOCK_ICONS.unicode,
        owner: 'the status-bar right-dock affordance',
      },
      {
        mark: this.ALERT_ICONS.unicode,
        owner: 'the un-openable path warning',
      },
      {
        mark: '●',
        owner: 'the dirty and active tab marker (a TabBarRenderer literal)',
      },
      ...(
        Object.entries(unicodeSymbolMarks) as readonly [SymbolClass, string][]
      ).map(([symbolClass, mark]) => ({
        mark,
        owner: `symbol class: ${symbolClass}`,
      })),
    ];
  }

  // The sharings that are INTENDED or KNOWN, each with its reason. A sharing absent from this map
  // fails the gate; a sharing listed here that is no longer real also fails, so the list cannot rot
  // into an allowlist nobody revisits.
  protected static get $declaredMarkSharings(): ReadonlyMap<string, string> {
    return new Map([
      [
        this.SYMBOL_MARKS.unicode.versionControl,
        'INTENDED. The Source Control activity item and a git file row mean the SAME thing — ' +
          'version control — so one mark is consistency, not ambiguity. This is the rule the ' +
          'other entries fail: a mark may be shared only by owners that mean the same thing.',
      ],
      [
        '\u2699',
        'INTENDED, resolved 2026-07-28. The gear now has exactly two owners — the Settings ' +
          'activity item and the status-bar settings affordance — and they mean the SAME ' +
          'thing, so this is the versionControl case, not a collision. It was previously ' +
          'KNOWN-bad: the gear ALSO marked shell scripts and configuration files, two ' +
          'different things landing in the same column, so a `.sh` row and a `.yaml` row were ' +
          'indistinguishable. Those two families moved to `$` and `:` — the syntax users ' +
          'already read inside those files, one cell in both width authorities, and their own ' +
          'exact ASCII fallbacks.',
      ],
      [
        this.TAB_SEPARATORS.unicode,
        'KNOWN, 2026-07-26. The buffer-tab separator and the status-bar terminal affordance both ' +
          'paint the chevron with different meanings. They are in different chrome strips and no ' +
          'surface composes them into one row, so nothing is ambiguous today; unifying or ' +
          'splitting the two is a vocabulary decision, not a fix to make while adding a family.',
      ],
    ]);
  }

  protected static get $markOwnersByMark(): ReadonlyMap<
    string,
    readonly string[]
  > {
    const markOwnersByMark = new Map<string, string[]>();
    for (const ownership of this.$markOwnerships) {
      const owners = markOwnersByMark.get(ownership.mark);
      if (owners === undefined) {
        markOwnersByMark.set(ownership.mark, [ownership.owner]);
        continue;
      }
      owners.push(ownership.owner);
    }
    return markOwnersByMark;
  }

  /** Every recorded mark ownership at the shared portable tier. */
  static get markOwnerships(): readonly MarkOwnership[] {
    return this.$markOwnerships;
  }

  /** The surfaces that mean something by a mark — empty when no surface claims it. */
  static markOwnersFor(mark: string): readonly string[] {
    return this.$markOwnersByMark.get(mark) ?? [];
  }

  /** The reasons recorded for the sharings that are intended or knowingly carried. */
  static get declaredMarkSharings(): ReadonlyMap<string, string> {
    return this.$declaredMarkSharings;
  }

  /** Pure detector, so a test can drive it with a synthetic list and prove it CAN report. */
  static markSharingsIn(
    ownerships: readonly MarkOwnership[],
  ): readonly MarkSharing[] {
    const ownersByMark = new Map<string, string[]>();
    for (const ownership of ownerships) {
      const owners = ownersByMark.get(ownership.mark) ?? [];
      owners.push(ownership.owner);
      ownersByMark.set(ownership.mark, owners);
    }
    return [...ownersByMark.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([mark, owners]) => ({ mark, owners }));
  }

  /** Marks carried by more than one surface at the shared portable tier. */
  static get markSharings(): readonly MarkSharing[] {
    return this.markSharingsIn(this.$markOwnerships);
  }

  /** A sharing nobody declared — the failure this table exists to produce. */
  static get undeclaredMarkSharings(): readonly MarkSharing[] {
    return this.markSharings.filter(
      (sharing) => !this.$declaredMarkSharings.has(sharing.mark),
    );
  }

  /** A declaration whose sharing no longer exists, so the record can never outlive the reality. */
  static get staleMarkSharingDeclarations(): readonly string[] {
    const sharedMarks = new Set(
      this.markSharings.map((sharing) => sharing.mark),
    );
    return [...this.$declaredMarkSharings.keys()].filter(
      (mark) => !sharedMarks.has(mark),
    );
  }

  // Action-button glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
  // letter fallback (o/d/+/-) so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
  protected static get ACTION_ICONS(): Record<GlyphLevel, ActionIconSet> {
    return {
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
    };
  }

  /** Tasks-pane actions: open worktree, task record, latest brief, and latest report. */
  protected static get TASK_ACTION_ICONS(): Record<
    GlyphLevel,
    TaskActionIconSet
  > {
    return {
      nerd: {
        workspace: '\u{f07c}',
        taskRecord: '\u{f15b}',
        latestBrief: '\u{f15c}',
        latestReport: '\u{f00c}',
      },
      unicode: {
        workspace: '▰',
        taskRecord: '▤',
        latestBrief: '◫',
        latestReport: '✓',
      },
      ascii: {
        workspace: 'W',
        taskRecord: 'T',
        latestBrief: 'B',
        latestReport: 'R',
      },
    };
  }

  // Staging-checkbox glyph ladder. nerd = fa square / check-square; unicode = ballot box ☐/☑;
  // ascii = blank / x so a no-nerd-font terminal still degrades to the classic ` ` / `x`.
  protected static get CHECKBOX_ICONS(): Record<GlyphLevel, CheckboxIconSet> {
    return {
      nerd: { unchecked: '\u{f0c8}', checked: '\u{f14a}' },
      unicode: { unchecked: '☐', checked: '☑' },
      ascii: { unchecked: ' ', checked: 'x' },
    };
  }

  // Semantic glyph slots are the indirection between behavior and vocabulary. Consumers name what
  // a cell means; this table alone chooses how that meaning looks at each capability tier.
  // invariant: Appearance is data with a capability fallback (project.invariants.md)
  protected static get INTERFACE_GLYPH_VOCABULARIES(): Record<
    GlyphLevel,
    InterfaceGlyphVocabulary
  > {
    return {
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
        diffPreviousChange: '↑',
        diffNextChange: '↓',
        overviewMark: '•',
        foldOpen: '⌄',
        foldClosed: '›',
        structurePublic: '+',
        structureProtected: '◇',
        structurePrivate: '−',
        structureCached: '$',
        structureOverride: '↑',
        structureGetter: '↤',
        structureSetter: '↦',
        structureDepth: '⛭',
        statusUser: '\u{f007}',
      },
      unicode: {
        // ≡ (U+2261) not ☰ (U+2630): OpenTUI measures U+2630 as TWO cells while the terminal
        // renders ONE, so the active Explorer row shifted everything right of it one column left.
        // U+2261 carries the same list-of-lines meaning at an unambiguous single cell.
        activityFiles: '≡',
        activitySourceControl: '⑂',
        // Third glyph for this slot, and the two failures ARE the specification. ⊞ was
        // unrecognisable: its thin internal cross disappeared at terminal size. ⬢ BLACK HEXAGON was
        // legible but read as oversized beside its siblings — and measurement says that was
        // aesthetic, not a width bug: U+2B22 measures ONE cell in the app table AND renders in one
        // cell in the terminal, so the activity strip was never misaligned; the hexagon simply carries
        // more ink than ≡ ⑂ ⌕ ⚙. The constraint is therefore a narrow band: solid (no fine detail that
        // can vanish), one unambiguous cell, and not visually heavier than the row. ⧫ BLACK LOZENGE is
        // solid, keeps a package-like read, is slimmer than the hexagon, and is East-Asian-Width
        // NEUTRAL rather than AMBIGUOUS — narrow by classification instead of by hope, which also
        // removes a latent risk the hexagon carried even though this terminal agreed on its width.
        activityExtensions: '⧫',
        activitySearch: '⌕',
        activitySettings: '⚙',
        activityAccentBar: '▎',
        panelAdd: '+',
        panelExpand: '↗',
        panelRestore: '↙',
        panelClose: '×',
        diffPreviousChange: '↑',
        diffNextChange: '↓',
        overviewMark: '•',
        foldOpen: '⌄',
        foldClosed: '›',
        structurePublic: '+',
        structureProtected: '◇',
        structurePrivate: '−',
        structureCached: '$',
        structureOverride: '↑',
        structureGetter: '↤',
        structureSetter: '↦',
        structureDepth: '⛭',
        statusUser: '♙',
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
        diffPreviousChange: 'U',
        diffNextChange: 'D',
        overviewMark: '.',
        foldOpen: 'v',
        foldClosed: ']',
        structurePublic: '+',
        structureProtected: '~',
        structurePrivate: '-',
        structureCached: '$',
        structureOverride: '^',
        structureGetter: 'g',
        structureSetter: 's',
        structureDepth: '#',
        statusUser: '@',
      },
    };
  }

  // Markdown-table borders form one vocabulary because their joints must agree as a set. They stay
  // separate from InterfaceGlyphVocabulary: these glyphs describe content geometry, not controls.
  // invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
  protected static get TABLE_BORDERS(): Record<
    GlyphLevel,
    TableBorderGlyphSet
  > {
    return {
      nerd: {
        vertical: '│',
        horizontal: '─',
        intersection: '┼',
        leftJunction: '├',
        rightJunction: '┤',
      },
      unicode: {
        vertical: '│',
        horizontal: '─',
        intersection: '┼',
        leftJunction: '├',
        rightJunction: '┤',
      },
      ascii: {
        vertical: '|',
        horizontal: '-',
        intersection: '+',
        leftJunction: '+',
        rightJunction: '+',
      },
    };
  }

  protected static get $activityIcons(): Record<GlyphLevel, ActivityIconSet> {
    return {
      nerd: this.activityIconSetFrom(this.INTERFACE_GLYPH_VOCABULARIES.nerd),
      unicode: this.activityIconSetFrom(
        this.INTERFACE_GLYPH_VOCABULARIES.unicode,
      ),
      ascii: this.activityIconSetFrom(this.INTERFACE_GLYPH_VOCABULARIES.ascii),
    };
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
  protected static get SETTINGS_ICONS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{f013}', // fa cog / gear
      unicode: '⚙',
      ascii: '*',
    };
  }

  protected static get TERMINAL_ICONS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{f120}', // fa terminal (prompt)
      unicode: '❯',
      ascii: '>',
    };
  }

  protected static get AGENT_ICONS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{f0d0}', // fa magic (the native agent assistant)
      unicode: '✦', // matches AgentPaneContent's switcher glyph
      ascii: 'A',
    };
  }

  protected static get RIGHT_DOCK_ICONS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{f0db}',
      unicode: '▥',
      ascii: 'R',
    };
  }

  // Find-bar action glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
  // letter/arrow fallback so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
  protected static get FIND_ICONS(): Record<GlyphLevel, FindIconSet> {
    return {
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
    };
  }

  /** The whole symbol-mark row for a tier — read once by a consumer that marks many items. */
  static symbolMarksFor(level: GlyphLevel): SymbolMarkSet {
    return this.SYMBOL_MARKS[level];
  }

  /** The one resolver: a classified thing plus a capability tier resolve to one mark. */
  // invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
  static symbolMarkFor(level: GlyphLevel, symbolClass: SymbolClass): string {
    return this.SYMBOL_MARKS[level][symbolClass];
  }

  static settingsIconFor(level: GlyphLevel): string {
    return this.SETTINGS_ICONS[level];
  }

  static terminalIconFor(level: GlyphLevel): string {
    return this.TERMINAL_ICONS[level];
  }

  static agentIconFor(level: GlyphLevel): string {
    return this.AGENT_ICONS[level];
  }

  static rightDockIconFor(level: GlyphLevel): string {
    return this.RIGHT_DOCK_ICONS[level];
  }

  static actionIconsFor(level: GlyphLevel): ActionIconSet {
    return this.ACTION_ICONS[level];
  }

  static taskActionIconsFor(level: GlyphLevel): TaskActionIconSet {
    return this.TASK_ACTION_ICONS[level];
  }

  static checkboxIconsFor(level: GlyphLevel): CheckboxIconSet {
    return this.CHECKBOX_ICONS[level];
  }

  static activityIconsFor(level: GlyphLevel): ActivityIconSet {
    return this.$activityIcons[level];
  }

  static interfaceGlyphVocabularyFor(
    level: GlyphLevel,
  ): InterfaceGlyphVocabulary {
    return this.INTERFACE_GLYPH_VOCABULARIES[level];
  }

  static glyphFor(level: GlyphLevel, slot: GlyphSlot): string {
    return this.INTERFACE_GLYPH_VOCABULARIES[level][slot];
  }

  static tableBordersFor(level: GlyphLevel): TableBorderGlyphSet {
    return this.TABLE_BORDERS[level];
  }

  static findIconsFor(level: GlyphLevel): FindIconSet {
    return this.FIND_ICONS[level];
  }

  // Alert / warning glyph ladder (single cell): nerd = fa exclamation-triangle; unicode = ⚠; ascii = !.
  // Used to flag an un-openable path in the open-project navigator, painted in the theme warning colour.
  protected static get ALERT_ICONS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{f071}',
      unicode: '⚠',
      ascii: '!',
    };
  }

  static alertIconFor(level: GlyphLevel): string {
    return this.ALERT_ICONS[level];
  }

  // The spinner animation cycles: braille at glyph-capable tiers, a rotating ascii bar below — a
  // no-unicode terminal still animates.
  protected static get BRAILLE_SPINNER_FRAMES(): readonly string[] {
    return ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];
  }

  protected static get ASCII_SPINNER_FRAMES(): readonly string[] {
    return ['|', '/', '-', '\\'];
  }

  // Agent transcript glyph ladder. The tool cog reuses SETTINGS_ICON per tier (one cog definition);
  // carets are fa caret-right/caret-down degrading to ▸/▾ then >/v; results are fa check/times
  // degrading to ✓/✗ then +/x. Single cell everywhere a column is indexed.
  protected static get $agentTranscriptIcons(): Record<
    GlyphLevel,
    AgentTranscriptIconSet
  > {
    return {
      nerd: {
        caretCollapsed: '\u{f0da}',
        caretExpanded: '\u{f0d7}',
        tool: this.SETTINGS_ICONS.nerd,
        resultOk: '\u{f00c}',
        resultError: '\u{f00d}',
        ellipsis: '…',
        ellipsisCell: '…',
        rule: '─',
        spinnerFrames: this.BRAILLE_SPINNER_FRAMES,
      },
      unicode: {
        caretCollapsed: '▸',
        caretExpanded: '▾',
        tool: this.SETTINGS_ICONS.unicode,
        resultOk: '✓',
        resultError: '✗',
        ellipsis: '…',
        ellipsisCell: '…',
        rule: '─',
        spinnerFrames: this.BRAILLE_SPINNER_FRAMES,
      },
      ascii: {
        caretCollapsed: '>',
        caretExpanded: 'v',
        tool: this.SETTINGS_ICONS.ascii,
        resultOk: '+',
        resultError: 'x',
        ellipsis: '...',
        ellipsisCell: '.',
        rule: '-',
        spinnerFrames: this.ASCII_SPINNER_FRAMES,
      },
    };
  }

  static agentTranscriptIconsFor(level: GlyphLevel): AgentTranscriptIconSet {
    return this.$agentTranscriptIcons[level];
  }

  // Between-buffer-tab powerline separator ladder: solid nerd powerline glyph → portable ❯ → ascii >.
  protected static get TAB_SEPARATORS(): Record<GlyphLevel, string> {
    return {
      nerd: '\u{e0b0}',
      unicode: '❯',
      ascii: '>',
    };
  }

  static tabSeparatorFor(level: GlyphLevel): string {
    return this.TAB_SEPARATORS[level];
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
    return this.SYMBOL_CLASSES_BY_FILE_EXTENSION[extension] ?? 'file';
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
  export const $Class = Static($ThemeIcons);
  export let Class = $Class;
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

/** One surface's claim on one mark: what it paints, and what it means by it. */
export interface MarkOwnership {
  readonly mark: string;
  readonly owner: string;
}

/** A mark more than one surface claims, with every claimant named. */
export interface MarkSharing {
  readonly mark: string;
  readonly owners: readonly string[];
}

export interface ActionIconSet {
  open: string;
  discard: string;
  stage: string;
  unstage: string;
  preview: string;
}

export interface TaskActionIconSet {
  workspace: string;
  taskRecord: string;
  latestBrief: string;
  latestReport: string;
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
  diffPreviousChange: string;
  diffNextChange: string;
  overviewMark: string;
  foldOpen: string;
  foldClosed: string;
  structurePublic: string;
  structureProtected: string;
  structurePrivate: string;
  structureCached: string;
  structureOverride: string;
  structureGetter: string;
  structureSetter: string;
  structureDepth: string;
  statusUser: string;
}

export type GlyphSlot = keyof InterfaceGlyphVocabulary;

export interface TableBorderGlyphSet {
  vertical: string;
  horizontal: string;
  intersection: string;
  leftJunction: string;
  rightJunction: string;
}

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
