import { describe, expect, test } from 'bun:test';
import { Reactive } from 'ivue';
import { AgentSpinner } from '../agent/AgentSpinner';
import { AgentThinkingIndicator } from '../agent/AgentThinkingIndicator';
import { AgentTranscriptProjection } from '../agent/AgentTranscriptProjection';
import { DiffView } from '../diff/DiffView';
import { BracketMatch } from '../editor/BracketMatch';
import { CodeFolding } from '../editor/CodeFolding';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { EditorWrap } from '../editor/EditorWrap';
import { ImageDecoders } from '../image/ImageDecoders';
import { ImageRenderers } from '../image/ImageRenderers';
import { PngDecoder } from '../image/PngDecoder';
import { KeybindingDefaults } from '../keybindings/KeybindingDefaults';
import { KeybindingMac } from '../keybindings/KeybindingMac';
import { KeybindingPlatform } from '../keybindings/KeybindingPlatform';
import { LayoutModel } from '../layout/LayoutModel';
import { JsonRpc } from '../lsp/JsonRpc';
import { LanguageClient } from '../lsp/LanguageClient';
import { TypeScriptProvider } from '../lsp/TypeScriptProvider';
import { MarkdownDocument } from '../markdown/MarkdownDocument';
import { MarkdownParser } from '../markdown/MarkdownParser';
import { MarkdownPreview } from '../markdown/MarkdownPreview';
import { Settings } from '../settings/Settings';
import { SettingsPanel } from '../settings/SettingsPanel';
import { Highlighter } from '../syntax/Highlighter';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import { OpenPty } from '../terminal/OpenPty';
import { TerminalKeys } from '../terminal/TerminalKeys';
import { TerminalPaneRenderer } from '../terminal/TerminalPaneRenderer';
import { ThemeIcons } from '../theme/ThemeIcons';
import { ThemePalettes } from '../theme/ThemePalettes';
import { HoverCard } from '../ui/HoverCard';
import { OverlayCoordinator } from '../ui/OverlayCoordinator';
import { ShortcutHelp } from '../ui/ShortcutHelp';
import { Momentum } from './Momentum';
import { StatusChannel } from './StatusChannel';
import { TextSegmentation } from './TextSegmentation';

const cachedStaticClasses: readonly CachedStaticClass[] = [
  cachedStaticClass('AgentSpinner', AgentSpinner.$Class),
  cachedStaticClass('AgentThinkingIndicator', AgentThinkingIndicator.$Class),
  cachedStaticClass(
    'AgentTranscriptProjection',
    AgentTranscriptProjection.$Class,
  ),
  cachedStaticClass('BracketMatch', BracketMatch.$Class),
  cachedStaticClass('CodeFolding', CodeFolding.$Class),
  cachedStaticClass('DiffView', DiffView.$Class),
  cachedStaticClass('EditorCoordinates', EditorCoordinates.$Class),
  cachedStaticClass('EditorWrap', EditorWrap.$Class),
  cachedStaticClass('Highlighter', Highlighter.$Class),
  cachedStaticClass('HoverCard', HoverCard.$Class),
  cachedStaticClass('ImageDecoders', ImageDecoders.$Class),
  cachedStaticClass('ImageRenderers', ImageRenderers.$Class),
  cachedStaticClass('JsonRpc', JsonRpc.$Class),
  cachedStaticClass('KeybindingDefaults', KeybindingDefaults.$Class),
  cachedStaticClass('KeybindingMac', KeybindingMac.$Class),
  cachedStaticClass('KeybindingPlatform', KeybindingPlatform.$Class),
  cachedStaticClass('LanguageClient', LanguageClient.$Class),
  cachedStaticClass('LanguageRegistry', LanguageRegistry.$Class),
  cachedStaticClass('LayoutModel', LayoutModel.$Class),
  cachedStaticClass('MarkdownDocument', MarkdownDocument.$Class),
  cachedStaticClass('MarkdownParser', MarkdownParser.$Class),
  cachedStaticClass('MarkdownPreview', MarkdownPreview.$Class),
  cachedStaticClass('Momentum', Momentum.$Class),
  cachedStaticClass('OpenPty', OpenPty.$Class),
  cachedStaticClass('OverlayCoordinator', OverlayCoordinator.$Class),
  cachedStaticClass('PngDecoder', PngDecoder.$Class),
  cachedStaticClass('Settings', Settings.$Class),
  cachedStaticClass('SettingsPanel', SettingsPanel.$Class),
  cachedStaticClass('ShortcutHelp', ShortcutHelp.$Class),
  cachedStaticClass('StatusChannel', StatusChannel.$Class),
  cachedStaticClass('TerminalKeys', TerminalKeys.$Class),
  cachedStaticClass('TerminalPaneRenderer', TerminalPaneRenderer.$Class),
  cachedStaticClass('TextSegmentation', TextSegmentation.$Class),
  cachedStaticClass('ThemeIcons', ThemeIcons.$Class),
  cachedStaticClass('ThemePalettes', ThemePalettes.$Class),
  cachedStaticClass('TypeScriptProvider', TypeScriptProvider.$Class),
];

