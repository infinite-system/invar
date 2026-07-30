# Invarnet peer-to-peer streaming underlay map

This map answers the [filed task](task-327-invarnet-p2p-streaming-underlay-research.md).
It is research only. It does not propose product code or a dependency.

## Executive verdict

The four candidate invariants do not generate a safe underlay.
They need one more generator:

> Every accepted fragment proves membership in the authenticated stream.

This fifth invariant rejects pollution. It generates content identifiers,
publisher authority, fragment authentication, and verification before
redistribution. The original four invariants cannot distinguish an authentic
fragment from a poisoned one.

The original invariants also need narrower language:

1. A node offers only measured slack above a protected local floor. Participation
   cannot leave the whole performance envelope unchanged because every useful
   transfer consumes nonzero resources.
2. An eligible consumer offers measured slack. A zero-upload path, an exhausted
   battery, a restrictive NAT, or a non-Invar client can consume without
   contributing.
3. A relay cannot decode payload fragments. This is a confidentiality property,
   not legal deniability.
4. No fixed machine is required after enough replicas exist. A publisher key,
   first source, bootstrap address, or temporary relay can still have a
   distinguished role. Roles must migrate; authority can belong to a key instead
   of a host.

The smallest honest first rung is three local Invar processes. One process
publishes authenticated encrypted windows. A second process receives them. A
third process receives most bytes from the second process while the publisher
serves a measured minority. This proves redistribution. It does not prove
Internet reachability, million-viewer scale, or server independence.

If the user chooses to continue, the best first design is a hybrid:

- authenticated encrypt-then-stripe windows;
- short-window erasure repair;
- a local slack envelope with immediate backoff;
- priority for peers that recently delivered useful verified bytes;
- a small, fixed altruistic pool for unproven consumers;
- replicated discovery and relay choices, with an origin fallback.

Do not start with a global credit ledger. A global identity or credit system
creates an authority problem before it creates transfer capacity.

## Terms and physical floor

Let:

- `r` be the encoded stream rate;
- `N` be the number of simultaneous viewers;
- `O` be useful origin upload;
- `u[p]` be useful upload offered by peer `p`;
- `h` be protocol, repair, and duplicate overhead.

An origin-only service sends about `N × r`. A 5 Mbit/s stream for 1,000,000
viewers needs 5 Tbit/s of origin egress.

A steady swarm must satisfy this conservation rule:

`O + sum(u[p]) >= N × r × (1 + h)`

No topology, coding scheme, or incentive removes this rule. If average useful
peer upload stays below the stream rate, an origin or donor tier supplies the
deficit. Coding changes which bytes peers need. It does not create bandwidth.
This is an arithmetic inference from flow conservation.

This map uses these invariant labels:

- **E — protected envelope:** participation uses only measured local slack.
- **C — eligible consumption contributes:** an eligible viewer offers useful
  capacity within that envelope.
- **F — fragment confidentiality:** a relay cannot decode an isolated fragment.
- **N — no fixed machine:** every machine role can migrate after replication.
- **A — authenticated membership:** every accepted fragment proves that it
  belongs to the selected stream.

## IBR reduction test

### The four candidates

| Candidate | What it generates | Break test | Verdict |
|---|---|---|---|
| Envelope invariance | Local caps, automatic backoff, manual limits, and saturation that reduces service before node health | Give the node no bandwidth, CPU, memory, energy, or foreground slack. A literal unchanged envelope allows no useful transfer. | Load-bearing after refinement to a protected floor and offered slack. |
| Consumption implies contribution | Demand can add supply. Recent useful upload can influence scheduling. | Put a viewer behind a restrictive NAT, on a depleted battery, or in a browser that cannot accept inbound connections. It still consumes. | Load-bearing only for eligible peers. It is a preference and admission rule, not a universal physical fact. |
| Fragments inert in isolation | Encrypt before distribution. Bound decoder state to a playback window. Cache ciphertext at untrusted relays. | Inject random or adversarial fragments. Confidentiality says nothing about stream membership. | Load-bearing for relay confidentiality, but insufficient for integrity and pollution resistance. |
| No distinguished node | Replicated discovery, migratable relay and scheduling roles, and recovery after ordinary departures | Start a never-seen stream with no source, address, trust root, or prior peer. A node cannot discover information from nothing. | Load-bearing after refinement. It cannot remove initial publication, trust, or bootstrap facts. |

### The missing generator

**A — authenticated membership** is independent of the four candidates.

Two networks can satisfy E, C, F, and N while one redistributes authentic
ciphertext and the other redistributes attacker-generated ciphertext. The
candidate set cannot distinguish them. A causes these design consequences:

- stable stream and window identifiers;
- a publisher authentication rule;
- a hash, Merkle proof, signature, or authenticated-encryption tag for accepted
  data;
- verification before a peer earns contribution credit;
- rejection before bad data is cached or forwarded.

