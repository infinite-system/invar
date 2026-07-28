# External Harness Control over MCP

Design for letting Claude Code, Codex, Pi, and Hermes launched in an Invar task terminal control
the exact Invar workspace that launched them. Invar exposes editor capabilities; it does not
rebuild or normalize the harnesses.

**Record location:** this is a root `project.*` record because transport, task launch, workspace
identity, editor commands, agent consent, and terminal observation cross several module domains.

## Status and dependency

This is a design, not an implementation. The mutation surface in particular is a recommendation
awaiting the user's decision.

`#156 (tasks capability)` is the launch seam: a task definition contributes environment variables
and arguments immediately before its child process is spawned. As inspected on 2026-07-27,
`feat-tasks-capability` still points at `main` (`bf57bcf`) and `/tmp/conductor-tasks` has no
uncommitted work or `tasks.invariants.md`. The build must therefore reconcile the names and exact
types below with that task's landed contribution contract; it must not create a second launcher.

## Reduction

The harness does not have to live inside Invar. It needs one authenticated capability to the Invar
workspace that launched it.

That leaves three layers:

1. Invar exposes one harness-neutral MCP server.
2. The task launcher translates one launch capability into each harness's configuration grammar.
3. Editor commands enforce workspace identity, consent, revision, attribution, and lifecycle after
   transport has delivered a call.

Harness context size, model choice, transcript format, and agent loop remain harness concerns.

## Transport: loopback Streamable HTTP

Choose MCP Streamable HTTP at a loopback URL:

```text
http://127.0.0.1:<ephemeral-port>/mcp/<workspace-instance-id>/<launch-id>
```

One listener belongs to one running Invar process. It binds an OS-assigned port on
`127.0.0.1` only. Each launched task gets its own URL path and bearer capability even when several
tasks share a workspace.

### Why this transport

MCP stdio has the wrong owner for this topology. In stdio, the MCP client launches and owns the
server subprocess. Here Invar is already running, owns live editor state, and launches the MCP
client. A stdio shim would have to be launched per harness and forward to the real Invar process;
that adds another bridge and lifecycle without changing the actual transport requirement.

A Unix-domain socket fits local IPC but is not a standard MCP transport accepted uniformly by the
four clients. Pi's current adapter has a socket mode for `rmcp-mux`, while Claude, Codex's MCP URL
configuration, and Hermes document Streamable HTTP instead. Choosing a socket would make one
harness's extension model the abstraction.

Streamable HTTP is explicitly the standard independent-server transport. Claude, Codex, Pi's MCP
adapter, and Hermes all accept an HTTP URL. An ephemeral port prevents fixed-port collisions between
Invar windows. The literal `127.0.0.1` avoids `localhost` IPv4/IPv6 resolution drift.

### Local transport security

- Reject every non-loopback bind configuration.
- Validate `Origin`; reject a present origin unless it is an allowed local origin. This is required
  by the MCP Streamable HTTP specification to prevent DNS rebinding.
- Require `Authorization: Bearer <capability>` on initialization and every later request. A random
  port or opaque URL is not authentication.
- Put the token in the child environment, never in argv, because argv is commonly process-visible.
- Create generated configuration under a mode-`0700` runtime directory and files at mode `0600`.
- Cap request bodies, tool results, concurrent calls, and call duration. Closing a client connection
  cancels work that has not crossed an editor command boundary.
- Do not add TLS for loopback. The bearer capability and OS-local bind establish the boundary;
  local TLS would add certificate distribution without protecting against a process already able to
  inspect the launching user's environment.

## Instance identity: a launch capability, never "current Invar"

Three cryptographically random identifiers exist at different lifetimes:

| Identity | Lifetime | Purpose |
| --- | --- | --- |
| application instance | one Invar process | distinguishes simultaneous Invar windows |
| workspace instance | one workspace opened in that process | distinguishes tabs/workspaces, including the same path opened twice |
| launch instance | one spawned task process | attributes and revokes one harness connection |

The workspace identity is not a hash of its filesystem path. Two windows may open the same path and
must remain distinct editor instances.

At launch, Invar creates a random bearer token and stores a server-side record:

```text
token -> application instance + workspace instance + launch instance
         + harness kind + task title + consent state
```

