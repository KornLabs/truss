---
key: branch-guard
value: warn
---

only when a `repo/` overlay exists: at session start confirm its checked-out branch (`truss status`, or `git -C repo symbolic-ref --short HEAD`); if `state/current.md` declares a `branch:` that differs from the checked-out one — STOP, tell the human, recommend switching (`git -C repo switch <declared>`), and do not edit code or docs until resolved; if no `branch:` is declared, note the current branch and continue; keep current.md `branch:` in sync with the branch you work on
