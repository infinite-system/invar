// The monitoring consumer's view of language-server processes. A provider reports only the
// processes that it owns. The host workspace registry carries the rendezvous, so monitoring never
// names an LSP class and an LSP plugin can leave while monitoring stays active.
//
// invariant: Peer plugins can have different lifetimes (src/modules/plugins/plugins.invariants.md)
// invariant: Provider rendezvous is host carried (src/modules/plugins/plugins.invariants.md)
export interface LanguageServerProcessSource {
  languageServerProcesses(): readonly MonitoredLanguageServerProcess[];
}

export interface MonitoredLanguageServerProcess {
  readonly serverName: string;
  readonly processId: number;
}
