---
key: git-flow
value: team
---

several people push to this repository from their own machines, everyone straight to `main` — no personal branches, no pull requests. Syncing is your job, never your human's: run `node .truss/bin/truss.mjs sync` at session start, after every commit, and before you report done; it pulls, rebases, regenerates generated files on a conflict and pushes. Commit only your own paths first (`git commit -- <paths>`), then sync. When `truss status` shows a `Sync:` line with unpushed commits, uncommitted paths or a paused rebase left by an earlier session, catch up on that before anything else. When sync stops on a conflict, resolve it yourself — keep both sides of an appended list, renumber an entry ID the other side already took, merge two edits of the same text when they do not contradict — then `git add` and sync again; ask your human only when the two sides genuinely contradict each other. `current:` in state/phases.md still changes only on your human's word