The endpoint path selects the same record, but the server trusts only the bearer-token lookup. MCP
transport session IDs are additional connection identifiers, not workspace authority.

Every tool is constructed already bound to that workspace. No tool accepts an application ID,
workspace ID, workspace path, or "active workspace" selector that could redirect a call. The
initialization instructions and `invar_get_context` result return the bound display name, root,
identifiers, and connection attribution so the harness can report where it is operating.

There is deliberately:

- no global endpoint file;
- no fixed port;
- no "last Invar instance" registry;
- no `.invar/endpoint` under the workspace;
- no lookup by current working directory.

All four alternatives can be overwritten or ambiguously read when two windows open the same
workspace. The launcher hands the child the capability directly, so discovery never performs a
machine-wide search.

## Runtime material

Use the first available private OS runtime location, for example
`$XDG_RUNTIME_DIR/invar/<application-instance-id>/` on Linux or the user's private temporary
directory on macOS. Under it, each launch has:

```text
<workspace-instance-id>/<launch-id>/
  claude-mcp.json
  pi-mcp.json
  hermes-home/config.yaml
```

Only the files required by the selected harness need to exist. The common launch environment is:

```text
INVAR_MCP_ENDPOINT=http://127.0.0.1:<port>/mcp/<workspace-instance-id>/<launch-id>
INVAR_MCP_TOKEN=<random 256-bit bearer token>
INVAR_MCP_SERVER_NAME=invar_<workspace-short-id>_<launch-short-id>
INVAR_APP_INSTANCE_ID=<application-instance-id>
INVAR_WORKSPACE_INSTANCE_ID=<workspace-instance-id>
INVAR_LAUNCH_ID=<launch-id>
```

The IDs are diagnostic; the bearer token is the authority. A per-launch server name prevents a
user's ambient MCP configuration from shadowing Invar and prevents two live Invar connections from
colliding inside a harness.

## Zero-action discovery per harness

The task launcher chooses an adapter from the executable/task kind and contributes the following
environment, argv, and generated file. It preserves the user's other MCP servers.

### Claude Code

Generate `<runtime>/claude-mcp.json`:

```json
{
  "mcpServers": {
    "<INVAR_MCP_SERVER_NAME>": {
      "type": "http",
      "url": "${INVAR_MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer ${INVAR_MCP_TOKEN}"
      }
    }
  }
}
```

Launch with:

```text
claude --mcp-config <runtime>/claude-mcp.json <the user's remaining arguments>
```

`--mcp-config` accepts JSON files or inline JSON, and Claude expands environment variables in HTTP
`url` and `headers`. Do not pass `--strict-mcp-config`: it would discard the user's other configured
MCP servers. A user-supplied `--mcp-config` remains present as another occurrence; the Invar file is
added as the final occurrence.

### Codex

Codex has no per-invocation MCP file flag. Use its general one-run configuration overrides:

```text
codex \
  -c 'mcp_servers.<server-name>.url="<literal INVAR_MCP_ENDPOINT>"' \
  -c 'mcp_servers.<server-name>.bearer_token_env_var="INVAR_MCP_TOKEN"' \
  -c 'mcp_servers.<server-name>.required=true' \
  <the user's remaining arguments>
```

The endpoint is inserted as a correctly escaped TOML string; the token remains only in the
environment. `required=true` makes a missing or wrong Invar endpoint a visible startup failure
instead of silently starting an agent with no editor tools. These overrides layer above the user's
`~/.codex/config.toml` and project `.codex/config.toml`.

### Pi

Core Pi does not currently ship an MCP client. It exposes the extension seam through `-e`, and the
maintained `pi-mcp-adapter` supplies Streamable HTTP plus an invocation-scoped `--mcp-config`.
Zero user action therefore requires Invar to ship a reviewed, version-pinned copy of that adapter
as a runtime dependency; requiring the user to run `pi install` is not this design.

Generate `<runtime>/pi-mcp.json`:

```json
{
  "mcpServers": {
    "<INVAR_MCP_SERVER_NAME>": {
      "url": "${INVAR_MCP_ENDPOINT}",
      "bearerTokenEnv": "INVAR_MCP_TOKEN",
      "lifecycle": "eager",
      "directTools": true
    }
  }
}
```