PPSPP independently shows that live peer-to-peer delivery needs content
integrity. Its Internet live-streaming mode requires the Unified Merkle Tree
integrity scheme, and its source signs live content
([RFC 7574, sections 4.7 and 5.4](https://www.rfc-editor.org/rfc/rfc7574.html)).

### Impossibility-set verdict

| Proposed impossibility | Result |
|---|---|
| The network never demands; it only accepts offered slack. | Keep. A node can always reduce its offer to zero. The service may then fail. |
| The network never promises delivery. | Keep. Delivery remains best effort unless an external service makes a capacity promise. |
| Saturation degrades service, never nodes. | Keep as a local safety goal. Enforce it with a protected floor and immediate backoff. No distributed protocol can prove that a human never notices strain. |
| No fragment incriminates its relay. | Reject. Encryption can stop a relay from decoding payload. A fragment, address, timing record, or content identifier can still show participation. Legal responsibility depends on facts and jurisdiction. |

The reduction therefore **needs a fifth invariant**. Three original invariants
remain load-bearing after refinement. F remains useful, but it does not generate
the claimed deniability or integrity.

## Arm 1 — fan-out prior art

### BitTorrent

BitTorrent divides files into hashed pieces. A peer requests the rarest pieces
first. It normally uploads to the four peers that currently return the best
download rates and reserves an optimistic unchoke for discovery. The reference
protocol rotates ordinary choke decisions every 10 seconds and the optimistic
unchoke every 30 seconds
([BitTorrent protocol specification](https://www.bittorrent.org/beps/bep_0003.html)).

This design partially proves **C**. Local reciprocation makes useful upload
improve service. It also proves **A** at piece granularity through publisher
piece hashes. It does not prove **E** because the protocol has no complete
bandwidth, CPU, energy, and foreground-load envelope. It violates **F** because
ordinary pieces are plaintext. Trackerless torrents reduce fixed discovery
infrastructure, but a publisher and initial seed remain distinguished during
cold start, so **N** holds only after replication.

BitTorrent scaled for popular static files because demand adds piece replicas
and rarest-first protects availability. A 2009 measurement covered 46,227
torrents and about 29 million unique peers
([Menascé and Rocha, “BitTorrent Availability and Sharing”](https://arxiv.org/abs/0912.0625)).
Free riding did not disappear. Experiments found that modified clients could
download without uploading, and BitTyrant showed that strategic allocation
could outperform the standard client
([Liogkas et al., BitTorrent free-riding study](https://irl.cs.ucla.edu/data/files/papers/Liogkas-BitTorrent06.pdf);
[Piatek et al., BitTyrant deployment study](https://www.usenix.org/legacy/event/nsdi07/tech/piatek/piatek_html/index.html)).
The system scaled without proving the strict form of C.

### WebTorrent

WebTorrent applies the torrent model to browser peers. Browser peers use WebRTC
and can connect only to WebRTC-capable peers. They use WebSocket trackers for
WebRTC signaling
([WebTorrent documentation](https://webtorrent.io/docs);
[WebTorrent FAQ](https://github.com/webtorrent/webtorrent/blob/master/docs/faq.md)).

It inherits BitTorrent’s partial **C** and hash-based **A**. It violates **F**.
It does not provide a full protected envelope, so it does not prove **E**. A
browser swarm also depends on signaling and usually a WebSocket tracker, so it
does not prove **N**. WebTorrent proves browser deployability. It does not
provide cited million-viewer live-stream evidence.

### PeerTube peer-assisted playback

PeerTube combines normal HTTP delivery with browser peer assistance. Its
privacy guide states that peers share a watched video and that a tracker stores
their IP addresses and returns random peers
([PeerTube privacy guide](https://docs.joinpeertube.org/admin/privacy-guide)).
Its architecture keeps the publishing server and browser roles distinct
([PeerTube architecture](https://docs.joinpeertube.org/contribute/architecture)).

PeerTube partially proves **C** when peer assistance is active. HTTP fallback
and clients that do not upload break strict C by design. It does not prove
**E**, **F**, or **N**. The origin instance and tracker remain required roles.
The hybrid path is a useful survival property: a sparse swarm can still play.
No cited PeerTube source supplies a million-viewer deployment result. Treat it
as product evidence for optional peer assistance, not as scale proof.

### IPFS, Bitswap, and Gossipsub

IPFS names content with content identifiers. Bitswap asks connected peers for
blocks and can use the DHT when peers do not have the requested root
([IPFS Bitswap concept](https://docs.ipfs.tech/concepts/bitswap/);
[IPFS content model](https://docs.ipfs.tech/concepts/how-ipfs-works/)).
Gossipsub maintains a bounded gossip mesh and scores peers. Its specification
recommends well-known stable bootstrap nodes for bootstrapping
([Gossipsub v1.1 specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md)).

Content identifiers strongly support **A**. DHT and gossip make roles
replicable and support the refined **N**, but bootstrap, relay, and provider
availability still matter. Bitswap does not enforce strict payment, so it does
not prove **C**. Neither subsystem supplies a whole-node **E** policy.
Plaintext content-addressed blocks violate **F**. Gossipsub distributes
messages; it is not a media byte scheduler. Bitswap fetches blocks; it is not a
deadline-aware live-stream protocol. Combining their names does not fill those
missing generators.

### WebRTC mesh, forwarding, and trees

WebRTC does not define signaling. Applications exchange offers and ICE
candidates through another channel. STUN discovers paths and TURN relays data
when direct paths fail
([WebRTC peer-connection guide](https://webrtc.org/getting-started/peer-connections);
[TURN, RFC 8656](https://www.rfc-editor.org/rfc/rfc8656.html)).

A full mesh gives each of `N` peers up to `N - 1` relationships and duplicate
outbound media. It breaks **E** as the group grows unless the application caps
degree. An SFU reduces client upload but creates a distinguished high-bandwidth
forwarder, so it violates **N**. RFC 7667 calls this role a selective forwarding
middlebox
([RTP topologies, RFC 7667](https://datatracker.ietf.org/doc/rfc7667/)).
A bounded tree limits each node to a fan-out, but a parent departure interrupts
all descendants until repair. A balanced tree with fan-out `f` has depth near
`ceil(log_f(N))`; this is a topology inference, not a WebRTC guarantee.

WebRTC transport can support **F** on each encrypted hop, but a forwarding
application that terminates encryption can decode. It does not by itself
generate end-to-end fragment confidentiality. WebRTC supplies transport
mechanisms. It does not supply E, C, N, or stream authenticity policy.

### Hybrid peer-to-peer and CDN systems

The strongest current deployment evidence in this survey is ByteDance’s Swarm
system. Its paper reports more than 100,000 peer servers, nearly 100 million
daily users, and six years of production use. The tracker maps clients to peer
servers, and CDN remains the fallback. Ten-second chunks and only 0.74% added
redundancy improved establishment speed by 23.93%
([ByteDance Swarm deployment paper](https://arxiv.org/abs/2401.15839)).

Swarm proves that a centrally coordinated hybrid can operate at very large
scale. It does not prove the target invariant set. Dedicated peer servers do
not make every viewer contribute, so **C** is not its generator. The tracker,
managed peer tier, and CDN violate **N**. The paper does not establish a
whole-node protected envelope or isolated-fragment confidentiality, so it does
not prove **E** or **F**. Its result is still decisive: fallback and central
placement solve cold-start and sparse-swarm failures in practice.

Microsoft eCDN uses WebRTC peer-to-peer delivery for HLS and DASH inside a
managed service
([Microsoft eCDN technical overview](https://learn.microsoft.com/en-us/ecdn/technical-documentation/technical-overview)).
Microsoft acquired Peer5 in 2021
([Microsoft acquisition history](https://www.microsoft.com/en-us/investor/acquisition-history)).
CDNBye, now branded SwarmCloud, describes the same peer-first and source-fallback
shape
([SwarmCloud overview](https://www.swarmcloud.net/guides/overview)).
These products prove the commercial value of hybrid assistance. Their service,
tracker, and source fallback violate **N**. Public product material does not
prove E, C, or F. Vendor scale claims without independent traffic data are not
used here.

### PPLive and CoolStreaming

A PPLive measurement observed more than 200,000 simultaneous users during one
event in 2006. Streams ran at 400–800 Kbit/s, for about 100 Gbit/s of aggregate
traffic. The study also found long playback lag, peer churn, and heterogeneous
peer capacity
([Hei et al., PPLive measurement](https://cse.engineering.nyu.edu/~ross/papers/P2PliveStreamingMeasurement.pdf)).

CoolStreaming used data-driven mesh pull. Its deployment observed more than
30,000 distinct users and more than 4,000 simultaneous users at 450–755 Kbit/s.
The authors estimated that origin-only delivery would have needed about
3 Gbit/s
([Zhang et al., CoolStreaming/DONet](https://www.cs.sfu.ca/~jcliu/Papers/47_01.pdf)).

These systems prove that viewer demand can add substantial delivery capacity,
which supports **C**. They do not establish protected local envelopes,
fragment confidentiality, authenticated membership, or server independence.
Their cited measurements do not show collapse. They show costs: startup lag,
buffering, churn repair, and dependence on sufficiently populated channels.
The systems are old and proprietary. This map does not infer present operation
or project failure from their age.

### SplitStream

SplitStream stripes a stream across a forest of interior-node-disjoint multicast
trees. This distributes forwarding load and lets nodes declare capacity. The
paper simulated 40,000 nodes. In a churn trace with 17,000 unique nodes and
1,300–2,700 active nodes, 99.5% of nodes received at least 75% of stripes for
almost all of their sessions. Its live PlanetLab experiment used 72 nodes at
320 Kbit/s. Ninety percent of packets arrived within one second, but 5% took
more than two seconds and the maximum delay was 11.7 seconds
([Castro et al., SplitStream](https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/splitstream.pdf)).

SplitStream supports **E** better than an unconstrained mesh because forwarding
degree follows declared capacity. Forwarding also supports **C**. It violates
**F**. Pastry/Scribe rendezvous and the stream source mean it proves only the
refined form of **N**. It is strong research evidence for capacity-aware trees,
not a million-user production result. Tree repair latency is the failure mode
under churn.

### PPSPP

PPSPP is a peer-to-peer streaming protocol for live and on-demand content. It
keeps small per-peer state, supports central tracker or DHT discovery, requires
LEDBAT congestion control over UDP, and defines Merkle-based content integrity
([PPSPP, RFC 7574](https://www.rfc-editor.org/rfc/rfc7574.html)).

LEDBAT makes PPSPP relevant to **E**. It tries to use available bandwidth while
adding limited queue delay and yielding to competing TCP traffic
([LEDBAT, RFC 6817](https://datatracker.ietf.org/doc/html/rfc6817)).
PPSPP supports **A**. It does not require strict reciprocity, so it does not
prove **C**. Its chunks are not confidential, so it violates **F**. DHT
discovery supports refined **N**, but a live injector and its signing authority
remain distinguished at publication time. PPSPP is a protocol specification,
not cited evidence of million-viewer deployment.

### Prior-art synthesis

No surveyed system satisfies E, C, F, N, and A.

- BitTorrent and the early live mesh systems show that popular demand can add
  supply. They do not remove free riding or protect a complete local envelope.
- SplitStream shows how declared capacity can shape a tree. Churn moves the
  cost into repair and playback delay.
- PPSPP combines streaming, congestion backoff, and content integrity. It does
  not add secrecy or compulsory contribution.
- ByteDance shows the largest cited production result. Central placement,
  tracking, and fallback are the reason it can manage cold start and sparse
  demand.
- Browser systems improve installation reach. They retain signaling and relay
  dependencies.

The evidence supports a hybrid first. It does not support a claim that one
unassisted machine can feed millions.

## Arm 2 — capped redistribution

### Enforce the cap locally

Each node owns its offer. Remote peers cannot raise it.

For each short control interval, compute:

`offer = min(userCeiling, linkSlack, cpuSlack, energySlack, memorySlack)`

Then subtract active foreground reservations. Clamp the result at zero. Apply a
token bucket to byte egress and a separate cap to concurrent encoding, hashing,
or coding work. Use congestion feedback inside the byte cap. Stop new work
before pre-empting active foreground work.

This is a proposed design, not an existing Invar behavior.

Useful sensors are:

- recent useful-upload throughput;
- round-trip time, loss, and queue-delay trend;
- configured uplink ceiling and observed upstream asymmetry;
- CPU saturation and event-loop delay;
- battery level, charging state, and thermal pressure when available;
- foreground or idle state;
- memory used by active stream windows;
- peer count, churn, playback deadlines, and repair demand.

LEDBAT is prior art for network backoff. It targets available bandwidth and low
added queue delay, but it does not sense CPU, battery, or foreground work
([RFC 6817](https://datatracker.ietf.org/doc/html/rfc6817)).
The other sensors are a design inference from the protected-floor goal.

### Modes

**Automatic** is the default. It samples local slack, uses a conservative
ceiling, and decays its offer quickly when foreground load or queue delay rises.
It increases slowly after sustained slack.

**Preset** gives named bounds, such as paused, battery saver, balanced, and
donor. A preset changes ceilings. It does not bypass safety floors.

**Manual** lets the user set maximum upload rate, CPU share, battery rule,
active hours, and storage. A manual maximum is still a maximum. The runtime can
back off below it.

Every transition must expose why the offer changed. Examples are “foreground
load,” “queue delay,” “battery,” and “manual ceiling.” Otherwise users cannot
tell safety from failure.

### Critical swarm properties

| Property | Why it matters | Required response |
|---|---|---|
| Upstream asymmetry | The conservation rule can fail even when every viewer participates. | Admit lower rates, use donor capacity, or degrade service. Never manufacture credit for unavailable upload. |
| Churn | Parent or rare-fragment departures cause repair traffic and missed deadlines. PPLive and SplitStream both measured visible churn costs. | Keep more than one supplier per live window. Bound repair by the same local offer. |
| Swarm size | Small swarms lack replicas; very large meshes create connection and scheduling cost. | Use source fallback when sparse and bounded neighbor sets when large. |
| Fragment rarity | A deadline can make one missing fragment block a window. BitTorrent uses rarest-first for file availability. | Schedule by deadline and recoverability. With coding, request innovative symbols or rank deficit instead of an exact rare piece. |
| Playback deadline | A byte that arrives after its window is not useful live-stream capacity. | Credit only verified bytes that arrive in time. Prefer near-playhead windows. |
| NAT and relay state | A willing peer can still be unable to accept a direct connection. | Separate willingness from usable reachability. Charge relay traffic to the party that funds it. |

### Incentive choices

| Model | Benefit | Failure | Recommendation |
|---|---|---|---|
| Strict tit-for-tat | Uses recent observable behavior and no global identity. | Streaming peers need different fragments at different times. A peer may upload to the swarm but not to its current supplier. Free-riding clients can exploit discovery and timing. | Use only as a scheduling signal. |
| Global credit | Moves value across sessions and swarms. | It needs durable identity, accounting consensus, or a trusted issuer. Douceur shows that a peer system without a logically centralized authority cannot generally prevent Sybil identities unless it makes strong resource assumptions ([Douceur, “The Sybil Attack”](https://www.microsoft.com/en-us/research/publication/the-sybil-attack/)). | Do not build first. It conflicts with the simplest form of N. |
| Allocation pool | Lets a user or group assign a transferable budget. | Tokens need issuance, double-spend control, and revocation. These recreate authority or consensus. | Consider only after a trust model exists. |
| Local recent-contribution priority | Needs no persistent identity. It measures accepted authenticated bytes in the current session or short epoch. | A new peer has no history. NAT-limited peers may be willing but unable. | Use first, with a bounded newcomer pool. |
| Fixed altruistic cap | Gives non-Invar clients a welcome path and helps cold start. | Too large a pool invites free riding; too small a pool prevents onboarding. | Reserve a small local fraction and shed it first at saturation. |

A 2014 survey concluded that BitTorrent tit-for-tat does not directly fit
streaming and that deployed peer-to-peer streaming systems generally lacked
effective incentive mechanisms
([Seibert et al., free riding in P2P streaming](https://scholarworks.sjsu.edu/computer_eng_pub/18/)).
This supports local, modest claims. The first prototype should not claim to
solve long-term economic fairness.

### Non-Invar consumers

Do not classify a peer by its handshake string. A client can lie.

Classify it from current behavior:

1. An **unproven consumer** has not delivered useful, timely, authenticated
   bytes during the current short epoch.
2. A **contributor** has delivered such bytes. Only accepted data earns
   priority.
3. A peer loses recent status as its evidence expires.

Each contributing node funds its own altruistic pool from its offered cap. A
recommended starting policy is a configurable fraction, not a fixed universal
number. The three-process experiment must measure values before a default can
be justified.

BitTorrent’s optimistic unchoke is prior art for bounded service to an unproven
peer
([BitTorrent protocol specification](https://www.bittorrent.org/beps/bep_0003.html)).
At saturation:

1. stop speculative repair outside active windows;
2. reduce unproven-consumer service;
3. preserve useful recent contributors while their deadlines remain feasible;
4. reduce bitrate or refuse new playback;
5. never exceed any node’s protected floor.

“Contributors never degrade” is impossible when aggregate capacity falls below
demand. They receive priority, not a delivery promise.

A non-Invar client becomes a contributor by speaking the authenticated transfer
protocol and delivering one useful fragment. Installing Invar can provide that
capability. It must not grant inherited credit. Inherited credit would create a
Sybil gift.

### General content

The underlay should move immutable authenticated windows or chunks. Video is
the hardest first workload because bytes have deadlines. Static files, pane
snapshots, model artifacts, and ledger records can use longer windows and
weaker deadlines. Content type does not change E, C, N, or A. F is optional for
public plaintext content, but the first protocol should keep encryption policy
above transfer mechanics.

Adding a peer adds capacity only when that peer has useful offered upload and
reachable recipients. “Hyper deployability” therefore means monotonic offered
capacity, not monotonic delivered capacity. NAT, locality, duplication, and
deadline misses can make added capacity unusable.

## Arm 3 — secure interleaving

### Construction comparison

| Construction | Exact guarantee | Overhead and latency | Churn and repair | Verdict |
|---|---|---|---|---|
| Reed–Solomon erasure code | Any sufficient set of encoded symbols repairs erasures. The systematic form sends the original source symbols unchanged. It gives no secrecy ([RFC 5510](https://www.rfc-editor.org/rfc/rfc5510.html)). | Choose `n - k` repair symbols for `k` source symbols. Decode waits for `k` suitable symbols in one window. | Deterministic repair helps when known symbols disappear. Repair bytes still consume the offer. | Good short-window repair after encryption. |
| LT or RaptorQ fountain code | A receiver reconstructs a source block from enough encoding symbols. RaptorQ is systematic and supports independent source blocks of up to 56,403 source symbols ([LT paper](https://pages.cs.wisc.edu/~suman/courses/740/papers/luby02lt.pdf); [RaptorQ, RFC 6330](https://www.rfc-editor.org/rfc/rfc6330.html)). It gives no secrecy. | Rateless repair avoids choosing an exact loss count. A window cannot play until its source block decodes. | Peers can create or relay more symbols. Extra symbols cover departures without exact-piece lookup. | Strong fit for uncertain loss after encryption. Implementation cost is higher than fixed erasure coding. |
| Shamir secret sharing | Fewer than `k` shares reveal no information; any `k` reconstruct. Each share is the size of the secret in the basic scheme ([Shamir, “How to Share a Secret”](https://doi.org/10.1145/359168.359176)). | Whole-object sharing costs about `n` times the secret size, before transport overhead. Windowing bounds latency but retains expansion. | Any `k` shares work. Repairing shares requires reconstructed data or a more complex proactive scheme. | Exact threshold secrecy, but too expensive for the default media path. |
| Random linear network coding | Enough independent equations recover a generation. Below full rank, a receiver still learns linear combinations. Ordinary coding is not confidentiality ([Katti et al., “XORs in the Air” security discussion and related secure-coding construction](https://arxiv.org/abs/0705.1789); [Vilela et al., lightweight secure network coding](https://arxiv.org/abs/0807.0610)). | Coefficients, finite-field work, and generation buffers add cost. Short generations bound live latency. | Any innovative symbol raises rank, which reduces exact-piece coordination. Pollution can spread through recoding unless authentication covers combinations. | Useful research path for decentralized repair. Reject the claim that all sub-rank data is useless. Encrypt and authenticate. |
| All-or-nothing transform | A receiver needs all transform blocks before recovering any message block. It is computational, not information-theoretic secrecy, and it is a pre-processing step rather than authenticated encryption ([Rivest, AONT package transform](https://people.csail.mit.edu/rivest/pubs/Riv97d.pdf)). | Near one-block expansion in the package transform, but loss of any required block stalls the window. | It fights erasure tolerance unless followed by repair coding. Churn turns a missing block into a deadline failure. | Poor default for loss-prone live media. |
| Encrypt then stripe | Authenticated encryption gives confidentiality and integrity to ciphertext. Striping only disperses it. | One authentication tag and framing per bounded window, plus the selected repair ratio. The endpoint must receive enough ciphertext for that window. | Repair operates on ciphertext. A peer never needs the media key to cache or relay. | Simplest honest first construction. |

Forward-error-correction traffic still needs congestion control. Repair traffic
cannot sit outside E
([RFC 9265, FEC congestion-control considerations](https://www.rfc-editor.org/rfc/rfc9265.html)).

### Recommended secure window

For each short playback window:

1. bind stream identifier, window number, codec metadata, and length as
   authenticated associated data;
2. encrypt the media window with authenticated encryption;
3. erasure-code the ciphertext into authenticated fragments;
4. authenticate the fragment index and coding parameters under the stream
   manifest;
5. let relays verify A without receiving the media decryption key;
6. decode and decrypt only at an authorized endpoint;
7. discard repair state after the playback and repair horizon.

This ordering separates properties:

- encryption protects content from relays;
- authenticated encryption protects the recovered ciphertext and metadata;
- signed or hashed fragment membership stops pollution before redistribution;
- erasure coding gives loss tolerance;
- windowing bounds latency and memory.

The stream key remains an authorization problem. A public stream can publish
the key. A private stream needs an access-control or group-key system. This map
does not choose one.

### Rarity after coding

Fixed pieces need rarest-first selection because one missing rare piece can
block completion. Fountain and linear codes change the question. A receiver
asks for a symbol that adds rank, not one exact piece. This dissolves exact
piece rarity inside one coding window.

It does not dissolve:

- a rare whole window near the playhead;
- a rare publisher manifest or key;
- suppliers that are unreachable before the deadline;
- correlated loss when all peers obtained the same small subset;
- insufficient aggregate upload.

Scheduling must therefore combine playhead deadline, window availability, rank
deficit, supplier diversity, and the local offer.

### Relay guarantee and legal boundary

The technical guarantee can be:

> A relay without the endpoint key cannot recover media plaintext from the
> fragments it stores or forwards, except for public metadata and permitted
> leakage such as sizes and timing.

Do not promise that a fragment cannot identify or incriminate a relay.
United States safe-harbor conditions for transient digital network
communications depend on facts such as user direction, automatic transmission,
recipient selection, transient storage, and no content modification
([17 U.S.C. § 512(a)](https://uscode.house.gov/view.xhtml?edition=2023&num=0&req=granuleid%3AUSC-2023-title17-section512)).
The European Union Digital Services Act sets separate “mere conduit”
conditions and does not turn encryption into a universal exemption
([Regulation (EU) 2022/2065, Article 4](https://eur-lex.europa.eu/eli/reg/2022/2065/oj?eliuri=eli%3Areg%3A2022%3A2065%3Aoj&locale=en)).
United States reporting law can attach to actual knowledge while stating that
providers need not monitor or affirmatively search
([18 U.S.C. § 2258A](https://www.law.cornell.edu/uscode/text/18/2258A)).

These citations show that legal treatment depends on service conduct and
knowledge. They do not give legal advice. Obtain jurisdiction-specific counsel
before an Internet deployment.

## Arm 4 — server independence

### Remaining roles

| Role | Central form | Replicated alternative | Honest residue |
|---|---|---|---|
| Initial discovery | HTTP or WebSocket tracker | Kademlia DHT, gossip through known peers, federated rendezvous | A new node still needs at least one address, DNS name, package seed list, or local peer. Zero-knowledge bootstrap is impossible. |
| Local discovery | Configured server | mDNS | mDNS is local-link multicast only ([mDNS, RFC 6762](https://www.rfc-editor.org/info/rfc6762/)). It does not discover Internet peers. |
| Browser signaling | WebSocket signaling server | Signaling messages over an existing relay or overlay | The first browser connection still needs a reachable introduction path. |
| NAT traversal | STUN plus direct ICE path | Many STUN nodes and decentralized candidate exchange | Some paths remain non-traversable. |
| Relay | TURN, SFU, CDN, or managed libp2p relay | Multiple replaceable relays with local choice | A relayed byte consumes relay ingress and egress. Somebody funds that capacity. |
| Stream authority | Origin host | Publisher key with many mirrors | The key remains authoritative even when no host is fixed. Key compromise and revocation remain open. |
| Live production | One source | Redundant authenticated ingest or source handoff | A unique camera or encoder is a physical distinguished source until another source exists. |
| Trust roots | Certificate authority or service account | Pinned publisher keys, self-certifying peer identifiers, or replicated transparency | Software distribution and first trust still have roots. |

libp2p rendezvous is federated, not decentralized. Any node can run a rendezvous
point, but a selected point remains a single service until clients know another
one
([libp2p rendezvous documentation](https://libp2p.io/docs/rendezvous/)).
Kademlia distributes provider lookup. The libp2p specification recommends
`k = 20` and lookup concurrency `α = 10`
([libp2p Kademlia specification](https://github.com/libp2p/specs/blob/master/kad-dht/README.md)).
These mechanisms support migratable roles. They do not erase bootstrap.

### NAT reality

There is no honest universal direct-connect percentage. It varies with
protocol, platform, NAT, firewall, address family, and deployment.

Two measured reference points show the range:

- Tailscale reported direct connectivity “well north of 90%” in its own typical
  managed deployment, with DERP relays as fallback
  ([Tailscale NAT-traversal report](https://tailscale.com/blog/nat-traversal-improvements-pt-1)).
  This is a product-specific result, not a browser-swarm guarantee.
- A 2026 IPFS DCUtR study analyzed 4.4 million attempts across more than 85,000
  networks in 167 countries. Conditional hole punching succeeded at
  `70% ± 7.1%`, while prerequisite relay reservation or public-address
  discovery failed for about 29% of attempts
  ([Henningsen et al., IPFS hole-punching measurement](https://arxiv.org/abs/2604.12484)).

The design must keep a relay path. A relay transfers each payload byte in and
out, so its network interface handles about two byte-directions per delivered
payload byte. This is an accounting inference. Encryption prevents payload
decoding but does not remove relay bandwidth cost.

Browser libp2p examples also use a relay for the initial handshake before a
direct WebRTC path
([js-libp2p browser pubsub example](https://github.com/libp2p/js-libp2p-example-browser-pubsub)).
WebRTC-Direct can reduce certificate and domain dependencies for browser-to-node
connections, but discovery and unreachable peers remain separate problems
([libp2p 2025 annual report](https://docs.libp2p.io/reports/annual-reports/2025/)).

### Independence ladder

Use precise claims:

1. **Origin offload:** peers reduce origin bytes. Central service remains.
2. **Replaceable coordination:** several tracker, rendezvous, and relay nodes
   can serve the same identifiers.
3. **Host independence after replication:** no fixed host is needed while
   enough authenticated replicas and bootstrap paths remain.
4. **Partition survival:** a connected partition with the manifest, key
   authorization, enough fragments, and enough upload continues.
5. **Cold-start independence:** impossible in the absolute form. A never-seen
   stream requires a first source and a discovery fact.

The target should claim rung 3, not absolute serverlessness.

## Arm 5 — fit with Invar

The [recorded north star](../../../../project.briefing.md) progresses through
presence, shared records, live or projected panes, and a fleet mesh. The
underlay belongs below projected panes and media transport. It is not the
ledger, pane protocol, or media decoder.

The existing research lanes give useful boundaries:

- [#324 (terminal 3D demo and video playback)](../../completed/324-terminal-3d-demo-and-video-playback/report-324-terminal-3d-demo-and-video-playback.md)
  makes media decoding removable and keeps exactly two reusable RGBA buffers.
  The underlay should provide ordered authenticated media bytes. It should not
  own decode buffers.
- [#325 (audio-video sync research)](../../completed/325-audio-video-sync-research/project-audio-video-sync-map.md)
  recommends an audio device clock and makes video read that clock. The
  underlay should report window availability and deadline misses. It should not
  become a third playback clock or frame queue.

The location-independent seam is an authenticated chunk exchange. A consumer
asks for a stream window by identifier and deadline. Providers return verified
fragments within their local offers. Discovery, direct transport, relay
transport, storage, and playback remain replaceable roles.

The smallest honest rung is:

1. one local publisher creates a finite synthetic byte stream;
2. two local peers discover it through an explicit fixture address;
3. the first peer receives and redistributes authenticated encrypted windows;
4. the second peer receives most useful bytes from the first;
5. the publisher remains available for manifest, repair, and fallback;
6. measured byte counters prove the path;
7. a forced cap change proves immediate local backoff.

This is below projected panes. It can later carry pane deltas, artifacts, or
media windows without changing the playback seams.

## Arm 6 — recommendation and phasing

### Ranked approaches

Scores are relative judgments from the evidence above. They are not benchmark
results.

| Rank | Approach | Independence | Scale evidence | Bun and TypeScript cost | Harness fit | Verdict |
|---|---|---|---|---|---|---|
| 1 | Hybrid authenticated chunk exchange over js-libp2p, with origin fallback and bounded relay | Medium. Roles can replicate, but bootstrap and fallback remain. | Strong family evidence from BitTorrent and ByteDance hybrid deployment. The exact proposed stack is unproven. | Medium. js-libp2p and Helia are TypeScript projects with modular transports and discovery ([js-libp2p configuration](https://github.com/libp2p/js-libp2p/blob/master/doc/CONFIGURATION.md); [Helia FAQ](https://github.com/ipfs/helia/wiki/FAQ)). Bun compatibility still needs a spike. | Strong. Local processes can expose exact byte flow. | Recommended research prototype if the user approves. |
| 2 | PPSPP-inspired bounded tree and mesh with encrypted coded windows | Medium to high after replication. | Strong protocol design and older SplitStream research; weak modern product evidence. | High. No selected native TypeScript PPSPP implementation. Congestion, integrity, and scheduling need integration. | Strong for local flow; weak for Internet NAT realism. | Keep as protocol reference. Do not implement first. |
| 3 | Browser HLS peer assistance with P2P Media Loader or WebTorrent | Low to medium. Browser signaling, origin, and relay remain. | Product evidence from PeerTube and managed eCDN; no cited target-scale independent system. | Medium in a browser. P2P Media Loader remains an active TypeScript project ([P2P Media Loader releases](https://github.com/Novage/p2p-media-loader/releases)). Bun’s compatibility reference does not document a native `RTCPeerConnection`, so a server runtime needs another WebRTC implementation or browser process ([Bun Node.js compatibility](https://bun.sh/docs/runtime/nodejs-compat)). | Medium. It needs browser control as well as local process counters. | Useful later for non-Invar welcome clients. |
| 4 | Global transfer-credit network | Potentially high only if its authority is decentralized. | No cited system here proves Sybil-resistant global credit without a trust or resource assumption. | Very high. Identity, consensus, accounting, recovery, and abuse handling dominate transport. | Poor for the first three-process proof. | Reject for the first rung. |
| 5 | Pure full mesh or absolute serverless swarm | Low in practice because signaling, NAT relay, and cold start remain. | Full mesh is bounded by per-node degree; no cited million-viewer proof. | Superficially low, then high under churn and NAT. | Easy to demo and easy to misread. | Reject. |

The first compatibility task must test a concrete js-libp2p transport matrix in
the current Bun runtime. Official js-libp2p documentation describes the
available modules. It does not prove that every Node transport works under Bun.
Do not select dependencies from documentation alone.

### Phase 0 — user decisions

Do no implementation until the user answers the ranked questions below. Record
the accepted invariant language and the trust model.

### Phase 1 — three-process instrument

Build only after approval. Use a deterministic finite stream fixture. Do not
use licensed media.

Processes:

- `publisher`: owns the manifest and complete encoded windows;
- `redistributor`: downloads, verifies, and serves under a fixed offer;
- `viewer`: starts after the redistributor has verified at least one window.

Measure per process and per window:

- useful authenticated bytes sent and received by peer;
- origin bytes;
- repair and duplicate bytes;
- rejected bytes;
- active offer and the reason for each cap change;
- playback-deadline misses;
- direct and relayed byte counts.

The positive proof is:

1. the viewer reconstructs the exact deterministic stream hash;
2. the redistributor sends useful verified bytes to the viewer;
3. viewer bytes from the redistributor exceed viewer bytes from the publisher;
4. total bytes reconcile with useful, repair, duplicate, and rejected counters;
5. lowering the redistributor cap changes measured flow without delaying an
   unrelated foreground probe.

Every assertion needs a positive control:

- disable redistribution and show the byte-origin assertion fails;
- corrupt one fragment and show A rejects it before credit or forwarding;
- set the redistributor offer to zero and show its egress becomes zero;
- cut the direct path and show the relay counter rises;
- remove publisher fallback before a missing window and show best-effort
  delivery fails instead of exceeding caps.

Use conditions, not fixed sleeps. Wait for verified-window counts, byte counts,
or explicit state transitions. Scale fixtures must cover a small stream and a
large bounded stream without committing large files.

### Phase 2 — protected local envelope

Add automatic, preset, and manual ceilings. Measure bandwidth, event-loop
delay, CPU, memory, battery when available, and foreground reservation.
Demonstrate immediate backoff. Do not pick a universal default from the local
fixture.

### Phase 3 — discovery and path replacement

Replace the explicit fixture address with at least two discovery paths. Add
direct and relay transport. Demonstrate that any one discovery or relay process
can depart after peers learn replacements. Report the measured direct-path
rate. Do not claim the Internet-wide percentages from a local harness.

### Phase 4 — secure coded windows

Add authenticated encryption first. Then compare fixed Reed–Solomon repair with
a fountain or sliding-window code. Measure repair ratio, decode latency, CPU,
memory, and wasted late bytes under scripted churn. Keep the simpler scheme
unless coding materially improves the measured window fingerprint.

### Phase 5 — browser welcome path

Add a browser or non-Invar consumer only after contributor priority works.
Measure the altruistic pool, first-contribution transition, and leecher-first
degradation. Do not accept a client-declared identity as proof.

### Out of scope

- product code in this research task;
- a global token, currency, or durable credit ledger;
- content moderation policy;
- legal advice or a promise of relay deniability;
- DRM or private-stream group-key design;
- codec, audio clock, or frame-buffer changes;
- a claim of million-viewer capacity without a load model and deployment
  evidence;
- a claim of absolute serverlessness;
- a default transfer ratio before measurements;
- support for illegal content as a product goal.

### Ranked questions for the user

1. Is **authenticated stream membership** accepted as the fifth invariant?
2. Is the intended independence target “no fixed host after replication,” while
   allowing publisher keys, bootstrap addresses, and replaceable relays?
3. May “consumption implies contribution” mean “eligible consumers offer
   measured slack,” with zero-cap and non-Invar exceptions?
4. Should contributors receive priority rather than a promise when aggregate
   capacity is insufficient?
5. Should the first rung stay local and hybrid: three processes, explicit
   bootstrap, and publisher fallback?
6. Is a small per-node altruistic fraction the preferred welcome path, or
   should dedicated donor nodes fund non-Invar consumers?
7. Is public content the first authorization model, so private group-key design
   stays deferred?
8. If the local proof succeeds, is browser playback the next priority, or are
   Invar-to-Invar pane and artifact transfers more important?

## Final recommendation

Keep the research lane parked until the user answers questions 1–5.

If approved, specify an authenticated chunk-exchange seam and build only the
three-process instrument. Use a hybrid origin fallback. Measure useful byte
flow and local backoff. Treat js-libp2p as a candidate, not a selected
dependency, until Bun compatibility is proved.

The durable signal is not “one machine feeds millions.” It is this smaller
property:

> Every eligible node can offer verified useful capacity without surrendering
> its protected local floor, and every replaceable role can migrate.

That property is physically possible, testable, and useful for media, projected
panes, artifacts, and other authenticated content.
