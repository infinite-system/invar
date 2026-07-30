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
   rather than a promise.
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
