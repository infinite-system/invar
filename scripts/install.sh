#!/usr/bin/env bash
# install.sh — one-shot setup for Invar on macOS and Linux.
#
# Absorbs the usual fresh-clone failures ("missing packages", "command not found: bun"):
#   1. installs Bun (the only hard requirement) if it is absent or older than the minimum
#   2. runs `bun install` to populate node_modules
#   3. offers to install ripgrep (`rg`) — powers find-in-files; the app degrades gracefully without it
#   4. optionally builds the standalone `dist/iv` binary (--build)
#
# Idempotent: safe to re-run. Requires only bash, curl, and a package manager the script can find.
#
# Usage:
#   bash scripts/install.sh            # install Bun + deps, prompt about ripgrep
#   bash scripts/install.sh --build    # also compile the standalone dist/iv binary
#   bash scripts/install.sh --yes      # non-interactive: assume "yes" (installs ripgrep too)
#   bash scripts/install.sh --no-rg    # skip the ripgrep step entirely
#   bash scripts/install.sh --help
set -euo pipefail

MIN_BUN_VERSION="1.3.14"

# ---- options -----------------------------------------------------------------
DO_BUILD=0
ASSUME_YES=0
SKIP_RG=0
for arg in "$@"; do
  case "$arg" in
    --build)  DO_BUILD=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --no-rg)  SKIP_RG=1 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown option: $arg (try --help)" >&2
      exit 2 ;;
  esac
done

# ---- pretty output (no color when not a TTY) ---------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; RED=''; DIM=''; RESET=''
fi
say()  { printf '%s\n' "${BOLD}==>${RESET} $*"; }
ok()   { printf '%s\n' "${GREEN}  ✓${RESET} $*"; }
warn() { printf '%s\n' "${YELLOW}  !${RESET} $*"; }
die()  { printf '%s\n' "${RED}  ✗${RESET} $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Return 0 if $1 >= $2 (dotted version compare via sort -V).
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# yes/no prompt honoring --yes; default answer is arg $2 (Y/n).
confirm() {
  local prompt="$1" default="${2:-Y}" reply
  if [ "$ASSUME_YES" = 1 ]; then return 0; fi
  if [ ! -t 0 ]; then  # non-interactive (piped/CI): skip optional steps unless --yes was passed,
    return 1           # so we never trigger a surprise sudo prompt in a headless run.
  fi
  read -r -p "    $prompt [$([ "$default" = Y ] && echo 'Y/n' || echo 'y/N')] " reply || reply=""
  reply="${reply:-$default}"
  case "$reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# ---- platform ----------------------------------------------------------------
OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *)      die "unsupported OS '$OS' — Invar supports macOS and Linux." ;;
esac
say "Setting up Invar on ${BOLD}${PLATFORM}${RESET} ${DIM}($(uname -m))${RESET}"

# ---- 1. Bun ------------------------------------------------------------------
ensure_bun_on_path() {
  # The official installer drops bun in ~/.bun/bin but does not touch the CURRENT shell's PATH.
  if ! have bun && [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  fi
}

ensure_bun_on_path
if have bun; then
  CURRENT_BUN="$(bun --version 2>/dev/null || echo 0)"
  if version_ge "$CURRENT_BUN" "$MIN_BUN_VERSION"; then
    ok "Bun $CURRENT_BUN (>= $MIN_BUN_VERSION)"
  else
    warn "Bun $CURRENT_BUN is older than the required $MIN_BUN_VERSION — upgrading."
    bun upgrade || die "bun upgrade failed. Update Bun manually: https://bun.sh"
    ensure_bun_on_path
    ok "Bun $(bun --version)"
  fi
else
  say "Bun not found — installing from https://bun.sh"
  have curl || die "curl is required to install Bun. Install curl, or install Bun manually from https://bun.sh"
  curl -fsSL https://bun.sh/install | bash || die "Bun install failed. See https://bun.sh"
  ensure_bun_on_path
  have bun || die "Bun installed but is not on PATH. Add ${BOLD}export PATH=\"\$HOME/.bun/bin:\$PATH\"${RESET} to your shell profile and re-run."
  ok "Bun $(bun --version) installed"
  warn "Add this to your shell profile (~/.zshrc or ~/.bashrc) so future shells find Bun:"
  printf '%s\n' "        export PATH=\"\$HOME/.bun/bin:\$PATH\""
fi

# ---- 2. dependencies ---------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
say "Installing dependencies (bun install)"
if [ -f bun.lock ]; then
  bun install --frozen-lockfile || bun install
else
  bun install
fi
ok "Dependencies installed into node_modules"

# ---- 3. ripgrep (optional) ---------------------------------------------------
install_ripgrep() {
  case "$PLATFORM" in
    macos)
      if have brew; then brew install ripgrep; else
        warn "Homebrew not found — install it from https://brew.sh, then: brew install ripgrep"; return 1; fi ;;
    linux)
      if   have apt-get; then sudo apt-get update && sudo apt-get install -y ripgrep
      elif have dnf;     then sudo dnf install -y ripgrep
      elif have pacman;  then sudo pacman -S --noconfirm ripgrep
      elif have zypper;  then sudo zypper install -y ripgrep
      elif have apk;     then sudo apk add ripgrep
      else warn "No known package manager — install ripgrep manually: https://github.com/BurntSushi/ripgrep#installation"; return 1; fi ;;
  esac
}
if [ "$SKIP_RG" = 1 ]; then
  :
elif have rg; then
  ok "ripgrep $(rg --version | head -n1 | awk '{print $2}') (find-in-files enabled)"
else
  warn "ripgrep (rg) not found — it powers find-in-files. The editor still runs without it."
  if confirm "Install ripgrep now?" Y; then
    install_ripgrep && ok "ripgrep installed" || warn "Skipped ripgrep — install it later if you want find-in-files."
  else
    warn "Skipped ripgrep."
  fi
fi

# ---- 4. build (optional) -----------------------------------------------------
if [ "$DO_BUILD" = 1 ]; then
  say "Building the standalone binary (bun run build)"
  bun run build
  ok "Built ${BOLD}dist/iv${RESET} — run it anywhere: ${BOLD}./dist/iv .${RESET}"
fi

# ---- done --------------------------------------------------------------------
echo
say "${GREEN}Invar is ready.${RESET}"
echo "    ${BOLD}bun run start${RESET}      open the current directory"
echo "    ${BOLD}bun run dev <dir>${RESET}  open a specific directory"
if [ "$DO_BUILD" != 1 ]; then
  echo "    ${BOLD}bun run build${RESET}      compile the standalone dist/iv binary"
fi
echo "    ${DIM}Quit the editor with Ctrl+Q or F10.${RESET}"
