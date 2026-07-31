import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DesignTokens } from './DesignTokens';

describe('DesignTokens', () => {
  test('generates every token as one CSS custom property', () => {
    const stylesheet = DesignTokens.Class.stylesheet();
    const declarations = Object.keys(DesignTokens.Class.VALUES).map(
      (tokenName) => `--${tokenName}:`,
    );
    for (const declaration of declarations) {
      expect(stylesheet).toContain(declaration);
    }
    expect(stylesheet.match(/^\s+--/gm)).toHaveLength(declarations.length);
  });

  test('keeps color, spacing, type, and radius values behind tokens', () => {
    const directColor = /#[\da-f]{3,8}\b|rgba?\(\s*\d/i;
    const directDesignValue =
      /(?:^|\n)\s*(?:font-(?:family|size|weight)|letter-spacing|line-height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|gap|border-radius):(?!\s*(?:var\(|inherit\b))\s*[^;\n]+/m;
    const componentStylesheet = readFileSync(
      join(import.meta.dir, 'styles.css'),
      'utf8',
    );

    expect('#fff').toMatch(directColor);
    expect('  margin: 7px;').toMatch(directDesignValue);
    expect(componentStylesheet).not.toMatch(directColor);
    expect(componentStylesheet).not.toMatch(directDesignValue);
  });
});
