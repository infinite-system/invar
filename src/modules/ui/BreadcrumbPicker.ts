import { Static } from 'ivue/extras';
import { Files } from '../system/Files';
import type { Theme } from '../theme/Theme';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type {
  BoundedListPopup,
  BoundedListPopupAnchor,
  BoundedListPopupItem,
} from './BoundedListPopup';
import type { BreadcrumbPathSegment } from './Breadcrumb';
import type { OverlayCoordinator } from './OverlayCoordinator';

// invariant: Bounded list interactions live in one popup (src/modules/ui/ui.invariants.md)
// invariant: Popup hierarchy is mouse and keyboard reachable (src/modules/ui/ui.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
// invariant: Live static reads follow the receiving class (project.invariants.md)
class $BreadcrumbPicker {
  // The MS-DOS / Norton Commander parent row. Namespaced so it can never be confused with the
  // absolute filesystem paths every real entry uses as its identifier.
  static get PARENT_DIRECTORY_ITEM_IDENTIFIER(): string {
    return 'breadcrumb-picker:parent-directory';
  }

  protected get parentDirectoryItemLabel(): string {
    return '..';
  }

  protected get parentDirectoryItemIdentifier(): string {
    return (this.constructor as typeof $BreadcrumbPicker)
      .PARENT_DIRECTORY_ITEM_IDENTIFIER;
  }

  protected workspaceRoot = '';
  protected currentDirectory = '';
  protected directoryPaths = new Set<string>();

  constructor(protected readonly dependencies: BreadcrumbPickerDependencies) {}

  show(segment: BreadcrumbPathSegment, anchor: BoundedListPopupAnchor): void {
    const workspaceRoot = Files.Class.absolute(
      this.dependencies.workspaceSet.active.root,
    );
    const directoryPath = Files.Class.confineToRoot(
      workspaceRoot,
      segment.directoryPath,
    );
    if (!directoryPath) return;
    this.workspaceRoot = workspaceRoot;
    this.currentDirectory = directoryPath;
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.popup.openAt(
          this.itemsForDirectory(directoryPath),
          anchor,
          (item) => this.activateItem(item),
          {
            title: this.titleForDirectory(directoryPath),
            selectedItemIdentifier: segment.selectedItemIdentifier,
            minimumWidth: 28,
            searchThreshold: 0,
            navigateBackwardHandler: () => this.navigateBackward(),
          },
        ),
    );
  }

  // Every row — the parent row included — takes its mark from the SAME resolver the file tree
  // paints with, so a directory is told apart by its icon instead of by a trailing slash the tree
  // never used.
  protected itemsForDirectory(
    directoryPath: string,
  ): readonly BoundedListPopupItem[] {
    const entries = Files.Class.list(directoryPath);
    this.directoryPaths = new Set(
      entries.filter((entry) => entry.isDir).map((entry) => entry.path),
    );
    const entryItems = entries.map((entry) => ({
      identifier: entry.path,
      label: entry.name,
      icon: this.dependencies.theme.icon(entry.name, entry.isDir),
      drillable: entry.isDir,
      keepOpenOnSelect: entry.isDir,
    }));
    if (this.parentDirectoryOf(directoryPath) === null) return entryItems;
    return [
      {
        identifier: this.parentDirectoryItemIdentifier,
        label: this.parentDirectoryItemLabel,
        icon: this.dependencies.theme.icon(this.parentDirectoryItemLabel, true),
        keepOpenOnSelect: true,
        pinnedWhileQueryEmpty: true,
      },
      ...entryItems,
    ];
  }

  protected activateItem(item: BoundedListPopupItem): void {
    if (item.identifier === this.parentDirectoryItemIdentifier) {
      this.navigateBackward();
      return;
    }
    if (this.directoryPaths.has(item.identifier)) {
      this.currentDirectory = item.identifier;
      this.replaceDirectory();
      return;
    }
    this.dependencies.workspaceSet.active.openFileInTab(item.identifier);
    this.dependencies.workspaceSet.active.focus.value = 'editor';
  }

  // The ONE upward generator: the `..` row's activation, the Left key, and the parent row's very
  // existence all resolve the parent through `parentDirectoryOf`, so no second re-root path exists
  // that could publish a different folder, query, or selection.
  protected navigateBackward(): void {
    const previousDirectory = this.currentDirectory;
    const parentDirectory = this.parentDirectoryOf(previousDirectory);
    if (parentDirectory === null) return;
    this.currentDirectory = parentDirectory;
    this.replaceDirectory(previousDirectory);
  }

  protected parentDirectoryOf(directoryPath: string): string | null {
    if (directoryPath.length === 0 || directoryPath === this.workspaceRoot) {
      return null;
    }
    return (
      Files.Class.confineToRoot(
        this.workspaceRoot,
        Files.Class.dirname(directoryPath),
      ) || null
    );
  }

  protected replaceDirectory(selectedItemIdentifier?: string): void {
    this.dependencies.popup.replaceItems(
      this.itemsForDirectory(this.currentDirectory),
      selectedItemIdentifier,
      {
        resetQuery: true,
        title: this.titleForDirectory(this.currentDirectory),
      },
    );
  }

  protected titleForDirectory(directoryPath: string): string {
    const relativeDirectory = Files.Class.relative(
      this.workspaceRoot,
      directoryPath,
    );
    return relativeDirectory
      ? `Browse ${relativeDirectory}`
      : `Browse ${Files.Class.basename(this.workspaceRoot)}`;
  }
}

export namespace BreadcrumbPicker {
  export const $Class = Static($BreadcrumbPicker);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
  export type Instance = InstanceType<typeof Class>;
}

export interface BreadcrumbPickerDependencies {
  popup: Pick<BoundedListPopup.Instance, 'openAt' | 'replaceItems'>;
  overlayCoordinator: Pick<OverlayCoordinator.Instance, 'openExclusiveOverlay'>;
  workspaceSet: WorkspaceSet.Instance;
  theme: Pick<Theme.Instance, 'icon'>;
}
