/**
 * Find class selectors in the Field v2 stylesheet that no source file can
 * produce, and find rules that a later rule of the same selector overrides.
 *
 * Run: bun .invar/tasks/in-progress/419-field-v2-opus-synthesis/419-dead-selector-census.ts
 *
 * Output: one UNREACHABLE line per class token that appears in no template,
 * no TypeScript file, and no template-literal prefix that could build it; then
 * one DUPLICATE line per selector declared more than once. A stylesheet with
 * zero UNREACHABLE and zero DUPLICATE lines is a stylesheet whose rules all
 * still describe the app. A nonzero count is dead law: a reader trusts it and
 * the browser ignores it.
 */
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const toolRoot = 'tools/invariant-field-v2';
const stylesheet = readFileSync(join(toolRoot, 'styles.css'), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' || entry.name === 'fixtures'
        ? []
        : sourceFiles(path);
    }
    if (entry.name.endsWith('.test.ts')) return [];
    return /\.(ts|vue|html)$/.test(entry.name) ? [path] : [];
  });
}

const sourceText = sourceFiles(toolRoot)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

// The app builds some class names from a value, so the whole name never
// appears in the source. Every such prefix is listed here on purpose: an
// automatic guess rescues far too much (`record-${identifier}` builds element
// ids, not classes, and would silently rescue every `record-*` rule).
const INTERPOLATED_CLASS_PREFIXES = [
  'record-mark-',
  'record-verification-',
  'record-event-',
  'domain-sector-',
  'kind-',
  'timeline-event-count-',
];

const classTokens = new Set<string>();
for (const match of stylesheet.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
  classTokens.add(match[1]!);
}

const unreachableTokens = [...classTokens].filter((token) => {
  // The token must appear as a whole class name, not as a prefix of a longer
  // one: `record-field` inside `record-field-accordions` is a different class.
  if (new RegExp(`(?<![\\w-])${token}(?![\\w-])`).test(sourceText))
    return false;
  return !INTERPOLATED_CLASS_PREFIXES.some(
    (prefix) => token.startsWith(prefix) && token.length > prefix.length,
  );
});

// Count a selector only against others in the SAME at-rule context. A
// selector repeated inside a media query is a deliberate override; a selector
// repeated at the top level is a silent one.
const selectorCounts = new Map<string, number>();
let atRuleDepth = 0;
let blockDepth = 0;
let pendingSelector = '';
for (const token of stylesheet.split(/([{}])/)) {
  if (token === '{') {
    if (pendingSelector.trim().startsWith('@')) atRuleDepth++;
    else if (atRuleDepth === 0 && blockDepth === 0) {
      const selector = pendingSelector.trim().replace(/\s+/g, ' ');
      if (selector) {
        selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1);
      }
    }
    if (!pendingSelector.trim().startsWith('@')) blockDepth++;
    pendingSelector = '';
    continue;
  }
  if (token === '}') {
    if (blockDepth > 0) blockDepth--;
    else if (atRuleDepth > 0) atRuleDepth--;
    pendingSelector = '';
    continue;
  }
  pendingSelector = token.split('}').at(-1)!;
}

for (const token of unreachableTokens.sort()) {
  console.log(`UNREACHABLE .${token}`);
}
for (const [selector, count] of [...selectorCounts].sort()) {
  if (count > 1) console.log(`DUPLICATE ${count}x ${selector}`);
}
console.log(
  `CENSUS unreachable=${unreachableTokens.length} duplicated=${[...selectorCounts.values()].filter((count) => count > 1).length}`,
);
