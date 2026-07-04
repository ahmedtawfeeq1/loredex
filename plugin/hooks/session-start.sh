#!/usr/bin/env bash
# SessionStart hook: pull the vault remote and surface open handoffs addressed to this
# project. Stdout is injected into the session's context, so the agent starts work already
# knowing what other teams shipped — no skill invocation required.
# Must never block Claude Code — always exits 0, fast-exits for unregistered projects.
set -u

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cfg="${LOREDEX_CONFIG_DIR:-$HOME/.config/loredex}/config.json"

[ -f "$cfg" ] || exit 0
# registered projects are stored as absolute-path keys in config.json
grep -qF "\"$dir\"" "$cfg" 2>/dev/null || exit 0
command -v npx >/dev/null 2>&1 || exit 0

cd "$dir" || exit 0
# --quiet: prints nothing when no handoffs are open, so sessions without pending
# cross-team work get zero context noise
npx -y loredex handoffs --quiet 2>/dev/null || true
exit 0
