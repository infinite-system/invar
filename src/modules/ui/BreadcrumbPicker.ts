import { Files } from '../system/Files';
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
class $BreadcrumbPicker {
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
            navigateBackwardAvailable: () => this.navigateBackwardAvailable(),
          },
        ),
    );
  }

  protected itemsForDirectory(
    directoryPath: string,
  ): readonly BoundedListPopupItem[] {
    const entries = Files.Class.list(directoryPath);
    this.directoryPaths = new Set(
      entries.filter((entry) => entry.isDir).map((entry) => entry.path),
    );
    return entries.map((entry) => ({
      identifier: entry.path,
      label: entry.isDir ? `${entry.name}/` : entry.name,
      searchText: entry.name,
      drillable: entry.isDir,
      keepOpenOnSelect: entry.isDir,
    }));
  }

  protected activateItem(item: BoundedListPopupItem): void {
    if (this.directoryPaths.has(item.identifier)) {
      this.currentDirectory = item.identifier;
      this.replaceDirectory();
      return;
    }
    this.dependencies.workspaceSet.active.openFileInTab(item.identifier);
    this.dependencies.workspaceSet.active.focus.value = 'editor';
  }

  protected navigateBackward(): void {
    if (!this.navigateBackwardAvailable()) return;
    const previousDirectory = this.currentDirectory;
    const parentDirectory = Files.Class.confineToRoot(
      this.workspaceRoot,
      Files.Class.dirname(this.currentDirectory),
    );
    if (!parentDirectory) return;
    this.currentDirectory = parentDirectory;
    this.replaceDirectory(previousDirectory);
  }

  protected navigateBackwardAvailable(): boolean {
    return (
      this.currentDirectory.length > 0 &&
      this.currentDirectory !== this.workspaceRoot
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
  export const $Class = $BreadcrumbPicker;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
  export type Instance = InstanceType<typeof Class>;
}

export interface BreadcrumbPickerDependencies {
  popup: Pick<BoundedListPopup.Instance, 'openAt' | 'replaceItems'>;
  overlayCoordinator: Pick<OverlayCoordinator.Instance, 'openExclusiveOverlay'>;
  workspaceSet: WorkspaceSet.Instance;
}
