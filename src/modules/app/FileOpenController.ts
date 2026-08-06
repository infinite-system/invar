import { ChannelDialogBridge } from '../channel/ChannelDialogBridge';
import { Files } from '../system/Files';
import { NativeFileDialog } from '../system/NativeFileDialog';
import type { Theme } from '../theme/Theme';
import type {
  BoundedListPopup,
  BoundedListPopupItem,
} from '../ui/BoundedListPopup';
import type { OverlayCoordinator } from '../ui/OverlayCoordinator';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { PathDropController } from './PathDropController';

// invariant: File access is confined to a single root (src/modules/system/system.invariants.md)
// invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
class $FileOpenController {
  constructor(
    protected readonly dependencies: FileOpenControllerDependencies,
  ) {}

  protected currentDirectory = '';

  protected get browserEntryLimit(): number {
    return 2000;
  }

  async open(): Promise<void> {
    const channelDialogResult = await ChannelDialogBridge.Class.pickFile();
    if (channelDialogResult.available) {
      if (channelDialogResult.path) {
        this.dependencies.pathDropController.handlePaths([
          channelDialogResult.path,
        ]);
      }
      return;
    }

    const nativeDialogResult = await NativeFileDialog.Class.pickFile(
      this.dependencies.workspaceSet.active.root,
    );
    if (nativeDialogResult.available) {
      if (nativeDialogResult.path) {
        this.dependencies.pathDropController.handlePaths([
          nativeDialogResult.path,
        ]);
      }
      return;
    }
    this.openBrowser(this.dependencies.workspaceSet.active.root);
  }

  openBrowser(directory: string): void {
    this.currentDirectory = Files.Class.absolute(directory);
    const items = this.itemsFor(this.currentDirectory);
    this.dependencies.overlayCoordinator.openExclusiveOverlay(
      'boundedListPopup',
      () =>
        this.dependencies.boundedListPopup.openAt(
          items,
          this.dependencies.popupAnchor(),
          (item) => this.activate(item),
          {
            ownerIdentifier: 'file-open',
            title: this.titleFor(this.currentDirectory),
            minimumWidth: 42,
            selectedItemIdentifier:
              Files.Class.dirname(this.currentDirectory) ===
              this.currentDirectory
                ? undefined
                : Files.Class.dirname(this.currentDirectory),
            navigateBackwardHandler: () => this.navigateToParent(),
          },
        ),
    );
  }

  protected activate(item: BoundedListPopupItem): void {
    if (item.identifier === 'empty') return;
    if (Files.Class.isDir(item.identifier)) {
      this.currentDirectory = item.identifier;
      this.dependencies.boundedListPopup.replaceItems(
        this.itemsFor(this.currentDirectory),
        undefined,
        { resetQuery: true, title: this.titleFor(this.currentDirectory) },
      );
      return;
    }
    this.dependencies.boundedListPopup.close();
    this.dependencies.pathDropController.handlePaths([item.identifier]);
  }

  protected navigateToParent(): void {
    const parentDirectory = Files.Class.dirname(this.currentDirectory);
    if (parentDirectory === this.currentDirectory) return;
    const previousDirectory = this.currentDirectory;
    this.currentDirectory = parentDirectory;
    this.dependencies.boundedListPopup.replaceItems(
      this.itemsFor(parentDirectory),
      previousDirectory,
      { resetQuery: true, title: this.titleFor(parentDirectory) },
    );
  }

  protected itemsFor(directory: string): readonly BoundedListPopupItem[] {
    const workspaceRoot = this.dependencies.workspaceSet.active.root;
    const directoryIsOutsideRoot =
      Files.Class.confineToRoot(workspaceRoot, directory) === null;
    const parentDirectory = Files.Class.dirname(directory);
    const parentItems: BoundedListPopupItem[] =
      parentDirectory === directory
        ? []
        : [
            {
              identifier: parentDirectory,
              label: '..',
              icon: this.dependencies.theme.icon('..', true, false),
              searchText: parentDirectory,
              drillable: true,
              keepOpenOnSelect: true,
              pinnedWhileQueryEmpty: true,
            },
          ];
    const listing = Files.Class.listNamesResult(directory);
    const entryNames = [...listing.entryNames].sort();
    const entryLimitReached = entryNames.length > this.browserEntryLimit;
    const entries: BoundedListPopupItem[] = entryNames
      .slice(0, this.browserEntryLimit)
      .map((entryName) => {
        const entryPath = Files.Class.join(directory, entryName);
        const entryIsDirectory = Files.Class.isDir(entryPath);
        const outsideRoot =
          Files.Class.confineToRoot(workspaceRoot, entryPath) === null;
        return {
          identifier: entryPath,
          label:
            entryName +
            (entryIsDirectory ? '/' : '') +
            (!entryIsDirectory && outsideRoot ? '  [read-only]' : ''),
          icon: this.dependencies.theme.icon(
            entryName,
            entryIsDirectory,
            false,
          ),
          searchText: entryName,
          drillable: entryIsDirectory,
          keepOpenOnSelect: entryIsDirectory,
        } satisfies BoundedListPopupItem;
      });
    entries.sort((firstEntry, secondEntry) => {
      const firstIsDirectory = firstEntry.drillable === true;
      const secondIsDirectory = secondEntry.drillable === true;
      if (firstIsDirectory !== secondIsDirectory) {
        return firstIsDirectory ? -1 : 1;
      }
      return firstEntry.label.localeCompare(secondEntry.label);
    });
    if (entryLimitReached) {
      entries.push({
        identifier: 'entry-limit',
        label: `(showing first ${this.browserEntryLimit} entries)`,
        enabled: false,
      });
    }
    if (entries.length > 0) return [...parentItems, ...entries];
    return [
      ...parentItems,
      {
        identifier: 'empty',
        label: !listing.ok
          ? '(folder unavailable)'
          : directoryIsOutsideRoot
            ? '(empty folder)  [read-only]'
            : '(empty folder)',
        enabled: false,
      },
    ];
  }

  protected titleFor(directory: string): string {
    const outsideRoot =
      Files.Class.confineToRoot(
        this.dependencies.workspaceSet.active.root,
        directory,
      ) === null;
    return outsideRoot
      ? `Open File — ${directory} [read-only]`
      : `Open File — ${directory}`;
  }
}

export namespace FileOpenController {
  export const $Class = $FileOpenController;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface FileOpenControllerDependencies {
  readonly workspaceSet: WorkspaceSet.Instance;
  readonly pathDropController: PathDropController.Model;
  readonly boundedListPopup: BoundedListPopup.Instance;
  readonly overlayCoordinator: OverlayCoordinator.Instance;
  readonly theme: Theme.Instance;
  readonly popupAnchor: () => { column: number; row: number };
}
