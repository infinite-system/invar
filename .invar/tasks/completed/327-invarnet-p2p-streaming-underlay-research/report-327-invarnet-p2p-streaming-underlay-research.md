# READY — Invarnet peer-to-peer streaming underlay research

#327 (Invarnet peer-to-peer streaming underlay research) is complete.

The deliverable is the
[Invarnet peer-to-peer streaming underlay map](project-invarnet-p2p-underlay-map.md).
Commit `03f5b0ab5e5bc78f4de970cd39349d0c454ac321` contains the map. The worktree
is clean. I did not push, merge, or tag.

## Result

The four candidate invariants do not generate a safe underlay. They need a
fifth:

> Every accepted fragment proves membership in the authenticated stream.

The missing invariant generates stream identifiers, publisher authority,
fragment authentication, pollution rejection, and verified contribution
credit. The four original candidates cannot distinguish authentic ciphertext
from attacker-generated ciphertext.

Three original invariants remain load-bearing after refinement:

- Protect a local performance floor and offer only measured slack. A useful
  transfer cannot leave the whole machine envelope literally unchanged.
- Require eligible consumers to offer measured slack. Zero-cap, restrictive
  NAT, exhausted-battery, and non-Invar consumers are physical exceptions.
- Require every machine role to migrate after replication. Publisher keys,
  first sources, bootstrap facts, and temporary relays can still have
  distinguished roles.

Fragment confidentiality also remains useful. It does not generate integrity
or legal deniability. The proposed impossibility “no fragment incriminates its
relay” does not hold.

## Recommendation

Do not implement a global credit ledger or claim absolute server independence.

If the user accepts the refined invariants, start with a three-process local
instrument:

1. A publisher creates authenticated encrypted windows.
2. A redistributor receives and serves them within a measured local cap.
3. A viewer receives most useful bytes from the redistributor while the
   publisher provides a measured minority and fallback.

Use authenticated encrypt-then-stripe windows, short-window erasure repair,
recent verified contribution priority, and a small altruistic pool for
unproven consumers. Treat js-libp2p as a candidate until a bounded Bun
compatibility spike proves the required transports.

This rung proves redistribution and cap backoff. It does not prove Internet NAT
reachability, million-viewer scale, or server independence.

## Reduction verdict

The reduction **needs a fifth invariant**.

The revised set is:

1. protected local envelope;
2. eligible consumption contributes;
3. fragment confidentiality;
4. no fixed machine after replication;
5. authenticated stream membership.

The physical conservation rule remains decisive. Aggregate useful origin and
peer upload must cover aggregate stream demand plus overhead. Coding changes
which fragments peers need. It does not create bandwidth.

The map tests every named prior-art family against this set. No surveyed system
proves all five. BitTorrent and early live meshes prove demand-driven fan-out.
ByteDance provides the strongest cited production-scale result, but its tracker,
peer-server tier, and CDN fallback are central operational generators.

## Ranked user questions

1. Do you accept authenticated stream membership as the fifth invariant?
2. Is the independence target “no fixed host after replication,” while
   publisher keys, bootstrap addresses, and replaceable relays remain?
3. May “consumption implies contribution” mean that eligible consumers offer
   measured slack, with zero-cap and non-Invar exceptions?
4. Should contributors receive priority rather than a delivery promise when
   aggregate capacity is insufficient?
5. Should the first rung stay local and hybrid: three processes, explicit
   bootstrap, and publisher fallback?
6. Should each node fund a small altruistic fraction, or should dedicated donor
   nodes fund non-Invar consumers?
7. Should public content be the first authorization model?
8. After the local proof, should browser playback or Invar-to-Invar pane and
   artifact transfer come next?

## Invariants in scope

No repo code contract binds this research-only change. The candidate set in the
[task record](task-327-invarnet-p2p-streaming-underlay-research.md) and the
plain-prose rules in [AGENTS.md](../../../../AGENTS.md) govern the map.

The brief missed no existing repo invariant record. The candidate record itself
missed authenticated stream membership. The map names and derives that fifth
invariant. A future implementation would need a domain invariant record for the
authenticated chunk-exchange seam. This task does not create one.

## Verification

- `bun scripts/tasks/lint-task-links.ts <map>` passed.
- The STE flavored prose linter passed.
- The map contains 47 distinct external source links.
- `git diff --check` passed before the commit.
- The record-only commit used `SKIP_GATE=1`, as the
  [filed brief](brief-327-2-invarnet-p2p-streaming-underlay-research.md)
  directs. The pre-commit hook recorded the bypass.
- The final worktree status is clean.

No product code or dependency changed. I did not run the product gate because
the filed brief explicitly authorizes the record-only bypass.

## Bycatch

- **Convention drift:** [AGENTS.md](../../../../AGENTS.md) names
  `retired/<branch>` as the unlanded terminal tag.
  [Project conventions](../../../../project.conventions.md) names
  `orphaned/<branch>` for the same state. I reproduced the disagreement with a
  second read. I did not change either governing record.
- **Brief label drift:** the file
  [brief-327-2-invarnet-p2p-streaming-underlay-research.md](brief-327-2-invarnet-p2p-streaming-underlay-research.md)
  has the heading “Brief #327-1,” while its file name identifies it as brief
  327-2. I reproduced the mismatch with a second read. I did not change the
  brief.
