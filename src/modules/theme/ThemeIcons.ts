// File-type icon sets as swappable data, each level of the glyph fallback ladder.
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { Static } from 'ivue/extras';
import type { GlyphLevel } from './TerminalCapabilities';

export interface IconSet {
  // by extension (no dot) or special key
  ext: Record<string, string>;
  folderOpen: string;
  folderClosed: string;
  file: string;
}

/** Git changes-row action button glyphs — SINGLE-CELL each so the button hit-zone columns align. */
export interface ActionIconSet {
  open: string;
  discard: string;
  stage: string;
  unstage: string;
  preview: string;
}

/** Single-cell staging checkbox glyphs (unchecked ↔ checked) for the git changes rows. */
export interface CheckboxIconSet {
  unchecked: string;
  checked: string;
}

/** Find-bar action-button glyphs — SINGLE-CELL each so the button hit-zone columns align (the
 *  case-sensitivity affordance keeps its VS Code `Aa` two-letter label, not a glyph). */
export interface FindIconSet {
  previous: string;
  next: string;
  replace: string;
  replaceAll: string;
  toggleMode: string;
}

const NERD: IconSet = {
  ext: {
    ts: '', tsx: '', js: '', jsx: '',
    json: '', md: '', lock: '', sh: '',
    css: '', html: '', vue: '﵂', wasm: '',
    png: '', jpg: '', svg: '', gif: '',
    git: '', gitignore: '', toml: '', yaml: '', yml: '',
  },
  folderOpen: '',
  folderClosed: '',
  file: '',
};

const UNICODE: IconSet = {
  ext: {
    ts: '◆', tsx: '◆', js: '●', jsx: '●', json: '⛃', md: '✎',
    lock: '🔒', sh: '⚙', css: '❖', html: '◈', vue: '◇', wasm: '⬡',
    png: '🖼', jpg: '🖼', svg: '🖼', gif: '🖼',
    git: '⎇', gitignore: '⎇', toml: '⚙', yaml: '⚙', yml: '⚙',
  },
  folderOpen: '▾',
  folderClosed: '▸',
  file: '·',
};

const ASCII: IconSet = {
  ext: {},
  folderOpen: '-',
  folderClosed: '+',
  file: ' ',
};

// invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
const SETS: Record<GlyphLevel, IconSet> = {
  nerd: NERD,
  unicode: UNICODE,
  ascii: ASCII,
};

// Action-button glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
// letter fallback (o/d/+/-) so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
const ACTION_ICONS: Record<GlyphLevel, ActionIconSet> = {
  nerd: { open: '\u{f08e}', discard: '\u{f0e2}', stage: '\u{f067}', unstage: '\u{f068}', preview: '\u{f06e}' }, // fa external-link / undo / plus / minus / eye
  unicode: { open: '↗', discard: '↩', stage: '✚', unstage: '−', preview: '◫' },
  ascii: { open: 'o', discard: 'd', stage: '+', unstage: '-', preview: 'p' },
};

// Staging-checkbox glyph ladder. nerd = fa square / check-square; unicode = ballot box ☐/☑;
// ascii = blank / x so a no-nerd-font terminal still degrades to the classic ` ` / `x`.
const CHECKBOX_ICONS: Record<GlyphLevel, CheckboxIconSet> = {
  nerd: { unchecked: '\u{f0c8}', checked: '\u{f14a}' },
  unicode: { unchecked: '☐', checked: '☑' },
  ascii: { unchecked: ' ', checked: 'x' },
};

// Find-bar action glyph ladder. nerd = nerd-font glyphs; unicode = single-cell symbols; ascii = the
// letter/arrow fallback so a no-nerd-font terminal still reads. Each glyph is exactly one cell.
const FIND_ICONS: Record<GlyphLevel, FindIconSet> = {
  nerd: { previous: '\u{f062}', next: '\u{f063}', replace: '\u{f021}', replaceAll: '\u{f051}', toggleMode: '\u{f0ec}' }, // fa up / down / refresh / step-forward / exchange
  unicode: { previous: '↑', next: '↓', replace: '⟳', replaceAll: '⇊', toggleMode: '⇅' },
  ascii: { previous: '^', next: 'v', replace: 'r', replaceAll: 'R', toggleMode: 'x' },
};

function $iconSetFor(level: GlyphLevel): IconSet {
  return SETS[level];
}

function $actionIconsFor(level: GlyphLevel): ActionIconSet {
  return ACTION_ICONS[level];
}

function $checkboxIconsFor(level: GlyphLevel): CheckboxIconSet {
  return CHECKBOX_ICONS[level];
}

function $findIconsFor(level: GlyphLevel): FindIconSet {
  return FIND_ICONS[level];
}

// Alert / warning glyph ladder (single cell): nerd = fa exclamation-triangle; unicode = ⚠; ascii = !.
// Used to flag an un-openable path in the open-project navigator, painted in the theme warning colour.
const ALERT_ICONS: Record<GlyphLevel, string> = {
  nerd: '\u{f071}',
  unicode: '⚠',
  ascii: '!',
};

function $alertIconFor(level: GlyphLevel): string {
  return ALERT_ICONS[level];
}

/** Resolve an icon for a filename against a set (extension keyed, with folder/file default). */
// invariant: The glyph ladder degrades icons single-cell and legible (src/modules/theme/theme.invariants.md)
function $iconFor(set: IconSet, name: string, isDirectory: boolean, open = false): string {
  if (isDirectory) return open ? set.folderOpen : set.folderClosed;
  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
  if (name === '.gitignore') return set.ext.git ?? set.file;
  return set.ext[extension] ?? set.file;
}

class $ThemeIcons {
  static iconSetFor = $iconSetFor;
  static actionIconsFor = $actionIconsFor;
  static checkboxIconsFor = $checkboxIconsFor;
  static findIconsFor = $findIconsFor;
  static alertIconFor = $alertIconFor;
  static iconFor = $iconFor;
}

export namespace ThemeIcons {
  export const $Class = $ThemeIcons;
  export const Class = Static($ThemeIcons);
}
