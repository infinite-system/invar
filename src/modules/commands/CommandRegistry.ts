// Command registry + palette state. Every action the app can take is a registered command
// with a stable id, a human title, and a run function — the palette lists them, filters them
// with a subsequence match, and runs the selection. Keybindings dispatch the same commands.
//
// invariant: No action requires a memorized motion (project.invariants.md)
//   — everything is in the palette, discoverable and rebindable.
// invariant: The host canvas is complete without plugins (project.invariants.md)
import type { ActionIconSet } from '../theme/ThemeIcons';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import { CommandScoring } from './CommandScoring';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';

// invariant: Editable text fields share one input model (project.invariants.md)
class $CommandRegistry {
  // invariant: Every action dispatches through the one registry (src/modules/commands/commands.invariants.md)
  //   — the single source of truth; both the palette and keybindings resolve actions out of this map.
  protected commands = new Map<string, Command>();
  protected readonly queryInputModel: TextInputModel.Model;

  constructor() {
    this.queryInputModel = this.createQueryInput();
  }

  protected createQueryInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  // Palette reactive state.
  get open() {
    return ref(false);
  }
  get queryInput(): TextInputModel.Model {
    return this.queryInputModel;
  }
  get query() {
    return this.queryInput.text;
  }
  get selectedIndex() {
    return ref(0);
  }
  protected get filteredRef() {
    return shallowRef<Command[]>([]);
  }

  register(command: Command): () => void {
    this.commands.set(command.id, command);
    return () => {
      if (this.commands.get(command.id) === command) {
        this.commands.delete(command.id);
      }
    };
  }

  registerAll(commands: Command[]): () => void {
    const disposers = commands.map((command) => this.register(command));
    return () => {
      for (
        let disposerIndex = disposers.length - 1;
        disposerIndex >= 0;
        disposerIndex--
      ) {
        disposers[disposerIndex]?.();
      }
    };
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /** Commands contributed to one action surface, in registration order, filtered by the same guard
   *  `all()` uses. A guarded-off command is not offered as an affordance either. */
  actionsForSurface(surface: CommandActionSurface): Command[] {
    // invariant: A command runs only when its guard holds (src/modules/commands/commands.invariants.md)
    return [...this.commands.values()].filter(
      (command) =>
        command.actionIcons?.[surface] !== undefined &&
        (command.when ? command.when() : true),
    );
  }

  all(): Command[] {
    // invariant: A command runs only when its guard holds (src/modules/commands/commands.invariants.md)
    //   — a guarded-off command is never listed, so it cannot be scored or selected.
    return [...this.commands.values()].filter((command) =>
      command.when ? command.when() : true,
    );
  }

  run(id: string): void {
    // invariant: Every action dispatches through the one registry (src/modules/commands/commands.invariants.md)
    //   — the keybinding dispatch path: resolve the command by id out of the one map.
    const command = this.commands.get(id);
    // invariant: A command runs only when its guard holds (src/modules/commands/commands.invariants.md)
    if (command && (!command.when || command.when())) void command.run();
  }

  // --- palette control ---
  get filtered(): Command[] {
    return this.filteredRef.value;
  }

  protected recompute(): void {
    const query = this.query.value;
    // invariant: Command scoring is a pure ordering (src/modules/commands/commands.invariants.md)
    //   — the palette ranking derives entirely from fuzzyScore, with title localeCompare as the only tiebreak.
    const scored = this.all()
      .map((command) => ({
        command,
        score: CommandScoring.Class.fuzzyScore(query, command.title),
      }))
      .filter((entry) => entry.score >= 0)
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.command.title.localeCompare(right.command.title),
      );
    this.filteredRef.value = scored.map((entry) => entry.command);
    if (this.selectedIndex.value >= this.filteredRef.value.length) {
      this.selectedIndex.value = Math.max(0, this.filteredRef.value.length - 1);
    }
  }

  openPalette(): void {
    this.open.value = true;
    this.queryInput.clear();
    this.selectedIndex.value = 0;
    this.recompute();
  }

  closePalette(): void {
    this.open.value = false;
    this.queryInput.clear();
  }

  setQuery(query: string): void {
    this.queryInput.setValue(query);
    this.selectedIndex.value = 0;
    this.recompute();
  }

  appendQuery(character: string): void {
    if (!this.queryInput.insert(character)) return;
    this.selectedIndex.value = 0;
    this.recompute();
  }

  applyInputAction(action: TextInputAction): void {
    const originalQuery = this.queryInput.value;
    this.queryInput.apply(action);
    if (this.queryInput.value === originalQuery) return;
    this.selectedIndex.value = 0;
    this.recompute();
  }

  applyQueryInputAction(action: TextInputAction): void {
    this.applyInputAction(action);
  }

  copyInputSelection(): Promise<number> {
    return this.queryInput.copySelection();
  }

  moveSelection(delta: number): void {
    const count = this.filtered.length;
    if (count === 0) return;
    let index = this.selectedIndex.value + delta;
    if (index < 0) index = count - 1;
    if (index >= count) index = 0;
    this.selectedIndex.value = index;
  }

  runSelected(): void {
    const command = this.filtered[this.selectedIndex.value];
    this.closePalette();
    // invariant: A command runs only when its guard holds (src/modules/commands/commands.invariants.md)
    //   — re-checked here so a guard that flipped false since listing still blocks the palette dispatch.
    if (command && (!command.when || command.when())) void command.run();
  }
}

export namespace CommandRegistry {
  export const $Class = $CommandRegistry;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface Command {
  id: string;
  title: string;
  category?: string;
  run: () => void | Promise<void>;
  when?: () => boolean;
  /** Surface this command as a clickable affordance on named action surfaces. Each value names a key
   *  in the theme's action-icon set, so its glyph follows the glyph-level ladder. A clickable action
   *  stays a command: this field is a contribution to the one registry, not a second action path.
   *  invariant: No action requires a memorized motion (project.invariants.md) */
  actionIcons?: Partial<Record<CommandActionSurface, keyof ActionIconSet>>;
  /** For a contributed affordance that is a toggle: whether it currently reads as on. */
  toggled?: () => boolean;
}

export type CommandActionSurface = 'editorTitle' | 'panelSeparator';
