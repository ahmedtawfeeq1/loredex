#!/usr/bin/env bash
# Stop hook: route new findings into the loredex vault.
# Must never block Claude Code — always exits 0, fast-exits for unregistered projects.
set -u

dir="${CLAUDE_PROJECT_DIR:-$PWD}"
cfg="${LOREDEX_CONFIG_DIR:-$HOME/.config/loredex}/config.json"

[ -f "$cfg" ] || exit 0
# registered projects are stored as absolute-path keys in config.json
grep -qF "\"$dir\"" "$cfg" 2>/dev/null || exit 0
command -v npx >/dev/null 2>&1 || exit 0

# --strict: only files with complete frontmatter (agents following the skill
# conventions produce those); no LLM calls from inside a hook.
npx -y loredex route --from "$dir" --strict --quiet >/dev/null 2>&1 || true
exit 0
