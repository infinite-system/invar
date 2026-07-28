# Invar — a terminal code editor

Desktop-editor ergonomics, in the terminal. Invar is a fast, mouse- and keyboard-driven
code workspace that runs entirely in your terminal — a file tree, a real text editor with
word wrap and wide/emoji-aware columns, fuzzy go-to-file, find & replace, a git panel with
side-by-side diffs and staging, a command palette, settings, and tabs. Built on
**[Bun](https://bun.com) + [ivue](https://www.npmjs.com/package/ivue) + [OpenTUI](https://github.com/sst/opentui) + Tree-sitter + git**.

The design goal: a newcomer can learn it in ~15 minutes — every action has a visible,
clickable affordance, and no capability requires a memorized motion.

> **Why "Invar"?** [Invar](https://en.wikipedia.org/wiki/Invar) is the iron–nickel alloy
> discovered by Charles Édouard Guillaume in 1896 — named from *invariable*, because its
> thermal expansion is near zero. Precision clocks and measuring instruments were built
> from it for one reason: **it does not drift**. This editor is built the same way — every
> module carries an explicit invariants contract, and a merge gate keeps the structure
> from drifting, no matter how much heat the codebase takes. (Guillaume got the 1920
> Nobel Prize in Physics for the alloy. We just got an editor.)
>
> And the binary is **`iv`** — which is `vi`, reversed. On purpose. Same terminal,
> opposite philosophy: nothing to memorize, everything visible.

## Install

The only hard requirement is **[Bun](https://bun.com) ≥ 1.3.14** — it is the runtime, bundler,
test runner, and package manager. Node/npm are not needed.

**One command (macOS & Linux)** — installs Bun if missing, installs dependencies, and optionally
sets up `ripgrep` (find-in-files):

```bash
bash scripts/install.sh          # add --build to also compile the standalone binary
```

The script is idempotent — re-run it any time. If you just cloned and hit *"missing packages"* or
*"command not found: bun"*, this is the fix.

**Or do it by hand** if you already have Bun:

```bash
bun install                      # populate node_modules
```

## Quickstart

```bash
bun run start          # open the current directory as the workspace
bun run dev <dir>      # open a specific directory
```

Quit with `Ctrl+Q` or `F10`. Command palette is `F1`; fuzzy go-to-file is `Ctrl+P`.
Full run/build/test instructions live in [`project.build.md`](./project.build.md).

Build a standalone binary:

```bash
bun run build          # → dist/iv  (self-contained executable)
./dist/iv .
```

> **Platforms:** macOS (Apple Silicon & Intel) and Linux are supported. `ripgrep` (`rg`) is
> optional — it powers find-in-files, and the editor degrades gracefully without it.

### Troubleshooting

- **`command not found: bun`** — Bun isn't on your `PATH`. Run `bash scripts/install.sh`, or add
  `export PATH="$HOME/.bun/bin:$PATH"` to your shell profile.
- **Missing packages / module-not-found on start** — you haven't installed dependencies yet:
  run `bun install` (or `bash scripts/install.sh`) from the repo root.
- **Find-in-files does nothing** — install `ripgrep` (`brew install ripgrep`, `apt install ripgrep`,
  …) or re-run `bash scripts/install.sh` and accept the ripgrep step.

## Built with Invariant-Based Reasoning (IBR)

This editor is also a demonstration of **IBR** — a method that reduces a problem to the
irreducible structures that actually exist in its domain, then generates from them. Every
module carries a colocated `*.invariants.md` contract; a hard **merge gate** verifies those
invariants by *driving the real user path* (injecting input, reading the rendered
framebuffer) rather than trusting internal values — and blocks any commit that regresses
them. Capabilities live behind a replaceable `Static()` seam, enforced by an AST gate, so
the whole system stays extensible.

The framework itself is here, free to use and build on:

- [`.claude/skills/ibr/IBR.md`](./.claude/skills/ibr/IBR.md) — the IBR framework
- [`.claude/skills/invariants/`](./.claude/skills/invariants/) — the `/invariants` skill (contract schema + checker)

## License

MIT — see [`LICENSE`](./LICENSE). Use it, learn from it, build on it.
