// The Ctrl+, settings panel: an editable, LIVE-APPLYING view over the reactive Settings store. The
// panel is display + navigation + edit state only; every change goes straight to Settings.set() (which
// live-applies through the reactive fields) and is persisted with Settings.save(). View-only over the
// store — it owns no settings values itself.
//
// invariant: Every setting is a reactive cell read through its value ref (settings.invariants.md)
import { Reactive } from 'ivue';
import { ref } from 'vue';
import { VoiceDiscovery } from '../narration/VoiceDiscovery';
import {
  Settings,
  type ScrollModifier,
  type GlyphMode,
  type WorkspaceTabPosition,
  type TypeScriptServer,
  type AgentProvider,
} from './Settings';
import type { GraphicsTierSetting } from '../theme/TerminalCapabilities';
import type {
  SettingSpec,
  SettingValue,
} from './SettingContribution.interface';
import type {
  DockVerticalSpan,
  PanelAlignment,
  SidebarPosition,
} from '../layout/LayoutModel';

// The editable settings, in display order, grouped into SECTIONS (contiguous — the renderer draws a
// header whenever the section changes). Sections are presentation only; selection still indexes the
// flat list.
class $SettingsPanel {
  protected static get $settingDescriptors(): readonly SettingDescriptor[] {
    const scrollModifierOptions: readonly ScrollModifier[] = [
      'none',
      'alt',
      'shift',
      'ctrl',
    ];
    const glyphModeOptions: readonly GlyphMode[] = [
      'auto',
      'nerd',
      'unicode',
      'ascii',
    ];
    const graphicsTierOptions: readonly GraphicsTierSetting[] = [
      'auto',
      'kitty',
      'sixel',
      'halfblock',
    ];
    const workspaceTabPositionOptions: readonly WorkspaceTabPosition[] = [
      'top',
      'left',
    ];
    const sidebarPositionOptions: readonly SidebarPosition[] = [
      'left',
      'right',
    ];
    const panelAlignmentOptions: readonly PanelAlignment[] = [
      'center',
      'right',
    ];
    const dockVerticalSpanOptions: readonly DockVerticalSpan[] = [
      'full-height',
      'ends-at-panel',
    ];
    const typeScriptServerOptions: readonly TypeScriptServer[] = [
      'tsgo',
      'typescript-language-server',
    ];
    const agentProviderOptions: readonly AgentProvider[] = [
      'auto',
      'claude',
      'codex',
    ];
    const settingDescriptors: readonly SettingDescriptor[] = [
      {
        key: 'verticalFlingCeiling',
        label: 'Vertical fling ceiling (rows/s)',
        section: 'Scrolling',
        spec: {
          kind: 'number',
          step: 20,
          minimum: 40,
          maximum: 2000,
          decimals: 0,
        },
      },
      {
        key: 'scrollAccelGain',
        label: 'Scroll accel gain (per notch)',
        section: 'Scrolling',
        spec: {
          kind: 'number',
          step: 2,
          minimum: 2,
          maximum: 200,
          decimals: 0,
        },
      },
      {
        key: 'scrollFriction',
        label: 'Scroll friction (decay/s)',
        section: 'Scrolling',
        spec: {
          kind: 'number',
          step: 0.005,
          minimum: 0.001,
          maximum: 0.5,
          decimals: 3,
        },
      },
      {
        key: 'linesPerNotch',
        label: 'Lines per wheel notch',
        section: 'Scrolling',
        spec: { kind: 'number', step: 1, minimum: 1, maximum: 10, decimals: 0 },
      },
      {
        key: 'horizontalScrollModifier',
        label: 'Horizontal-scroll modifier',
        section: 'Scrolling',
        spec: { kind: 'enum', options: scrollModifierOptions },
      },
      {
        key: 'fastScrollModifier',
        label: 'Fast-scroll modifier',
        section: 'Scrolling',
        spec: { kind: 'enum', options: scrollModifierOptions },
      },
      {
        key: 'fastScrollMultiplier',
        label: 'Fast-scroll multiplier',
        section: 'Scrolling',
        spec: { kind: 'number', step: 1, minimum: 1, maximum: 20, decimals: 0 },
      },
      {
        key: 'scrollbarThickness',
        label: 'Scrollbar thickness',
        section: 'Scrolling',
        spec: { kind: 'number', step: 1, minimum: 1, maximum: 3, decimals: 0 },
      },
      {
        key: 'glyphMode',
        label: 'Glyph mode',
        section: 'Appearance',
        spec: { kind: 'enum', options: glyphModeOptions },
      },
      {
        key: 'graphicsTier',
        label: 'Graphics tier',
        section: 'Appearance',
        spec: { kind: 'enum', options: graphicsTierOptions },
      },
      {
        key: 'theme',
        label: 'Theme',
        section: 'Appearance',
        spec: { kind: 'enum', options: ['dark', 'light'] },
      },
      {
        key: 'reducedMotion',
        label: 'Reduced motion (instant agent typing)',
        section: 'Appearance',
        spec: { kind: 'boolean' },
      },
      {
        key: 'wordWrap',
        label: 'Word wrap',
        section: 'Editor',
        spec: { kind: 'boolean' },
      },
      {
        key: 'showIndentGuides',
        label: 'Indent guides',
        section: 'Editor',
        spec: { kind: 'boolean' },
      },
      {
        key: 'workspaceTabPosition',
        label: 'Workspace tabs',
        section: 'Editor',
        spec: { kind: 'enum', options: workspaceTabPositionOptions },
      },
      {
        key: 'typescriptServer',
        label: 'TypeScript server',
        section: 'Language',
        spec: { kind: 'enum', options: typeScriptServerOptions },
      },
      {
        key: 'lspFileSizeLimitKb',
        label: 'LSP file size limit (KB, 0 = no limit)',
        section: 'Language',
        spec: {
          kind: 'number',
          step: 512,
          minimum: 0,
          maximum: 51200,
          decimals: 0,
        },
      },
      {
        key: 'agentProvider',
        label: 'Agent engine',
        section: 'Agent',
        spec: { kind: 'enum', options: agentProviderOptions },
      },
      {
        key: 'agentSkipPermissions',
        label: 'Agent bypasses permissions (off = ask interactively)',
        section: 'Agent',
        spec: { kind: 'boolean' },
      },
      {
        key: 'agentTerminalFollowMode',
        label: 'Agent terminal follow mode',
        section: 'Agent',
        spec: {
          kind: 'enum',
          options: ['follow-all', 'on-error', 'on-request', 'off'],
        },
      },
      {
        key: 'agentTypingSpeed',
        label: 'Agent terminal typing speed (higher = faster)',
        section: 'Agent',
        spec: {
          kind: 'number',
          step: 10,
          minimum: 10,
          maximum: 240,
          decimals: 0,
        },
      },
      {
        key: 'terminalCleanPrompt',
        label: 'Terminal clean themed prompt',
        section: 'Terminal',
        spec: { kind: 'boolean' },
      },
      {
        key: 'agentAudioNarration',
        label: 'Speak agent replies aloud (needs a TTS engine)',
        section: 'Narration',
        spec: { kind: 'boolean' },
      },
      {
        key: 'agentNarrationVoice',
        label: 'Narration voice',
        section: 'Narration',
        spec: {
          kind: 'dynamic-enum',
          resolveOptions: () => VoiceDiscovery.Class.options(),
        },
      },
      {
        key: 'agentNarrationRate',
        label: 'Narration speed (higher = faster; 1.0 = normal)',
        section: 'Narration',
        spec: {
          kind: 'number',
          step: 0.1,
          minimum: 0.5,
          maximum: 3.0,
          decimals: 1,
        },
      },
      {
        key: 'sidebarWidth',
        label: 'Sidebar width',
        section: 'Layout',
        spec: {
          kind: 'number',
          step: 1,
          minimum: 16,
          maximum: 80,
          decimals: 0,
        },
      },
      {
        key: 'rightDockWidth',
        label: 'Right dock width',
        section: 'Layout',
        spec: {
          kind: 'number',
          step: 1,
          minimum: 16,
          maximum: 80,
          decimals: 0,
        },
      },
      {
        key: 'sidebarPosition',
        label: 'Sidebar position',
        section: 'Layout',
        spec: { kind: 'enum', options: sidebarPositionOptions },
      },
      {
        key: 'panelAlignment',
        label: 'Bottom panel alignment',
        section: 'Layout',
        spec: { kind: 'enum', options: panelAlignmentOptions },
      },
      {
        key: 'leftDockVerticalSpan',
        label: 'Primary dock vertical span (when bottom panel is open)',
        section: 'Layout',
        spec: { kind: 'enum', options: dockVerticalSpanOptions },
      },
      {
        key: 'rightDockVerticalSpan',
        label: 'Right dock vertical span (when dock and panel are open)',
        section: 'Layout',
        spec: { kind: 'enum', options: dockVerticalSpanOptions },
      },
    ];
    Object.defineProperty(this, '$settingDescriptors', {
      configurable: true,
      value: settingDescriptors,
    });
    return settingDescriptors;
  }

