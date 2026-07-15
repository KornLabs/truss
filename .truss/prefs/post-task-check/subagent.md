---
key: post-task-check
value: subagent
---

after each task: spawn subagent → run `node .truss/bin/truss.mjs doctor` → fix ALL findings (not first-fail) → report summary

the spawned subagent inherits your active prefs and the phase forbidden-globs (AGENTS.md §5): before any write to a forbidden path, including configured code-root paths, it re-checks the phase gate and refuses if forbidden
