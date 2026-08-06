# Invar channel protocol 1.0

`iv ssh` carries one terminal PTY and one private channel through one OpenSSH
connection. The PTY carries only terminal bytes. The private channel carries
framed RPC messages. A channel message must never enter the terminal byte
stream.

## Transport

`iv ssh` starts an OpenSSH control master. It then opens two sessions through
that master. One session runs remote Invar in a PTY. One session runs
`iv --channel-server` without a PTY. The second exec session is the protocol
transport.

An SSH subsystem would require an sshd configuration change on each host. A
port forward would create a listening socket and a second authentication
boundary. A second exec session works with a stock SSH server, stays inside
the authenticated connection, and lets OpenSSH provide flow control. These
properties make the second exec session the selected transport.

## Frame

Each frame has a 16-byte network-byte-order prefix, a UTF-8 JSON header, and
an optional binary body.

| Offset | Size | Value |
| --- | ---: | --- |
| 0 | 4 | ASCII `IVCH` |
| 4 | 1 | major version |
| 5 | 1 | minor version |
| 6 | 1 | frame kind |
| 7 | 1 | flags; zero in 1.0 |
| 8 | 4 | JSON header byte count |
| 12 | 4 | body byte count |

Version 1.0 limits a JSON header to 65,536 bytes and a frame body to
1,048,576 bytes. A peer closes the channel after a bad magic value, an
unsupported flag, invalid UTF-8 or JSON, or a larger declared length. Frame
boundaries do not depend on read boundaries. Empty and partial reads have no
protocol meaning.

Frame kinds are:

| Code | Name | Required header fields |
| ---: | --- | --- |
| 1 | `hello` | `versions`, `capabilities` |
| 2 | `welcome` | `version`, `capabilities` |
| 3 | `request` | `requestId`, `method`, `parameters` |
| 4 | `response` | `requestId`, `result` or `error` |
| 5 | `stream-open` | `requestId`, `streamId`, `contentLength` |
| 6 | `stream-data` | `streamId`; bytes are in the body |
| 7 | `stream-end` | `streamId`, `sha256` |
| 8 | `cancel` | `requestId`, `reason` |

Identifiers are non-empty UTF-8 strings. An identifier is unique among live
requests or streams in its direction. Either peer can send requests. A
response closes its request. `stream-open` attaches a stream to a live
request. Stream data stays ordered by frame order. `stream-end` closes the
stream. `cancel` closes the request and all of its streams. Unknown header
fields are ignored.

## Negotiation

The client sends `hello` first. `versions` is an ordered list such as
`["1.0"]`. The server selects one offered version and answers `welcome`.
Neither peer can send another frame before `welcome`. If there is no common
major version, the server sends an `UNSUPPORTED_VERSION` response with
request ID `negotiation` and closes the channel. A peer can accept a newer
minor version only when it accepts all frames and required fields from that
minor version.

The capability list contains exact method names or namespace wildcards.
Version 1 reserves `drop.*`, `dialog.*`, `fs.*`, and `pty.*`. Version 1.0
implements `drop.upload` on the server and `dialog.request` on the client. A
request for an unadvertised method fails with `METHOD_NOT_FOUND`.

## Requests and errors

`drop.upload` parameters are `name`, `size`, and `streamId`. The named stream
contains the file bytes. A successful response returns `path`, `size`, and
`sha256`. The server stores the file at
`~/.cache/invar/dropzone/<sha256>-<safe-name>`. It removes entries older than
24 hours and then removes the oldest entries until the directory is at most
1 GiB. A single file larger than the cap is rejected.

`dialog.request` has no parameters in version 1.0. The client opens its native
file picker. A cancelled picker returns `path: null`. A selected local file is
uploaded through `drop.upload`, and the response returns the resulting remote
dropzone `path`. The server passes that path to Invar through the private
session socket named by `INVAR_CHANNEL_SOCKET`. The local source path never
enters the interactive PTY or the remote process.

An error is an object with `code`, `message`, and optional `data`. Codes in
1.0 are `BAD_REQUEST`, `METHOD_NOT_FOUND`, `UNSUPPORTED_VERSION`,
`STREAM_MISMATCH`, `HASH_MISMATCH`, `SIZE_LIMIT`, `CANCELLED`, and
`INTERNAL`. The message is safe to show to a person. `data` must not contain
file bytes, credentials, or environment values. A request error closes only
that request. A framing or negotiation error closes the channel.

## Terminal fidelity

The wrapper forwards every non-intercepted input byte to the interactive SSH
PTY in order. It forwards every SSH PTY output byte to local stdout in order.
It copies the local terminal size to the SSH PTY at start and on every
`SIGWINCH`. It restores the local terminal mode and exits with the
interactive SSH session's exit code.

The only input interception is a complete bracketed paste whose payload
names existing local regular files. The wrapper does not forward that local
payload. It uploads each file, then sends one bracketed paste containing
private `invar-drop:v1:<base64url-path>` notifications through the same
interactive PTY input seam. Remote Invar accepts a notification only when
the decoded path is a content-addressed regular file inside its configured
dropzone. Partial markers, ordinary pastes, key bytes, OSC 52, and all output
controls pass unchanged.

## Inversion constraint

The protocol must not require Invar to run on the remote host. A later mode
can run Invar locally and expose remote `fs.*`, `pty.*`, git, and language
capabilities as RPC providers. Requests are bidirectional, capability names
do not encode which peer owns them, and streams attach to requests in either
direction. This is the VS-Code-server inversion door. Version 1 reserves it;
version 1 does not implement it.
