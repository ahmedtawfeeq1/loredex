---
name: loredex-adopt
description: Scan this project for existing research/findings markdown and file it into the loredex vault. Use when the user says "adopt this project", "organize my research", "file my existing markdown into the vault", or wants a messy docs/ folder cleaned up.
---

# /loredex-adopt

1. Run `npx -y loredex@latest adopt --dry-run` (pass a path argument if the user names a
   directory other than the current one).
2. Show the user the printed plan — source file → vault destination for each candidate —
   before writing anything.
3. Ask for confirmation, then run `npx -y loredex@latest adopt -y`. Add `--move` only if the
   user explicitly wants originals relocated instead of copied (default keeps originals in
   place, stamped `loredex: routed` so they're never re-adopted).
4. No loredex config yet? `adopt` creates one automatically with vault defaults — you don't
   need `/loredex-init` first unless they want a non-default vault path or editor.
5. After adopting, suggest `/loredex-curate` to get a Start-Here brief of what just got
   filed.
