import type { Ref } from 'vue';
import type { Settings } from '../settings/Settings';
import type { Workspace } from './Workspace';

// invariant: Plugin boundaries grant one authority (project.invariants.md)
export interface WorkspaceContributor {
  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution;
}

export interface WorkspaceProvider {
  readonly identifier: string;
}

export interface WorkspaceContribution {
  readonly providers?: readonly WorkspaceProvider[];
  readonly renderRevision?: Readonly<Ref<number>>;
  opened(root: string): void;
  settingsAttached?(settings: Settings.Instance): void;
  suspended(): void;
  resumed(): void;
  disposed(): void;
  tickScroll?(deltaSeconds: number): boolean;
  readonly tabDetail?: string;
  worktreeName?(): string | null;
  projectName?(): string | null;
}