  protected get settingsPanelClass(): typeof $SettingsPanel {
    return this.constructor as typeof $SettingsPanel;
  }

  // The reactive settings store the panel edits; read late so it stays swappable/testable.
  constructor(protected readonly settingsStore: Settings.Instance) {}

  // Options for dynamic-enum rows, PROBED once per panel-open (show()) and cached — so a filesystem scan
  // (installed voices) runs on open, not on every keystroke. Plain field (the Tooltip idiom: a Reactive
  // class holding non-reactive scratch state).
  protected dynamicOptionsCache = new Map<string, readonly string[]>();

  protected refreshDynamicOptions(): void {
    this.dynamicOptionsCache.clear();
    for (const descriptor of this.descriptors) {
      if (descriptor.spec.kind === 'dynamic-enum')
        this.dynamicOptionsCache.set(
          descriptor.key,
          descriptor.spec.resolveOptions(),
        );
    }
  }

  /** The cycle options for an enum / dynamic-enum row (dynamic ones from the panel-open probe, freshly
   *  resolved if the cache is cold — e.g. a test that adjusts without show()). */
  protected optionsFor(descriptor: SettingDescriptor): readonly string[] {
    if (descriptor.spec.kind === 'enum') return descriptor.spec.options;
    if (descriptor.spec.kind === 'dynamic-enum')
      return (
        this.dynamicOptionsCache.get(descriptor.key) ??
        descriptor.spec.resolveOptions()
      );
    return [];
  }

