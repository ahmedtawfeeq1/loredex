# Contributing to loredex

Thanks for helping! The bar for a first contribution is deliberately low.

## Setup

```bash
git clone https://github.com/OWNER/loredex
cd loredex
npm install
npm test          # vitest — should be green before you start
```

Useful scripts: `npm run lint` (Biome), `npm run typecheck`, `npm run build` (tsup),
`npm run dev` (rebuild on change). Node ≥ 20.

Try your build against a scratch project:

```bash
npm run build
mkdir -p /tmp/demo/docs && echo "# Findings" > /tmp/demo/docs/GAP-ANALYSIS.md
LOREDEX_CONFIG_DIR=/tmp/demo-config node dist/cli.js adopt /tmp/demo --dry-run --no-llm
```

`LOREDEX_CONFIG_DIR` keeps your real vault untouched while developing.

## Ground rules

- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) — releases and the
  changelog are generated from them by release-please.
- New behavior needs a test. Tests must not call LLMs or the network
  (`LOREDEX_CLASSIFIER=none` in the e2e shows how).
- Keep the dependency count where it is. If a few lines of stdlib can do it, prefer that.
- Read `docs/ARCHITECTURE.md` first — the design rules there (files are the API,
  deterministic before LLM, never destroy, idempotent) are the review criteria.

## PR flow

1. Fork, branch from `main`.
2. Make the change + test.
3. `npm run lint && npm run typecheck && npm test` locally.
4. Open the PR — CI runs the same checks on Node 20 and 22.

Bug reports and feature ideas: use the issue templates. Not sure about an approach?
Open an issue before writing code — cheaper for everyone.
