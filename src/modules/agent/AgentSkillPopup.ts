import type { CliRenderer } from '@opentui/core';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';
import {
  BoundedListPopup,
  type BoundedListPopupAnchor,
  type BoundedListPopupGeometry,
  type BoundedListPopupItem,
} from '../ui/BoundedListPopup';
import type { ScrollPhysics } from '../ui/ScrollPhysics';
import { WrapText } from '../ui/WrapText';
import type { AgentSkillInvocation } from './AgentComposer';
import {
  AgentPromptResolver,
  type AgentPromptSkill,
} from './AgentPromptResolver';

// invariant: Agent skill invocations use the composer popup (src/modules/agent/agent.invariants.md)
// invariant: Bounded list interactions live in one popup (src/modules/ui/ui.invariants.md)
// invariant: Held key movement accelerates within a ceiling (project.invariants.md)
class $AgentSkillPopup {
  protected readonly popup: BoundedListPopup.Model;
  protected readonly skillCache = new Map<
    string,
    readonly AgentPromptSkill[]
  >();
  protected activeInvocationKey: string | null = null;
  protected dismissedInvocationKey: string | null = null;

  constructor(protected readonly dependencies: AgentSkillPopupDependencies) {
    this.popup = this.createPopup({
      ...dependencies,
      identifier: 'agent-skill-popup',
    });
  }

  protected createPopup(
    dependencies: ConstructorParameters<typeof BoundedListPopup.Class>[0],
  ): BoundedListPopup.Model {
    return new BoundedListPopup.Class(dependencies);
  }

  get open() {
    return this.popup.open;
  }

  get paintRevision() {
    return this.popup.paintRevision;
  }

  get items(): readonly BoundedListPopupItem[] {
    return this.popup.items.value;
  }

  get selectedIdentifier(): string | null {
    return (
      this.popup.filteredMatches[this.popup.selectedIndex.value]?.item
        .identifier ?? null
    );
  }

  get geometry(): BoundedListPopupGeometry | null {
    return this.popup.geometry;
  }

  synchronize(
    ownerIdentifier: string,
    workspaceRoot: string,
    invocation: AgentSkillInvocation | null,
    anchor: BoundedListPopupAnchor | null,
    accept: (invocation: AgentSkillInvocation, skillName: string) => void,
  ): void {
    if (!invocation || !anchor) {
      this.closeAndResetDismissal();
      return;
    }
    const invocationKey = [
      ownerIdentifier,
      invocation.start,
      invocation.end,
      invocation.prefix,
    ].join(':');
    this.activeInvocationKey = invocationKey;
    if (invocationKey === this.dismissedInvocationKey) {
      this.popup.close();
      return;
    }
    const matchingSkills = this.skills(workspaceRoot).filter((skill) =>
      skill.name
        .toLocaleLowerCase()
        .startsWith(invocation.prefix.toLocaleLowerCase()),
    );
    const minimumWidth = 18;
    const naturalItems = matchingSkills.map((skill) => this.item(skill));
    const popupGeometry = this.layoutGeometry(
      naturalItems,
      anchor,
      minimumWidth,
    );
    const maximumLabelWidth = Math.max(0, popupGeometry.listColumns - 1);
    const items = matchingSkills.map((skill) =>
      this.item(skill, maximumLabelWidth),
    );
    if (items.length === 0) {
      this.popup.close();
      return;
    }
    this.popup.openAt(
      items,
      anchor,
      (item) => {
        accept(invocation, item.identifier);
        this.closeAndResetDismissal();
      },
      {
        searchVisible: false,
        showBackdrop: false,
        itemsAlreadyFiltered: true,
        minimumWidth: popupGeometry.boxWidth,
        availableBottomExclusive: anchor.row,
        selectedItemIdentifier: this.selectedIdentifier ?? undefined,
      },
    );
  }

  dismiss(): void {
    this.dismissedInvocationKey = this.activeInvocationKey;
    this.popup.close();
  }

  moveSelection(direction: 1 | -1): void {
    this.popup.moveSelection(direction);
  }

  runSelected(): void {
    this.popup.runSelected();
  }

  tick(deltaTimeSeconds: number): boolean {
    return this.popup.tick(deltaTimeSeconds);
  }

  update(): void {
    this.popup.update();
  }

  close(): void {
    this.closeAndResetDismissal();
  }

  dispose(): void {
    this.popup.dispose();
    this.skillCache.clear();
  }

  protected skills(workspaceRoot: string): readonly AgentPromptSkill[] {
    const cached = this.skillCache.get(workspaceRoot);
    if (cached) return cached;
    const skills = AgentPromptResolver.Class.skills(workspaceRoot);
    this.skillCache.set(workspaceRoot, skills);
    return skills;
  }

  protected item(
    skill: AgentPromptSkill,
    maximumLabelWidth = Number.POSITIVE_INFINITY,
  ): BoundedListPopupItem {
    const nameLabel = `/${skill.name}`;
    const description = skill.description.replace(/\s+/gu, ' ').trim();
    const descriptionPrefix = `${nameLabel}  `;
    const maximumDescriptionWidth =
      maximumLabelWidth - WrapText.Class.displayWidth(descriptionPrefix);
    const clippedDescription =
      maximumDescriptionWidth > 0
        ? WrapText.Class.clipToWidth(description, maximumDescriptionWidth)
        : '';
    return {
      identifier: skill.name,
      label: clippedDescription
        ? `${descriptionPrefix}${clippedDescription}`
        : nameLabel,
      searchText: skill.name,
    };
  }

  protected layoutGeometry(
    items: readonly BoundedListPopupItem[],
    anchor: BoundedListPopupAnchor,
    minimumWidth: number,
  ): BoundedListPopupGeometry {
    const scrollbarThickness = Math.max(
      1,
      Math.round(this.dependencies.settings.scrollbarThickness.value),
    );
    const maximumItemWidth = BoundedListPopup.$Class.itemSetMaximumWidth(items);
    return BoundedListPopup.$Class.layoutGeometry({
      screenWidth: this.dependencies.renderer.width,
      screenHeight: this.dependencies.renderer.height,
      anchor,
      desiredBoxWidth: BoundedListPopup.$Class.desiredBoxWidth(
        maximumItemWidth,
        '',
        minimumWidth,
      ),
      itemCount: items.length,
      searchVisible: false,
      iconColumns: 0,
      scrollbarThickness,
      firstVisible: 0,
      availableBottomExclusive: anchor.row,
    });
  }

  protected closeAndResetDismissal(): void {
    this.activeInvocationKey = null;
    this.dismissedInvocationKey = null;
    this.popup.close();
  }
}

export namespace AgentSkillPopup {
  export const $Class = $AgentSkillPopup;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface AgentSkillPopupDependencies {
  readonly renderer: CliRenderer;
  readonly settings: Settings.Instance;
  readonly theme: Theme.Instance;
  readonly scrollPhysics: ScrollPhysics.Model;
}
