// The shortcut cheat-sheet view-model: a scrollable, input-capturing overlay that lists the
// RESOLVED keybindings. Every row derives from `KeybindingRegistry.effectiveBindings()` (the
// post-shadowing floor←platform←user map) at read time — never from a hand-written list — so the
// sheet can never drift from what the keys actually do, and a rebind re-labels it automatically.
//
// invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
// invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
import { Static } from 'ivue/extras';
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { KeybindingRegistry } from '../keybindings/KeybindingRegistry';
import type { CommandRegistry } from '../commands/CommandRegistry';
class $ShortcutHelp {
  protected get ShortcutHelp() {
    return ShortcutHelp.Class as unknown as typeof $ShortcutHelp;
  }
  protected static get $mergedShortcutContexts() {
    const mergedShortcutContextsValue = [
      'global',
      'editor',
      'files',
      'git',
      'quickopen',
      'find',
      'palette',
      'settings',
      'menu',
      'help',
    ] as const;
    return mergedShortcutContextsValue;
  }
  protected get mergedShortcutContexts() {
    return this.ShortcutHelp.$mergedShortcutContexts;
  }
  protected static get $categoryByActionPrefix(): Record<string, string> {
    const categoryByActionPrefixValue: Record<string, string> = {
      app: 'Application',
      workspace: 'Workspace',
      buffer: 'Buffers',
      editor: 'Editor',
      edit: 'Editor',
      find: 'Search',
      quickopen: 'Navigation',
      navigation: 'Navigation',
      palette: 'Commands',
      settings: 'Settings',
      git: 'Git',
      diff: 'Diff',
      markdown: 'Markdown',
      tree: 'Files',
      focus: 'View',
      menu: 'Menu',
      help: 'Help',
    };
    return categoryByActionPrefixValue;
  }
  protected get categoryByActionPrefix(): Record<string, string> {
    return this.ShortcutHelp.$categoryByActionPrefix;
  }
  protected static get $fallbackTitleByActionIdentifier(): Record<
    string,
    string
  > {
    const fallbackTitleByActionIdentifierValue: Record<string, string> = {
      'quickopen.open': 'Go to File',
      'palette.open': 'Show All Commands',
      'find.open': 'Find',
      'find.replace': 'Replace',
      'navigation.back': 'Go Back',
      'navigation.forward': 'Go Forward',
      'git.togglePanel': 'Toggle Git Panel',
      'focus.toggle': 'Toggle Sidebar/Editor Focus',
      'settings.toggle': 'Open Settings',
    };
    return fallbackTitleByActionIdentifierValue;
  }
  protected get fallbackTitleByActionIdentifier(): Record<string, string> {
    return this.ShortcutHelp.$fallbackTitleByActionIdentifier;
  }
  protected humanizeActionMember(actionMember: string): string {
    const spaced = actionMember.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return spaced
      .split(' ')
      .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
      .join(' ');
  }
  constructor(
    protected readonly keybindings: KeybindingRegistry.Instance,
    protected readonly commands: CommandRegistry.Instance,
  ) {}
  get open() {
    return ref(false);
  }
  /** First visible flat row (category headers and binding rows scroll together). */
  get scrollTop() {
    return ref(0);
  }
  show(): void {
    this.open.value = true;
    this.scrollTop.value = 0;
  }
  close(): void {
    this.open.value = false;
  }
  protected titleFor(actionIdentifier: string): string {
    const command = this.commands.get(actionIdentifier);
    if (command) return command.title;
    const fallbackTitle =
      this.fallbackTitleByActionIdentifier[actionIdentifier];
    if (fallbackTitle) return fallbackTitle;
    const memberName =
      actionIdentifier.split('.').slice(1).join('.') || actionIdentifier;
    return this.humanizeActionMember(memberName);
  }
  protected categoryFor(actionIdentifier: string): string {
    const command = this.commands.get(actionIdentifier);
    if (command?.category) return command.category;
    const actionPrefix = actionIdentifier.split('.')[0] ?? actionIdentifier;
    return (
      this.categoryByActionPrefix[actionPrefix] ??
      actionPrefix[0]!.toUpperCase() + actionPrefix.slice(1)
    );
  }
  /**
   * The flat row list: category header rows with their binding rows beneath, every chord read from
   * the registry's post-shadowing effective map at call time (reactive via the registry revision).
   * invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
   */
  rows(): ShortcutHelpRow[] {
    // First-wins merge across contexts: one row per action, under the first context listing it.
    const contextByActionIdentifier = new Map<string, string>();
    for (const context of this.mergedShortcutContexts) {
      for (const actionIdentifier of this.keybindings
        .effectiveBindings(context)
        .keys()) {
        if (!contextByActionIdentifier.has(actionIdentifier)) {
          contextByActionIdentifier.set(actionIdentifier, context);
        }
      }
    }
    const bindingRowsByCategory = new Map<string, ShortcutHelpRow[]>();
    for (const [actionIdentifier, context] of contextByActionIdentifier) {
      const chordLabel = this.keybindings.bindingHint(
        actionIdentifier,
        context,
      );
      if (!chordLabel) continue;
      const category = this.categoryFor(actionIdentifier);
      const categoryRows = bindingRowsByCategory.get(category) ?? [];
      categoryRows.push({
        kind: 'binding',
        label: this.titleFor(actionIdentifier),
        chordLabel,
        actionIdentifier,
      });
      bindingRowsByCategory.set(category, categoryRows);
    }
    const flatRows: ShortcutHelpRow[] = [];
    for (const category of [...bindingRowsByCategory.keys()].sort()) {
      flatRows.push({
        kind: 'category',
        label: category,
        chordLabel: '',
        actionIdentifier: '',
      });
      const categoryRows = bindingRowsByCategory.get(category)!;
      categoryRows.sort((leftRow, rightRow) =>
        leftRow.label.localeCompare(rightRow.label),
      );
      flatRows.push(...categoryRows);
    }
    return flatRows;
  }
}
export namespace ShortcutHelp {
  export const $Class = Static($ShortcutHelp);
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}
export interface ShortcutHelpRow {
  kind: 'category' | 'binding';
  /** The category name for a category row; the action's human title for a binding row. */
  label: string;
  /** The human-readable chord ('Ctrl+P', 'Ctrl+X then Ctrl+C'); empty on category rows. */
  chordLabel: string;
  /** The bound action identifier; empty on category rows. */
  actionIdentifier: string;
}
