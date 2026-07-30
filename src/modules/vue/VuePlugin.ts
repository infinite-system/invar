import type {
  ApplicationContributionContext,
  ApplicationContributor,
} from '../app/ApplicationContributor.interface';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import { VueSyntaxSource } from './VueSyntaxSource';

// invariant: Vue syntax is a removable SFC contribution (src/modules/vue/vue.invariants.md)
class $VuePlugin implements ApplicationContributor, WorkspaceContributor {
  readonly identifier = 'vue';
  readonly name = 'Vue';
  readonly canDisable = true;
  readonly workspaceContributor: WorkspaceContributor = this;

  activateApplication(_context: ApplicationContributionContext): void {}

  attachWorkspace(_workspace: Workspace.Model): WorkspaceContribution {
    return new VueSyntaxSource.Class();
  }

  disposeApplication(): void {}
}

export namespace VuePlugin {
  export const $Class = $VuePlugin;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
