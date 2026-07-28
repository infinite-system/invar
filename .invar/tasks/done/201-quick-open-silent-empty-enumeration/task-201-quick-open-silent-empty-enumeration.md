# 201 — Quick Open silently finds NO files in a folder that is not a git repo

State: DONE — fb199cb
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**The user's own 500k workspace is one such folder** — so this was reachable by the person who reported
the slowness, in the same session, on the same directory.

### How it was concealed for four sightings

**A builder's environment is not the conductor's.** Codex bundles its own ripgrep, which its spawned app
inherits; the conductor's shell has `rg` only as a shell FUNCTION no child inherits. So every
codex-driven run took the ripgrep path and never exercised the fallback — **codex's extra tooling was
concealing a real user-facing defect.** (That is #194's finding; this is what it was hiding.)

### The actual defect — not "no results", but a failure that cannot say so

Quick Open returned `return []` on enumeration failure. **`return []` is indistinguishable from "no
matches."** The overlay had no way to render a FAILED enumeration differently from a successful empty
one, so a broken search and an empty directory looked identical to the user.

### The fix

- **A three-tier fallback**: ripgrep → git → a **breadth-first directory walk bounded to 2,000 inspected
  entries**, skipping `.git` and surviving a throwing entry.
- **Publishes `idle` / `loading` / `complete` / `degraded` / `failed`** with a message, and the overlay
  renders a failed enumeration **differently** from a successful empty result.

### The contract left behind

> **File enumeration failures stay visible.**

## Sources

None in this folder — no brief was written. Detail above recovered from the session transcript
(`faf7e858-…jsonl`).
