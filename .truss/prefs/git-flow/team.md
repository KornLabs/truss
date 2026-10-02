---
key: git-flow
value: team
---

several people push to this repository from their own machines. Before every push run `git pull --rebase`, then push to `main`. A change to `current:` in state/phases.md, to the preferences or phase definitions, to state/team.md, state/links.md or VISION.md goes on a branch `team/<your-login>/<topic>` with a pull request instead (`gh pr create --fill`); the `truss-merge` workflow merges it once doctor reports no error. On a rebase conflict: regenerate generated files (`truss render`, `truss map`) instead of merging them, keep both sides of an appended list, and renumber an entry ID the other side already took before you push; when the conflict is a disagreement between people, ask your human