Launch with:

```text
pi -e <invar-bundled-pi-mcp-adapter-entry> \
  --mcp-config <runtime>/pi-mcp.json \
  <the user's remaining arguments>
```

`lifecycle: "eager"` surfaces a bad endpoint at startup. `directTools: true` gives the model the
same explicit tool vocabulary the other harnesses receive instead of hiding it behind Pi's generic
MCP proxy tool. The adapter is compatibility code, not a Pi-specific Invar protocol; every request
still crosses the same MCP server.

This dependency must be capability-probed at build and launch. If Pi gains a native equivalent,
replace the adapter without changing the server, identity, tools, or consent design.

### Hermes

Hermes reads MCP entries from `${HERMES_HOME}/config.yaml` and currently offers no
invocation-scoped MCP config flag. It does support environment substitution in YAML and defines
`HERMES_HOME` as the complete profile boundary.

Create a launch-only Hermes home whose `config.yaml` is a structural YAML merge of the active
Hermes profile plus:

```yaml
mcp_servers:
  <INVAR_MCP_SERVER_NAME>:
    url: "${INVAR_MCP_ENDPOINT}"
    headers:
      Authorization: "Bearer ${INVAR_MCP_TOKEN}"
    enabled: true
    connect_timeout: 5
```

Launch with:

```text
HERMES_HOME=<runtime>/hermes-home hermes chat <the user's remaining arguments>
```

The launch home overlays only `config.yaml`; its `.env`, authentication, memory, skills, sessions,
and other state entries resolve to the active base profile so connecting Invar does not create a
fresh Hermes identity. The adapter must parse and merge YAML, never append text and never mutate the
user's source profile. Standard `hermes -p/--profile` input is resolved to its base profile before
the overlay is created and removed from the final argv so it cannot override `HERMES_HOME`.
Unrecognized wrapper commands fail visibly rather than guessing which profile to clone.

If Hermes adds an invocation-scoped MCP file flag, use it and delete this overlay adapter. The MCP
server and all downstream behavior remain unchanged.

## Capability and compatibility boundary

The launcher adapter is allowed to translate configuration grammar only. It may:

- generate the harness's documented file shape;
- inject environment and documented command-line flags;
- probe the installed harness/adapter version for required capabilities;
- fail launch with an actionable message when a capability is missing.

It may not translate tools, proxy requests, hold editor state, or implement harness-specific
permissions. Those would be four bridges instead of one MCP server.

The checked interfaces on 2026-07-27 were Claude Code 2.1.220
(`--mcp-config`), Codex CLI 0.145.0 (`-c mcp_servers...`), Pi's documented `-e` extension seam with
`pi-mcp-adapter`, and Hermes's `HERMES_HOME/config.yaml`. Compatibility probes guard capabilities,
not version strings.

## Proposed MCP surface

The protocol exposes editor-semantic operations, not raw object-graph access. Document handles are
opaque and valid only inside the bound workspace capability. Every text result is bounded or
paginated. Every position names its encoding explicitly; the initial surface uses zero-based line
plus UTF-16 code-unit column because that composes with diagnostics and LSP without pretending
terminal columns are text positions.

### Read and inspect

- `invar_get_context()` — bound workspace identity, root, active document, selection, connection
  attribution, and current consent mode.
- `invar_list_open_documents()` — document IDs, workspace-relative paths, dirty state, and revision.
- `invar_read_document(documentId, range?, cursor?)` — unsaved buffer text, revision, line-ending
  kind, truncation, and pagination cursor.
- `invar_read_selection()` — active document and selected ranges/text.
- `invar_find(query, scope, options, cursor?)` — buffer or workspace search through Invar's search
  seams, with bounded results.
- `invar_read_diagnostics(documentId?, cursor?)` — revision-stamped diagnostics and explicit source.

### Navigate and present

- `invar_open_document(workspaceRelativePath, position?)`
- `invar_reveal_range(documentId, range)`
- `invar_set_selection(documentId, ranges, expectedRevision?)`

These alter visible editor state and are attributed, but not file content.

### Mutate, if the user approves this surface

- `invar_apply_text_edits(documentId, expectedRevision, edits, operationId)` — one atomic,
  non-overlapping edit set through the editor's normal edit/undo generator.
