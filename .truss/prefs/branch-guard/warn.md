---
key: branch-guard
value: warn
---

only when state/profile.md configures a code-root: at session start confirm its checked-out branch with `truss status`; if `state/current.md` declares a `branch:` that differs from the checked-out one — STOP, tell the human, recommend switching the configured code-root to the declared branch, and do not edit code or docs until resolved; if no `branch:` is declared, note the current branch and continue; keep current.md `branch:` in sync with the branch you work on
