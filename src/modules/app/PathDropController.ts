import { Static } from 'ivue/extras';
import { Files } from '../system/Files';
import type {
  BoundedListPopup,
  BoundedListPopupItem,
} from '../ui/BoundedListPopup';
import type { OverlayCoordinator } from '../ui/OverlayCoordinator';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { DroppedPathOpeners } from './ApplicationContributor.interface';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
// invariant: Bracketed paste survives stream chunking (src/modules/ui/ui.invariants.md)
class $PathDropController {
  static existingPaths(text: string, basePath: string): readonly string[] {
    const tokens = this.shellTokens(text);
    if (tokens.length === 0) return [];
    const existingPaths: string[] = [];
    const seenPaths = new Set<string>();
    for (const token of tokens) {
      const path = Files.Class.resolveFrom(basePath, token);
      if (!Files.Class.exists(path)) return [];
      if (!seenPaths.has(path)) {
        seenPaths.add(path);
        existingPaths.push(path);
      }
    }
    return existingPaths;
  }

  protected static shellTokens(text: string): readonly string[] {
    const tokens: string[] = [];
    let token = '';
    let quote: "'" | '"' | null = null;
    let escaped = false;
    let tokenStarted = false;
    for (const character of text.trim()) {
      if (escaped) {
        token += character;
        escaped = false;
        tokenStarted = true;
        continue;
      }
      if (quote === "'") {
        if (character === "'") quote = null;
        else token += character;
        tokenStarted = true;
        continue;
      }
      if (quote === '"') {
        if (character === '"') quote = null;
        else if (character === '\\') escaped = true;
        else token += character;
        tokenStarted = true;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        tokenStarted = true;
      } else if (character === "'" || character === '"') {
        quote = character;
        tokenStarted = true;
      } else if (/\s/u.test(character)) {
        if (tokenStarted) {
          tokens.push(token);
          token = '';
          tokenStarted = false;
        }
      } else {
        token += character;
        tokenStarted = true;
      }
    }
    if (escaped || quote !== null) return [];
    if (tokenStarted) tokens.push(token);
    return tokens.filter((candidate) => candidate.length > 0);
  }

  constructor(
    protected readonly dependencies: PathDropControllerDependencies,
  ) {}

  handlePaste(text: string): boolean {
    const workspace = this.dependencies.workspaceSet.active;
    const pathDropControllerClass = this
      .constructor as typeof $PathDropController;
    const paths = pathDropControllerClass.existingPaths(text, workspace.root);
    if (paths.length === 0) return false;

    return this.handlePaths(paths);
  }

  handlePaths(paths: readonly string[]): boolean {
    if (paths.length === 0) return false;
    const workspace = this.dependencies.workspaceSet.active;

    const directoryPaths: string[] = [];
    for (const path of paths) {
      if (Files.Class.isDir(path)) {
        directoryPaths.push(path);
        continue;
      }
      const readOnly = Files.Class.confineToRoot(workspace.root, path) === null;
      if (
        this.dependencies.droppedPathOpeners.openDroppedPath({ path, readOnly })
      ) {
        continue;
      }
      workspace.openFileInTab(path, { readOnly });
      this.dependencies.focusEditor();
    }
    if (directoryPaths.length > 0) this.offerWorkspaces(directoryPaths);
    return true;
  }

  protected offerWorkspaces(directoryPaths: readonly string[]): void {
    const items: BoundedListPopupItem[] = directoryPaths.map((path) => ({
      identifier: path,
      label: `Open ${Files.Class.basename(path)} as workspace`,
      searchText: path,
    }));
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.boundedListPopup.openAt(
          items,
          {
            column: Math.floor(this.dependencies.screenSize().columns / 2),
            row: Math.floor(this.dependencies.screenSize().rows / 2),
          },
          (item) => this.dependencies.workspaceSet.open(item.identifier),
          {
            title: 'Open dropped folder',
            searchVisible: false,
            minimumWidth: 32,
          },
        ),
    );
  }
}

export namespace PathDropController {
  export const $Class = Static($PathDropController);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface PathDropControllerDependencies {
  readonly workspaceSet: WorkspaceSet.Instance;
  readonly droppedPathOpeners: DroppedPathOpeners;
  readonly boundedListPopup: BoundedListPopup.Instance;
  readonly overlayCoordinator: OverlayCoordinator.Instance;
  readonly focusEditor: () => void;
  readonly screenSize: () => { columns: number; rows: number };
}
