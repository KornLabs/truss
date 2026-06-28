---
key: branch-guard
value: strict
---

only when a `repo/` overlay exists: at session start confirm its checked-out branch (`truss status`, or `git -C repo symbolic-ref --short HEAD`); if `state/current.md` declares a `branch:` that differs from the checked-out one — STOP, tell the human, recommend switching (`git -C repo switch <declared>`), and do not edit code or docs until resolved; additionally, if no `branch:` is declared while a `repo/` checkout exists — STOP and ask the human to declare the active branch in current.md before working; keep current.md `branch:` in sync with the branch you work on
