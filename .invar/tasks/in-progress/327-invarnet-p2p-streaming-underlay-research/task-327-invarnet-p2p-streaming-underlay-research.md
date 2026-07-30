# 327 — RESEARCH: Invarnet p2p streaming underlay — one machine feeds millions (map, no implementation)

State: IN-PROGRESS
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> idea, how to make 1 Invarnet machine be able to feed millions of
> machines with streaming video for example, can redistributed capped
> p2p underlay be possible to make this server independent? Just
> require ppl to have transfer allocation for Invar? hmm, another
> Indranet Invarnet exploration

> Maybe agent shoud do

Addition (verbatim, 2026-07-29, GOVERNS equally):

> add to the p2p task, redistribution has to be such that no node feels
> understrain yet hyper deployability becomes possible not only for
> video but for any content, somehow every viewer helps the viewing,
> while caping their sharing in ratio with their capability so that
> they can continue performing other tasks, should be smartly
> automatically calculated or allowed to hand controlled or pre-set to
> a correct ratio cadence dependent on specific critical network
> properties, Invar should make every node invariable.

Second addition (verbatim, 2026-07-29, GOVERNS equally):

> Also, leeching to an extent from non Invar instances that do not
> contribute back should be possible but capped and limited, to
> preserve the network.

("to an extent" — the user's own correction of his "to an extend".)

Third addition (verbatim, 2026-07-29, GOVERNS equally):

> what if sharing is so interleaved sharing stream extracted separately
> is nonsense, cannot be decoded, but can be delivered still, make data
> interleaving secure by construction

Naming context (same session): the user named the north star
"Indranet Invarnet" — Indra's net; the prior verbatim north star is
"imagine we create our own internet between Invar instances"
(project.briefing.md).

## Scope — RESEARCH ONLY, #311/#325-style map; zero product code

Deliverable: a written map (project-invarnet-p2p-underlay-map.md in
this task folder) covering, with citations for every ecosystem claim:

1. **The fan-out problem**: 1 origin → millions of viewers for live and
   on-demand video. Prior art with real deployment numbers: BitTorrent
   (rarest-first, tit-for-tat), WebTorrent, PeerTube's P2P playback,
   IPFS/libp2p gossipsub + bitswap, WebRTC mesh/SFU/tree topologies,
   Peer5/CDNBye-style hybrid P2P-CDN, live-streaming trees (SplitStream,
   PPSPP/RFC 7574). What actually scaled and what collapsed, and why.
2. **Capped redistribution**: the user's core mechanism — each Invar
   instance carries a TRANSFER ALLOCATION (upload cap it owes/lends the
   net). Design space: strict reciprocity vs credit/allocation pools vs
   altruistic caps; incentive failure modes (leeching, sybil,
   free-riding); how a cap becomes an enforceable local invariant
   rather than a promise. Per the user's addition, the cap contract is:
   (a) NO NODE FEELS STRAIN — sharing is bounded in ratio to the node's
   capability so it keeps performing its other tasks (measure: what
   does the node sense — bandwidth, CPU, battery, foreground load —
   and how do existing systems back off, cite); (b) every viewer helps
   the viewing (consumption implies contribution, within the cap);
   (c) the ratio/cadence is smartly AUTO-calculated by default, but
   hand-controllable and pre-settable, keyed to the specific critical
   network properties that matter (identify which properties are
   actually critical — churn, upstream asymmetry, swarm size, piece
   rarity — cite measurements); (d) generality: the underlay carries
   ANY content, video is only the hardest case (latency-bounded);
   "hyper deployability" = adding a node adds capacity, never load
   beyond its cap. The user's closing invariant, verbatim: "Invar
   should make every node invariable" — read as: a node's own
   performance envelope is invariant under network participation; the
   map should treat that as the acceptance criterion for every
   candidate design. (e) NON-INVAR CONSUMERS: per the second addition,
   nodes that are not Invar instances and contribute nothing back may
   still consume — deliberately, as a welcome mat — but capped and
   limited so the network is preserved. Design questions the map must
   answer: how is a non-contributing consumer distinguished from a
   contributing peer without an identity authority (protocol handshake,
   allocation tokens, behavioral)? what budget does the swarm reserve
   for altruistic serving and WHO pays it (pro-rata from every node's
   cap, or dedicated donor slots — cf. BitTorrent optimistic unchoke as
   prior art for bounded altruism, cite)? what happens at saturation —
   graceful degradation for leechers first, contributors never; and how
   does a leecher's path to becoming a contributor look (install Invar,
   inherit an allocation)?
