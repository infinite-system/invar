# 327 — RESEARCH: Invarnet p2p streaming underlay — one machine feeds millions (map, no implementation)

State: active
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
3. **Server independence**: what remains centralized in each prior-art
   system (trackers, signaling, TURN, certificate roots) and the
   decentralized alternatives (DHT, rendezvous over existing relays,
   mDNS local, gossip). Be honest about NAT traversal reality:
   percentage of peers reachable p2p, relay fallback cost.
4. **Fit with Invar's seams**: the north-star ladder already recorded
   (presence → ledger sync → projected panes → fleet mesh); prefer
   location-independent seams. Where does a transfer-allocation
   underlay slot in — transport layer under projected panes and video
   (#324/#325 lanes)? What is the smallest honest first rung (e.g. two
   Invar instances exchanging a stream over the underlay)?
5. **Recommendation + phasing**: ranked approaches by (i) server
   independence achieved, (ii) realistic scale, (iii) implementation
   cost in our stack (Bun/TypeScript — what libraries exist: cite),
   (iv) testability in the harness (how do you ASSERT redistribution
   happened — a 3-instance local fixture with measured byte flows is
   the acceptance instrument — design it). Explicit out-of-scope
   boundary + ranked open questions for the user.

## Acceptance

Map committed (record-only, SKIP_GATE correct with written verdict);
READY report summarises the recommendation and the user-facing
questions. The user reviews before any implementation task exists.