  get open() {
    return ref(false);
  }
  get selectedIndex() {
    return ref(0);
  }

  get descriptors(): readonly SettingDescriptor[] {
    return [
      ...this.settingsPanelClass.$settingDescriptors,
      ...this.settingsStore
        .contributedSettingDescriptors()
        .map((contribution) => ({
          key: contribution.identifier,
          ...contribution,
        })),
    ];
  }

  /** The bound settings store (so the view can read live values without re-injecting it). */
  get settings(): Settings.Instance {
    return this.settingsStore;
  }

  toggle(): void {
    this.open.value = !this.open.value;
  }
  show(): void {
    this.open.value = true;
    this.selectedIndex.value = 0;
    this.refreshDynamicOptions(); // probe dynamic-enum options (installed voices) at panel-open
  }
  close(): void {
    this.open.value = false;
  }

  /** Move the selection up/down, clamped (no wrap — a settings list is not a carousel). */
  moveSelection(delta: number): void {
    const last = this.descriptors.length - 1;
    this.selectedIndex.value = Math.max(
      0,
      Math.min(this.selectedIndex.value + delta, last),
    );
  }

  /** Select a specific row by descriptor index (a mouse click on a row / its widget). Clamped. */
  select(index: number): void {
    this.selectedIndex.value = Math.max(
      0,
      Math.min(index, this.descriptors.length - 1),
    );
  }