- `invar_save_document(documentId, expectedRevision)` — the editor's ordinary save path.

An edit response returns the new revision and undo-entry identity. `expectedRevision` makes a
successful call whose response was lost safe to retry: the duplicate cannot apply against the old
revision. `operationId` deduplicates an identical retry within the launch capability. User edits and
other harness edits serialize through the same revision check; stale requests return current
revision and a bounded conflict summary instead of applying.

### Deliberately absent from the proposed first surface

- arbitrary `execute_command`;
- shell or terminal-byte injection;
- git stage/commit/push;
- close-with-discard, force, or other destructive commands;
- internal model/ref access;
- a filesystem API parallel to the harness's existing file tools.

Git commit is repository authority, not editor authority, and every named harness already has a
shell path. A generic command escape hatch would make MCP permissions and compatibility depend on
the entire evolving command registry.

## User decision required: deliberate vocabulary or command mirror

**Recommendation, not a decision:** ship the deliberate semantic vocabulary above, including
atomic edit and save, and do not mirror the command registry in the first release.

The reason is protocol integrity rather than safety theater. An external agent may already edit the
same files directly, so removing MCP edits does not create a security boundary. The smaller
vocabulary instead gives Invar:

- stable schemas across keybinding and command refactors;
- explicit revision and coordinate semantics;
- one permission and attribution label per meaningful action;
- atomic undo for remote edits;
- bounded results and honest failure behavior;
- the ability to prove every exposed operation in all four harnesses.

The user's choice before the mutation wave is:

1. **Recommended:** the deliberate vocabulary above.
2. Read/navigation only; agents continue editing files through their native tools.
3. Mirror editor commands, which requires a separately designed command manifest with per-command
   schemas, side-effect classes, consent labels, and compatibility guarantees.

No implementation wave may silently select among these.

## DECIDED 2026-07-28 by the user: public API by default, internals mode opt-in

The three options above were framed as exclusive. The user's answer is a synthesis: **ship the
deliberate vocabulary as the default public API, and add a separate mode in which an agent can
explore Invar's internals and invoke them from inside.** Default is the public API; the internals
mode is never on by default.

### The reduction: one invocation mechanism, two exposed sets

Do NOT build two bridges. Both tiers are the same operation — *invoke a named thing with arguments
and get a bounded result*. What differs is only which set of names is visible and what guarantees
attach to them:

| | public API (default) | internals mode (opt-in) |
| --- | --- | --- |
| names exposed | the curated semantic vocabulary | the registry: commands, settings schema, plugin manifests |
| schemas | hand-written, explicit coordinate and revision semantics | derived from the registry |
| stability | a contract; survives refactors | **none — a renamed command breaks the caller** |
| discovery | fixed tool list | enumerate-then-invoke |
| attribution | one consent label per meaningful action | attributed distinctly, because it is unstable by construction |

Building one mechanism and gating the visible set means the mutation wave does not fork, and the
internals mode cannot drift into a second protocol with its own bugs.

### Read "explore internals" as REGISTRY reflection, not object-graph reflection

Two readings are possible and only one is buildable:

- **Registry reflection (recommended, and what this records).** Enumerate the command registry,
  the settings schema, and the plugin manifests — structures Invar already publishes for #100's
  one-manifest rule and #103's three plugin kinds — then invoke a registered command by name. There
  is a real, enumerable surface here today.
- **Object-graph reflection (rejected unless the user says otherwise).** Reflect over live classes
  and call arbitrary methods. Over a reactive graph this has no stable contract at all, no schema to
  derive, and no way to distinguish a query from a mutation. It would make every internal rename a
  remote breakage with no signal.

### Honest cost, stated so no wave can select it silently

Internals mode has **no compatibility guarantee**. An agent script that fires an internal command
breaks when that command is renamed, and nothing warns it. That is acceptable for exploration and
unacceptable for anything a user comes to depend on, so the mode must be:

- opt-in per workspace, never global and never default;
- attributed distinctly in the UI from public-API actions;
- documented as unstable AT THE POINT OF DISCOVERY — the enumeration response itself should say so,
  not just a page someone read once.

### This mirrors a policy the repo already has

