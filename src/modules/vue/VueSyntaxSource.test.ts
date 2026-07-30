import { describe, expect, test } from 'bun:test';
import { TextDocument } from '../text/TextDocument';
import { Workspace } from '../workspace/Workspace';
import { VuePlugin } from './VuePlugin';
import { VueSyntaxSource } from './VueSyntaxSource';

class CountingVueSyntaxSource extends VueSyntaxSource.$Class {
  parseCount = 0;

  protected override parseDocument(text: string) {
    this.parseCount += 1;
    return super.parseDocument(text);
  }
}

function documentFrom(text: string): TextDocument.Instance {
  const document = new TextDocument.Class();
  document.loadFromText(text, '/tmp/component.vue');
  return document;
}

describe('VueSyntaxSource', () => {
  test('routes SFC block content and preserves the outer Vue tags', () => {
    const document = documentFrom(
      [
        '<script setup lang="ts">',
        'const greeting: string = "Hello"; // typed',
        '</script>',
        '<template>',
        '  <button @click="greeting">{{ greeting }}</button>',
        '</template>',
        '<style>',
        '.card { color: #aabbcc; /* css */ }',
        '</style>',
        '<style scoped lang="scss">',
        '$tone: red;',
        '.card { &__title { color: $tone; } // scss }',
        '</style>',
      ].join('\n'),
    );
    const source = new VueSyntaxSource.Class();

    expect(source.languageAtLine(document, 0)).toBe('vue');
    expect(source.languageAtLine(document, 1)).toBe('typescript');
    expect(source.languageAtLine(document, 4)).toBe('vue');
    expect(source.languageAtLine(document, 7)).toBe('css');
    expect(source.languageAtLine(document, 10)).toBe('scss');
    expect(source.spansForLine(document, 1)).toContainEqual({
      text: 'const',
      role: 'keyword',
    });
    expect(source.spansForLine(document, 4)).toContainEqual({
      text: '@click',
      role: 'keyword',
    });
    expect(source.spansForLine(document, 7)).toContainEqual({
      text: 'color',
      role: 'keyword',
    });
    expect(source.spansForLine(document, 10)).toContainEqual({
      text: '$tone',
      role: 'variable',
    });
    expect(source.spansForLine(document, 11)).toContainEqual({
      text: '// scss }',
      role: 'comment',
    });
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
      expect(
        source
          .spansForLine(document, lineIndex)
          .map((span) => span.text)
          .join(''),
      ).toBe(document.line(lineIndex));
    }
  });

  test('reparses once per revision and changes only the edited block language', () => {
    const document = documentFrom(
      '<script setup lang="ts">\nconst value: number = 1;\n</script>',
    );
    const source = new CountingVueSyntaxSource();

    source.spansForLine(document, 0);
    source.spansForLine(document, 1);
    source.regions(document);
    expect(source.parseCount).toBe(1);
    expect(source.languageAtLine(document, 1)).toBe('typescript');

    document.setLine(0, '<script setup lang="js">');

    expect(source.languageAtLine(document, 1)).toBe('javascript');
    expect(source.parseCount).toBe(2);
    expect(source.languageAtLine(document, 2)).toBe('vue');
  });

  test('keeps malformed and unknown content honest without throwing', () => {
    const document = documentFrom(
      [
        '<custom-block>',
        'unclassified { value }',
        '</custom-block>',
        '<style lang="scss">',
        '$tone: red;',
      ].join('\n'),
    );
    const source = new VueSyntaxSource.Class();

    expect(source.languageAtLine(document, 1)).toBe('plain');
    expect(['plain', 'vue']).toContain(source.languageAtLine(document, 4));
    expect(() => source.spansForLine(document, 4)).not.toThrow();
    expect(source.statusNotice(document)).toBeNull();
  });

  test('translates compiler UTF-16 offsets to grapheme positions', () => {
    const document = documentFrom('<template>🙂{{ value }}</template>');
    const source = new VueSyntaxSource.Class();

    expect(source.regions(document)).toEqual([
      expect.objectContaining({
        kind: 'template',
        language: 'vue',
        start: { line: 0, column: 10 },
        end: { line: 0, column: 22 },
      }),
    ]);
  });

  test('plugin withdrawal restores plain Vue documents with no core branch', () => {
    const workspace = new Workspace.Class();
    const document = documentFrom(
      '<script setup lang="ts">\nconst value = 1;\n</script>',
    );
    const plugin = new VuePlugin.Class();

    expect(workspace.documentSyntax.languageAtLine(document, 1)).toBe('plain');
    const disposePlugin = workspace.registerContributor(plugin);
    expect(workspace.documentSyntax.languageAtLine(document, 1)).toBe(
      'typescript',
    );

    disposePlugin();
    expect(workspace.documentSyntax.languageAtLine(document, 1)).toBe('plain');
    workspace.dispose();
  });
});
