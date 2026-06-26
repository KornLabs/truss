---
key: post-task-check
value: subagent
---

after each task: spawn subagent → run `node .truss/bin/truss.mjs doctor` → fix ALL findings (not first-fail) → report summary