The same two-tier shape was settled earlier for extension: **interfaces are the published contract
for distributable plugins; `extends $Class` is the enabled-but-unsupported path for making Invar
yours.** Public API is to interfaces as internals mode is to `extends` — a supported surface with a
promise, plus an escape hatch with power and no promise. One policy, applied twice, rather than two
ad-hoc answers.

## Attribution and consent

The bearer record, not client self-report, supplies the visible harness name and task title. MCP
`clientInfo` is recorded as additional diagnostics only.

While connected, Invar shows a status/presence item such as:

```text
Codex via MCP · task "fix parser" · connected
```

During calls it changes to the specific action and target. A content change also:

- creates an undo entry labelled with harness and task;
- marks the edited tab before any save;
- shows a visible notice when the changed document is not focused;
- emits an audit event containing launch identity, tool, target, revisions, consent resolution,
  result, and duration, while excluding document text and bearer tokens.

Launching a harness task is consent to connect and use read/navigation tools in that workspace.
The first content mutation enters the existing host-owned permission surface with
Allow once / Allow for this task / Deny. The tool call stays pending without blocking Invar input or
rendering. "Allow for this task" lasts only until that launch capability is revoked; it is not a
global policy. Save is shown as a separate mutating action in the audit even when covered by the
same task-level grant.

Harness-side approval remains useful but is not authoritative for Invar. Invar owns the command and
therefore owns the final consent decision. Headless use has no hidden auto-allow path: unresolved
mutation consent denies with a structured error.

## Lifecycle and failure behavior

### Invar exits or closes the workspace

1. Stop accepting new calls for the affected capability.
2. Cancel queued and cancellable in-flight reads.
3. Let an edit that already crossed the atomic editor command boundary finish; never leave half an
   edit applied.
4. Close the HTTP/SSE connection and revoke all launch tokens.
5. The harness remains an ordinary child task until its own task lifecycle stops it, but its Invar
   tools report a disconnected server.

The old configuration must never reconnect to another Invar process after restart. A fresh Invar
process has a new port, application identity, workspace identity, and token. Recovery is an explicit
new task launch or future launcher-mediated reconnect, not a well-known-path fallback.

### The harness exits or disconnects

1. Revoke its launch capability when the owned task process exits.
2. Remove its visible presence and cancel queued work.
3. Resolve any pending consent as denied.
4. Preserve completed edits as ordinary attributed undo entries; do not roll back user-visible work
   merely because the caller missed the response.
5. Remove launch configuration and secrets after the process is reaped.

A transient HTTP disconnect while the task remains alive may reconnect only with the same unexpired
launch token. Server-side state is reconstructed from the token record, not from "current
workspace." Repeated failure becomes a visible disconnected status; it never searches for another
instance.

### Concurrent callers

Reads may run concurrently when they do not force document-scale materialization. Visible
navigation is serialized on Invar's input/model loop. Content mutations are serialized per document
and guarded by revision. No call waits on a fixed delay; cancellation, connection, consent, and
revision are observed conditions.

## Pair with #46 (TerminalObserver reverse presence)

`#46 (TerminalObserver reverse presence)` and external editor control are the two directions of one
authenticated harness session:

```text
harness -> MCP tools -> Invar editor commands
harness <- MCP resource/tool <- TerminalObserver's bounded redacted events
```

They should share transport, application/workspace/launch identity, authentication, lifecycle,
presence, consent audit, and runtime configuration. They should not share payload authority:
`TerminalObserver` remains a read-only parsed-emulator observer with no PTY write capability, while
editor mutation remains behind editor commands and consent.

Waves 3-4 of `#46 (TerminalObserver reverse presence)` should therefore publish the existing bounded,
redacted observation ring through this MCP server rather than build a second agent port:

- `invar_list_terminal_observations(afterCursor?, limit?)` is the portable pull floor;
- an MCP resource exposes the same snapshot;
- `notifications/resources/updated` is an optional latency accelerator when a client supports it.

An MCP notification is not assumed to wake every harness's agent loop. Claude channels or any
harness-specific wake feature may accelerate delivery only after a capability probe; the pull
surface remains correct without it. This keeps TerminalObserver's redaction and bounds as the one
generator and avoids four wake-policy bridges.

## Build plan