describe('ivue static cache contract', () => {
  test('every declared static cache preserves object identity', () => {
    expect(cachedStaticClasses.length).toBeGreaterThan(0);

    const inspection = inspectStaticCaches(cachedStaticClasses);
    expect(inspection.inspectedClassCount).toBe(cachedStaticClasses.length);
    expect(inspection.inspectedPropertyCount).toBe(67);
    expect(inspection.failures).toEqual([]);
  });

  test('raw and Reactive-only classes fail the cache identity contract', () => {
    class $RawPositiveControl {
      protected static createValue(): object {
        return {};
      }

      static get $value(): object {
        return this.createValue();
      }
    }
    class $ReactivePositiveControl {
      protected static createValue(): object {
        return {};
      }

      static get $value(): object {
        return this.createValue();
      }
    }
    const reactivePositiveControl = Reactive($ReactivePositiveControl);

    expect(
      inspectStaticCaches([
        {
          name: 'RawPositiveControl',
          publishedClass: $RawPositiveControl,
          declaredClass: $RawPositiveControl,
        },
      ]).failures,
    ).toEqual([
      'RawPositiveControl.$value did not preserve identity across two reads',
    ]);
    expect(
      inspectStaticCaches([
        {
          name: 'ReactivePositiveControl',
          publishedClass: reactivePositiveControl,
          declaredClass: $ReactivePositiveControl,
        },
      ]).failures,
    ).toEqual([
      'ReactivePositiveControl.$value did not preserve identity across two reads',
    ]);
  });
});

function cachedStaticClass(
  name: string,
  publishedClass: Function,
): CachedStaticClass {
  return {
    name,
    publishedClass,
    declaredClass: Object.getPrototypeOf(publishedClass) as Function,
  };
}

function inspectStaticCaches(
  classes: readonly CachedStaticClass[],
): StaticCacheInspection {
  const failures: string[] = [];
  let inspectedClassCount = 0;
  let inspectedPropertyCount = 0;

  for (const cachedClass of classes) {
    const descriptors = Object.getOwnPropertyDescriptors(
      cachedClass.declaredClass,
    );
    const cachePropertyNames = Object.keys(descriptors).filter((propertyName) =>
      propertyName.startsWith('$'),
    );
    if (cachePropertyNames.length === 0) {
      failures.push(`${cachedClass.name} declared no static cache properties`);
      continue;
    }
    inspectedClassCount++;

    for (const propertyName of cachePropertyNames) {
      inspectedPropertyCount++;
      const descriptor = descriptors[propertyName];
      if (
        typeof descriptor?.get !== 'function' ||
        descriptor.set !== undefined
      ) {
        failures.push(
          `${cachedClass.name}.${propertyName} is not a get-only accessor`,
        );
        continue;
      }

      const firstValue = Reflect.get(
        cachedClass.publishedClass,
        propertyName,
      ) as unknown;
      const secondValue = Reflect.get(
        cachedClass.publishedClass,
        propertyName,
      ) as unknown;
      if (isPrimitive(firstValue)) {
        failures.push(
          `${cachedClass.name}.${propertyName} returned a primitive value`,
        );
        continue;
      }
      if (!Object.is(firstValue, secondValue)) {
        failures.push(
          `${cachedClass.name}.${propertyName} did not preserve identity ` +
            `across two reads`,
        );
      }
    }
  }

  return {
    failures,
    inspectedClassCount,
    inspectedPropertyCount,
  };
}

function isPrimitive(value: unknown): boolean {
  return (
    value === null || (typeof value !== 'object' && typeof value !== 'function')
  );
}

interface CachedStaticClass {
  readonly name: string;
  readonly publishedClass: Function;
  readonly declaredClass: Function;
}

interface StaticCacheInspection {
  readonly failures: readonly string[];
  readonly inspectedClassCount: number;
  readonly inspectedPropertyCount: number;
}