  /** Change the selected setting by `direction` (+1/-1): numbers step, booleans toggle, enums cycle.
   *  The change live-applies through Settings.set() and is persisted with Settings.save(). */
  adjust(direction: number): void {
    const descriptor = this.descriptors[this.selectedIndex.value];
    if (!descriptor) return;
    const current = this.settingsStore.settingValue(descriptor.key);
    if (descriptor.spec.kind === 'number') {
      const { step, minimum, maximum, decimals } = descriptor.spec;
      const raw = (current as number) + step * direction;
      const rounded = Math.round(raw * 10 ** decimals) / 10 ** decimals;
      const next = Math.max(minimum, Math.min(rounded, maximum));
      this.setValue(descriptor.key, next);
    } else if (descriptor.spec.kind === 'boolean') {
      this.setValue(descriptor.key, !(current as boolean));
    } else {
      // enum or dynamic-enum: cycle the option list (dynamic ones probed at panel-open).
      const options = this.optionsFor(descriptor);
      if (options.length === 0) return; // nothing to cycle (e.g. no voices installed)
      const currentIndex = Math.max(0, options.indexOf(current as string));
      const nextIndex =
        (currentIndex + direction + options.length) % options.length;
      this.setValue(descriptor.key, options[nextIndex] ?? '');
    }
    this.settingsStore.save();
  }

  protected setValue(key: string, value: SettingValue): void {
    const hostDescriptor = this.settingsPanelClass.$settingDescriptors.find(
      (descriptor) => descriptor.key === key,
    );
    if (hostDescriptor) {
      this.settingsStore.set(
        key as keyof import('./Settings').SettingsValues,
        value as never,
      );
      return;
    }
    this.settingsStore.setContributed(key, value);
  }

  /** The rows to render, with each value formatted for display. */
  rows(): SettingsPanelRow[] {
    const selected = this.selectedIndex.value;
    return this.descriptors.map((descriptor, index) => ({
      label: descriptor.label,
      valueText: this.formatValue(
        descriptor,
        this.settingsStore.settingValue(descriptor.key) ??
          descriptor.defaultValue ??
          '',
      ),
      selected: index === selected,
      kind: descriptor.spec.kind,
      section: descriptor.section,
      index,
    }));
  }

  protected formatValue(
    descriptor: SettingDescriptor,
    value: SettingValue,
  ): string {
    if (descriptor.spec.kind === 'number')
      return (value as number).toFixed(descriptor.spec.decimals);
    if (descriptor.spec.kind === 'boolean') return value ? 'on' : 'off';
    // A dynamic-enum's empty value means "auto" (the first discovered voice); show that, not blank.
    if (descriptor.spec.kind === 'dynamic-enum' && (value as string) === '')
      return 'auto (first found)';
    return String(value);
  }
}

export namespace SettingsPanel {
  export const $Class = $SettingsPanel;
  export let Class = Reactive($SettingsPanel);
  export type Instance = typeof Class.Instance;
}

/** How one setting is edited: numbers step, booleans toggle, enums cycle a fixed list, and DYNAMIC enums
 * cycle a list probed at runtime. */
export interface SettingDescriptor {
  key: string;
  label: string;
  section: string;
  spec: SettingSpec;
  defaultValue?: SettingValue;
}

/** One rendered settings row. */
export interface SettingsPanelRow {
  label: string;
  valueText: string;
  selected: boolean;
  kind: SettingSpec['kind'];
  section: string;
  index: number;
}