Each wave leaves a useful, gateable state. Implementation starts only after
`#156 (tasks capability)` lands and the user resolves the mutation-surface decision before Wave 4.

### Wave 1 — protocol, identity, and read-only context

- Create the contract-governed MCP domain and Streamable HTTP listener.
- Implement loopback bind, Origin validation, bearer records, per-launch revocation, body/result
  bounds, and `invar_get_context`.
- Use a generic MCP client and two simultaneously driven Invar processes opening the same workspace
  path. Prove each token reaches only its origin instance and cross-use fails.
- Positive control: deliberately swap the two token records and require the identity smoke to fail.

Gate: unit protocol/security tests, PTY-driven two-instance identity smoke, invariant checker, and
conventions gate.

### Wave 2 — four-harness launcher matrix

- Adapt the single `#156 (tasks capability)` env/argv contribution for Claude, Codex, Pi, and Hermes.
- Generate private runtime files and cleanup ownership.
- Bundle and capability-probe Pi's pinned MCP adapter.
- Implement Hermes's parsed launch-home overlay without mutating the base profile.
- Test all four adapter outputs against fixtures and use fake harness executables that capture exact
  argv/env before connecting as real MCP clients.
- Release qualification runs one real installed version of each harness; task launch fails visibly
  when its required interface is absent.

Gate: the matrix is one gate. Claude-only success is not Wave 2 completion.

### Wave 3 — read, navigation, find, and diagnostics

- Add the proposed non-content tools through existing editor/search/diagnostic seams.
- Make ranges, revisions, truncation, pagination, and coordinate encoding explicit.
- Add presence and per-call attribution.
- Drive default settings on shared small and large fixtures; reads and find must preserve scale
  parity and bounded output.

Gate: tool units plus one harness-neutral driven contract exercised through every generated adapter.

### Wave 4 — user-selected mutation surface

- Implement only the option the user selected.
- For the recommended surface: atomic revision-checked edits, retry deduplication, undo attribution,
  save, permission overlay, and headless deny.
- Drive user edit versus harness edit races and two harnesses editing one document.
- Positive controls must demonstrate a stale revision, denied consent, and duplicate operation would
  fail without their guards.

Gate: mutation/undo/consent units, small-and-large driven edits, all four adapter paths, invariant
checker, and conventions gate.

### Wave 5 — TerminalObserver reverse direction

- Publish `#46 (TerminalObserver reverse presence)` through the same session as bounded pull and
  resource surfaces.
- Keep its single redactor and no-write contract.
- Add optional resource-update notification only as an accelerator.

Gate: recorded terminal fixture through observer to MCP client, with redaction, byte/ring bounds,
cursor resumption, dropped-notification pull recovery, and no PTY write authority.

### Wave 6 — lifecycle and compatibility hardening

- Kill Invar during read, pending consent, and atomic edit.
- Kill each harness during the same states.
- Restart Invar and prove old credentials cannot attach.
- Open the same path in multiple windows and run multiple tasks in each.
- Exercise capability-probe failures for all four harness adapters.

Gate: failure-injection smoke and one final full verification pass. Do not substitute widened
timeouts for lifecycle conditions.

## Design impossibilities

If this design is implemented faithfully, none of the following can occur:

- a task launched by Invar window A silently controls window B;
- two windows opening the same path share or overwrite discovery state;
- an ambient per-user MCP entry determines which Invar instance receives a call;
- a bearer token from one task selects another workspace;
- a remote edit appears without harness/task attribution and an undo entry;
- a stale edit silently overwrites a newer user edit;
- Invar restart causes an old harness to attach to the new process;
- TerminalObserver gains PTY write authority in order to deliver observations;
- one harness receives a bespoke editor protocol that the other three do not.

## Capability sources checked 2026-07-27

- [MCP Streamable HTTP transport and local-server security](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Claude Code MCP configuration, `--mcp-config`, HTTP, and environment expansion](https://code.claude.com/docs/en/mcp)
- [Codex MCP/config reference](https://learn.chatgpt.com/docs/extend/mcp)
- [Pi settings and extension loading](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)
- [Pi MCP adapter configuration](https://pi.dev/packages/pi-mcp-adapter)
- [Hermes MCP configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/mcp-config-reference.md)
- [Hermes configuration and `HERMES_HOME` profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles/)