3. **Secure-by-construction interleaving** (third addition): fragments
   a relay carries are individually NONSENSE — deliverable but not
   decodable in isolation; only the assembling endpoint reconstructs.
   Survey the real constructions and their exact guarantees, cite each:
   erasure/fountain codes (Reed-Solomon, LT/Raptor — dispersal, not
   secrecy by themselves), threshold secret sharing (Shamir — true
   k-of-n secrecy, at bandwidth cost), random linear network coding
   (coded pieces useless below rank), all-or-nothing transforms (AONT —
   every fragment needed, near-zero overhead), and plain
   encrypt-then-stripe (where the key, not the interleaving, carries
   the secrecy — be honest about which property comes from where).
   For each: overhead, latency cost for streaming (can you decode a
   window before the whole object?), repair traffic under churn, and
   what "secure by construction" formally means for a relay node
   (privacy for the viewer, deniability for the relay — a relay that
   CANNOT decode what it forwards is also a relay that need not answer
   for it; note the legal-gray reality rather than hand-waving it).
   Interaction with arm 2: coded fragments make capability-ratio caps
   easier (any k fragments serve, no hot pieces) — say where coding
   dissolves the rarest-piece problem.

4. **Server independence**: what remains centralized in each prior-art
   system (trackers, signaling, TURN, certificate roots) and the
   decentralized alternatives (DHT, rendezvous over existing relays,
   mDNS local, gossip). Be honest about NAT traversal reality:
   percentage of peers reachable p2p, relay fallback cost.
5. **Fit with Invar's seams**: the north-star ladder already recorded
   (presence → ledger sync → projected panes → fleet mesh); prefer
   location-independent seams. Where does a transfer-allocation
   underlay slot in — transport layer under projected panes and video
   (#324/#325 lanes)? What is the smallest honest first rung (e.g. two
   Invar instances exchanging a stream over the underlay)?
6. **Recommendation + phasing**: ranked approaches by (i) server
   independence achieved, (ii) realistic scale, (iii) implementation
   cost in our stack (Bun/TypeScript — what libraries exist: cite),
   (iv) testability in the harness (how do you ASSERT redistribution
   happened — a 3-instance local fixture with measured byte flows is
   the acceptance instrument — design it). Explicit out-of-scope
   boundary + ranked open questions for the user.

## Calibration (user, verbatim, 2026-07-29 — GOVERNS priority + framing)

> why don't we IBR this thang, lol, but yeah this is just research, not
> even critical for Invar to succeed, we do not need to make ppl flock
> to Invar to share illegal content, this is not what it's about but if
> a simple invariant exist for our network have simple invariants that
> make network itself resilient and strong and does share some
> capability somehow that's the right signal and path to follow

Priority: NOT critical-path; research lane only. Content-sharing per se
is not the point — the SIGNAL is whether simple invariants exist.

## Conductor's IBR reduction (2026-07-29, session; the map tests this)

Candidate invariant set (four, with bounded leeching DERIVED not added):

1. ENVELOPE INVARIANCE — a node's own performance envelope is
   unchanged by participation; cap derived from measured slack, never
   promised. Generates: capability-ratio caps, auto-calc, backoff.
2. CONSUMPTION IMPLIES CONTRIBUTION — within the envelope. Generates:
   supply scales with demand (anti-fragile under load).
3. FRAGMENTS INERT IN ISOLATION — deliverable, not decodable.
   Generates: relay deniability, cache-anywhere, no hot pieces.
4. NO DISTINGUISHED NODE — every role playable by any node; survives
   any departure. Generates: server independence.

Derived boundary: non-contributors consume ONLY the surplus remaining
after 1+2 are honored (surplus-only altruism = the second addition).

Impossibility set: the network never DEMANDS (only accepts offered
slack); never PROMISES delivery (best-effort from aggregate surplus);
saturation degrades service, never nodes; no fragment incriminates its
relay. Self-similarity: invariant 1 is Invar's name-invariant at
network scale.

## Acceptance

Map committed (record-only, SKIP_GATE correct with written verdict);
READY report summarises the recommendation and the user-facing
questions. The user reviews before any implementation task exists.

The map's PRIMARY success criterion (per the calibration): test the
four-invariant reduction — does it GENERATE the whole design space the
arms survey, and does its impossibility set hold? For each prior-art
system in arm 1, name WHICH invariant it violates and show that the
violation is why it collapsed (or which invariant it proves where it
scaled). If the reduction fails — a fifth invariant is genuinely
needed, or one of the four is not load-bearing — say so explicitly;
breaking the candidate set is a valid and valuable outcome.
