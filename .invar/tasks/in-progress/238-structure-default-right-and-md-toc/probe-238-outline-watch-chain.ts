// What this finds out: whether the structure outline's fingerprint watch fires through the
// right-dock observation chain (plugin -> rightDockHost -> outline) outside the full app —
// isolating "watch never fires" from an app wiring problem seen in the #238 drive.
// Run: bun .invar/tasks/active/238-structure-default-right-and-md-toc/probe-238-outline-watch-chain.ts
// Read the output: each line prints requestCount/status after a step. If the final line still
// says requests=0 status=no-document, the watch chain is broken in isolation too (a code bug);
// if it says requests=1 status=ready, the defect lives in the app's own wiring.
import { ref } from 'vue';
import { PanelHost } from '../../../../src/modules/ui/PanelHost';
import { ProviderRegistry } from '../../../../src/modules/plugins/ProviderRegistry';
import { DocumentLifecycle } from '../../../../src/modules/workspace/DocumentLifecycle';
import { TextDocument } from '../../../../src/modules/text/TextDocument';
import { StructurePlugin } from '../../../../src/modules/structure/StructurePlugin';
import type { Workspace } from '../../../../src/modules/workspace/Workspace';
import type { ApplicationContributionContext } from '../../../../src/modules/app/ApplicationContributor.interface';
import type { PaneContent } from '../../../../src/modules/ui/PaneContent.interface';

const rightDockHost = new PanelHost.Class({ showWhenContentRegistered: true });
const providers = new ProviderRegistry.Class();
const documentLifecycle = new DocumentLifecycle.Class();
const handle: { document: InstanceType<typeof TextDocument.Class> | null } = {
  document: null,
};
const workspace = {
  providers,
  documentLifecycle,
  get activeDocumentHandle() {
    return handle.document ? { document: handle.document } : null;
  },
} as unknown as Workspace.Model;

const plugin = new StructurePlugin.Class();
plugin.attachWorkspace(workspace);
const context = {
  workspaceSet: { active: workspace, activeWorkspaceIndex: ref(0) },
  rightDockHost,
  settings: { scrollbarThickness: ref(1) },
  theme: { glyphLevel: ref('unicode') },
  registerKeybindings: () => {},
  registerRightDockContent: (content: PaneContent) =>
    rightDockHost.register(content),
  registerSetting: () => ({
    value: ref(true),
    save: () => {},
    dispose: () => {},
  }),
  statusProjectionContributions: { register: () => () => {} },
  commands: { registerAll: () => () => {} },
  requestRender: () => {},
} as unknown as ApplicationContributionContext;
plugin.activateApplication(context);

const outline = plugin.controllerFor(workspace).outline;
const report = (step: string) =>
  console.log(
    `${step}: requests=${outline.requestCount.value} status=${outline.status.value} dockVisible=${rightDockHost.visible.value} active=${rightDockHost.activeContent?.id}`,
  );

report('after activation');

providers.register('structure', {
  supportsDocument: () => true,
  documentSymbols: async () => ({
    symbols: [
      {
        name: 'thing',
        symbolClass: 'type',
        line: 0,
        column: 0,
        endLine: 0,
        children: [],
      },
    ],
    truncated: false,
  }),
  structureNotice: () => null,
});

const document = new TextDocument.Class();
document.loadFromText('class A {}\n', '/tmp/probe.ts');
handle.document = document;
documentLifecycle.becameActive({ document } as never);

await new Promise((resolve) => setTimeout(resolve, 120));
report('after document became active (120ms)');

document.insertInline(0, 0, 'x');
await new Promise((resolve) => setTimeout(resolve, 500));
report('after an edit (500ms)');
