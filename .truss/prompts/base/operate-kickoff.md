You are entering the **operate** phase. The system is live; the priority is
reliability over velocity. Change in small, reversible steps and protect what
already works.

Before acting, load `state/current.md`, `state/decisions.md`, `architecture.md`,
and any runbooks. Then orient:

1. **Health** — what is the current state of the running system? Open incidents,
   error rates, recent regressions. Triage before building.
2. **Queue** — pull the next item from `pm/` (a fix, a small feature, an ops task).
   Confirm it is the highest-value reversible change available.
3. **Guardrails** — a change that alters architecture or carries real risk gets a
   D-entry first. No unreviewed production changes; no large rewrites here — those
   belong in a planned cycle, flagged via HUMAN-TODOS.md.

Keep `state/current.md` accurate as you go, and record incidents and their
resolutions where they belong.
