# 326 — vendor modularity: vendors/<vendor>/<module> third-party plugin architecture

State: active
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> Another task -> vendor modularity you knows how we have modules,
> maybe beside we have vendors and in vendors we have different
> namespace ppl can make alphanumeric (should we allow - or _ ?) or
> should we even allow numbers? so vendors/<vendor>/playstation <-
> vendored module everyone can install, <vendor> is globally unique,
> so module is globally unique, any one can install, it should fit in
> the seams of the current system but be recognized as 3rd party
> plugin, can design the whole architecture based on our system + this
> concept, agent should explore -> same agent should do it if we
> approve the plan

## Stage 1 — EXPLORE + DESIGN (this dispatch; no product code)

Deliverable: an architecture plan (project-vendor-modularity-plan.md in
this task folder) grounded in the ACTUAL current system:

1. **Current module census**: how src/modules/* register, what the
   plugin manifest/Extensions surface knows (#312 just proved the
   removable-plugin pattern with Vue — the reference third-party-shaped
   citizen), the ivue Static-manifest conventions, the invariant-record
   lattice per module.
2. **Namespace design**: vendors/<vendor>/<module>; vendor GLOBALLY
   UNIQUE so module identity is <vendor>/<module>. ANSWER the user's
   naming questions with reasoned recommendations + prior art cited
   (npm scopes, Java reverse-DNS, crates, VSCode publisher IDs):
   alphanumeric? allow '-' or '_'? allow digits? leading character
   rules? case? length? Reserve rules (no 'invar', no core module
   collisions)? Global uniqueness MECHANISM: what makes a vendor unique
   without a registry today (recommendation may be phased: convention
   -> registry later; tie to the Invar-internet north star in the
   briefing).
3. **Third-party recognition**: vendored modules load through the SAME
   seams as first-party (plugin lifecycle, per-workspace providers,
   syntax sources, panel content, settings contributions) but are
   RECOGNIZED as third-party: provenance surfaced in Extensions, and
   the module identity carries the vendor everywhere (settings keys,
   status, records).
4. **Install story**: where installed vendored modules live on disk,
   what 'anyone can install' means mechanically (directory drop-in
   first? command? marketplace later — boundary it), versioning field,
   removal = clean core (the #312 polarity as a LAW for all vendored
   modules).
5. **Trust boundary**: what a vendored module can and cannot touch —
   name the enforcement seams available today and what is honor-system
   (be honest; sandboxing is likely out-of-scope phase 1 — record it).
6. **Invariants**: what record a vendored module must ship (its own
   <module>.invariants.md?) and how the checker treats vendor trees.
7. **Phasing** with acceptance drives per phase + explicit boundary.

Ranked open questions for the user close the plan.

## Stage 2 — IMPLEMENT (SAME AGENT, after user approval)

The user approves/amends the plan, then THE SAME BUILDER SESSION
implements phase 1. CONDUCTOR NOTE: do NOT land/close this lane at
stage-1 READY — the plan goes to the user while the session stays
alive; steer the approval (or amendments) back into the same session.
