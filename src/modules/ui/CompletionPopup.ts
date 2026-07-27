import { Static } from 'ivue/extras';
import type { CliRenderer } from '@opentui/core';
import { Reactive } from 'ivue';
import { CompletionItemKinds } from '../lsp/CompletionItemKinds';
import type {
  LanguageCompletionItem,
  LanguageCompletionList,
} from '../lsp/LanguageProvider.interface';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import {
  BoundedListPopup,
  type BoundedListPopupAnchor,
  type BoundedListPopupItem,
} from './BoundedListPopup';
import type { ScrollPhysics } from './ScrollPhysics';

// invariant: Completion is provider-neutral (src/modules/lsp/lsp.invariants.md)
// invariant: Completion reuses bounded popup geometry (src/modules/ui/ui.invariants.md)
class $CompletionPopup {
  protected readonly popup: BoundedListPopup.Model;
  protected sourceItems: readonly LanguageCompletionItem[] = [];
  protected completionItemsByIdentifier = new Map<
    string,
    LanguageCompletionItem
  >();
  protected sourceIdentifierByItem = new Map<LanguageCompletionItem, string>();
  protected acceptanceHandler: ((item: LanguageCompletionItem) => void) | null =
    null;
  protected prefixValue = '';
  protected sourceIsIncompleteValue = false;

  constructor(protected readonly dependencies: CompletionPopupDependencies) {
    this.popup = new BoundedListPopup.Class({
      renderer: dependencies.renderer,
      settings: dependencies.settings,
      theme: dependencies.theme,
      scrollPhysics: dependencies.scrollPhysics,
      identifier: 'completion-popup',
    });
  }

  get open(): boolean {
    return this.popup.open.value;
  }

  get selectedLabel(): string {
    const match = this.popup.filteredMatches[this.popup.selectedIndex.value];
    return match?.item.label ?? '';
  }

  get itemCount(): number {
    return this.popup.filteredMatches.length;
  }

  get sourceIsIncomplete(): boolean {
    return this.sourceIsIncompleteValue;
  }

  get paintRevision() {
    return this.popup.paintRevision;
  }

  get geometry() {
    return this.popup.geometry;
  }

  show(
    completionList: LanguageCompletionList,
    anchor: BoundedListPopupAnchor,
    prefix: string,
    acceptanceHandler: (item: LanguageCompletionItem) => void,
  ): void {
    this.sourceItems = completionList.items;
    this.sourceIsIncompleteValue = completionList.isIncomplete;
    this.prefixValue = prefix;
    this.sourceIdentifierByItem = new Map(
      completionList.items.map((item, index) => [
        item,
        `${index}:${item.label}`,
      ]),
    );
    this.acceptanceHandler = acceptanceHandler;
    const items = this.popupItems(prefix);
    if (items.length === 0) {
      this.close();
      return;
    }
    this.popup.openAt(
      items,
      anchor,
      (item) => this.acceptIdentifier(item.identifier),
      {
        minimumWidth: 24,
        searchVisible: false,
        showBackdrop: false,
        itemsAlreadyFiltered: true,
      },
    );
  }

  narrow(prefix: string): void {
    if (!this.open || prefix === this.prefixValue) return;
    this.prefixValue = prefix;
    const selectedIdentifier =
      this.popup.filteredMatches[this.popup.selectedIndex.value]?.item
        .identifier;
    const items = this.popupItems(prefix);
    if (items.length === 0) {
      this.close();
      return;
    }
    this.popup.replaceItems(items, selectedIdentifier);
  }

  moveSelection(direction: 1 | -1): void {
    this.popup.moveSelection(direction);
  }

  acceptSelected(): void {
    this.popup.runSelected();
  }

  close(): void {
    this.popup.close();
    this.sourceItems = [];
    this.completionItemsByIdentifier.clear();
    this.sourceIdentifierByItem.clear();
    this.acceptanceHandler = null;
    this.prefixValue = '';
    this.sourceIsIncompleteValue = false;
  }

  tick(deltaTimeSeconds: number): boolean {
    return this.popup.tick(deltaTimeSeconds);
  }

  update(): void {
    this.popup.update();
  }

  dispose(): void {
    this.popup.dispose();
  }

  static filterItems(
    items: readonly LanguageCompletionItem[],
    prefix: string,
  ): readonly LanguageCompletionItem[] {
    const normalizedPrefix = prefix.toLocaleLowerCase();
    return items
      .filter((item) =>
        (item.filterText ?? item.label)
          .toLocaleLowerCase()
          .startsWith(normalizedPrefix),
      )
      .map((item, sourceIndex) => ({ item, sourceIndex }))
      .sort(
        (first, second) =>
          (first.item.sortText ?? first.item.label).localeCompare(
            second.item.sortText ?? second.item.label,
          ) || first.sourceIndex - second.sourceIndex,
      )
      .map(({ item }) => item);
  }

  // The mark comes from the SAME authority the file tree resolves through: the item's kind becomes a
  // symbol class, the theme's one table turns that class into a mark. The tier's whole mark row is
  // read ONCE per rebuild, so marking five thousand items costs five thousand property reads and no
  // per-item theme resolution — and nothing at all on a movement or wheel frame, which paints only
  // the visible window from rows that already carry their mark.
  // invariant: One table resolves every symbol mark (src/modules/theme/theme.invariants.md)
  // invariant: List interactions inspect only visible rows (src/modules/ui/ui.invariants.md)
  protected popupItems(prefix: string): readonly BoundedListPopupItem[] {
    this.completionItemsByIdentifier.clear();
    const symbolMarks = this.dependencies.theme.symbolMarks;
    return $CompletionPopup
      .filterItems(this.sourceItems, prefix)
      .map((item) => {
        const identifier = this.sourceIdentifierByItem.get(item) ?? item.label;
        this.completionItemsByIdentifier.set(identifier, item);
        return {
          identifier,
          label: item.label,
          icon: symbolMarks[
            CompletionItemKinds.Class.symbolClassFor(item.kind)
          ],
        };
      });
  }

  protected acceptIdentifier(identifier: string): void {
    const item = this.completionItemsByIdentifier.get(identifier);
    const acceptanceHandler = this.acceptanceHandler;
    this.close();
    if (item) acceptanceHandler?.(item);
  }
}

export namespace CompletionPopup {
  export const $Class = Static($CompletionPopup);
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface CompletionPopupDependencies {
  renderer: CliRenderer;
  settings: Settings.Instance;
  theme: Theme.Instance;
  scrollPhysics: ScrollPhysics.Model;
}
