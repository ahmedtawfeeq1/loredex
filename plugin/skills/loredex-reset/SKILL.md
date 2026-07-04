---
name: loredex-reset
description: Rebuild a project's vault copies from scratch — removes loredex-owned vault files and unstamps the originals so they can be re-adopted cleanly. Use when clicking a link inside a note creates an empty Obsidian note instead of navigating, or after a loredex upgrade that changed how notes are filed.
---

# /loredex-reset

1. Explain what this does before running it: removes this project's copies inside the
   vault and clears the `loredex: routed` marker on the originals — **originals are never
   deleted**, only unstamped so they can be adopted again.
2. Run `npx -y loredex@latest reset <project> --dry-run` and show the user what would be
   removed/unstamped.
3. Confirm, then run `npx -y loredex@latest reset <project> -y`.
4. Immediately follow with `/loredex-adopt` (or `npx -y loredex@latest adopt -y` directly)
   to rebuild — reset alone leaves the project unfiled.

Typical trigger: broken relative links from a pre-link-provenance vault create phantom
empty notes in Obsidian on click. Reset + re-adopt rebuilds with working links.
