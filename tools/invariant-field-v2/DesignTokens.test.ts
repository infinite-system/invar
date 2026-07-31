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

  // The design research folder publishes its own token table for the static
  // mockup. Two tables for one role is exactly the drift this instrument
  // exists to catch, so every shared role must carry the same value.
  test('agrees with the design language token table on every shared role', () => {
    const designStylesheet = readFileSync(
      join(import.meta.dir, '..', 'invariant-field-v2-design', 'tokens.css'),
      'utf8',
    );
    const designValues = new Map(
      [...designStylesheet.matchAll(/--(field-[\w-]+):\s*([^;]+);/g)].map(
        (declaration) => [
          declaration[1]!,
          declaration[2]!.trim().toLowerCase(),
        ],
      ),
    );
    const sharedRoles: Record<string, string> = {
      'field-background-abyss': 'color-background',
      'field-background-panel': 'color-panel',
      'field-background-panel-raised': 'color-panel-raised',
      'field-background-control': 'color-panel-active',
      'field-border-default': 'color-border',
      'field-border-strong': 'color-border-strong',
      'field-text-primary': 'color-foreground-strong',
      'field-text-secondary': 'color-foreground',
      'field-text-tertiary': 'color-muted',
      'field-text-disabled': 'color-muted-dark',
      'field-signal-focus': 'color-focus',
      'field-signal-selection': 'color-selection',
      'field-signal-reality': 'color-reality',
      'field-signal-success': 'color-success',
      'field-signal-warning': 'color-warning',
      'field-signal-alarm': 'color-danger',
      'field-signal-rot': 'color-rot',
      'field-kind-reality-absolute': 'color-reality-absolute',
      'field-kind-reality-renegotiable': 'color-reality-renegotiable',
      'field-kind-chosen': 'color-chosen',
      'field-domain-system': 'color-domain-system',
      'field-domain-state': 'color-domain-state',
      'field-domain-interaction': 'color-domain-interaction',
      'field-domain-language': 'color-domain-language',
      'field-domain-data': 'color-domain-data',
      'field-domain-process': 'color-domain-process',
      'field-domain-evidence': 'color-domain-evidence',
      'field-domain-risk': 'color-domain-risk',
    };
    const applicationValues = DesignTokens.Class.VALUES as Record<
      string,
      string
    >;
    const disagreements: string[] = [];
    for (const [designName, applicationName] of Object.entries(sharedRoles)) {
      const designValue = designValues.get(designName);
      expect(designValue, `the design table lost ${designName}`).toBeDefined();
      const applicationValue =
        applicationValues[applicationName]?.toLowerCase();
      expect(
        applicationValue,
        `the application table lost ${applicationName}`,
      ).toBeDefined();
      if (designValue !== applicationValue) {
        disagreements.push(
          `${designName}=${designValue} but ${applicationName}=${applicationValue}`,
        );
      }
    }
    expect(disagreements).toEqual([]);
  });
});
