You are onboarding an existing project into this Truss workspace (overlay ingest phase). Before you survey the code, get the context the code cannot give you — then survey, then write. Done = VISION.md, state/profile.md and state/current.md hold the human's framing, and the current phase reflects reality.

The repo tells you *what* exists; only the human can tell you *why it exists, where it stands, and where it's going*. Ask these as a short conversation — one question at a time, accept "don't know / skip", never invent answers:

1. **Problem & vision** — what problem does this project exist to solve, for whom, and what does success look like? → VISION.md (#Problem, #Vision).
2. **Stand / Aussicht** — where is it right now (prototype, in production, paused?), and what's the near-term goal or the next milestone? → state/current.md (focus + next), and informs the phase.
3. **Role & working style** — your role on it, how decisions get made, language, PM method, tools not visible in the repo. → state/profile.md.
4. **Constraints & non-negotiables** — deadlines, stack locks, compliance, things that must not change. → state/profile.md / a domain note / OD-NNN.
5. **Open questions & stance** — the biggest unknowns right now, and (if early) a pursue / park / pivot leaning. → state/open-decisions.md (OD-NNN).
6. **Active branch** — if a `repo/` checkout is in place, which branch does this focus belong to? Set it as `branch:` in state/current.md so `truss status` / `branch-guard` can verify it. If unsure, read the checked-out branch and confirm it with the human.

Then recommend the phase: an overlay starts in **ingest** to import; once the system is mapped and summarised (the ingest exit), move to **operate** with `node .truss/bin/truss.mjs phase operate`. If the human's answers show the project is still pre-build (idea/validation), say so — the core four-phase or `founders-thinking` profile may fit better than the overlay (see .truss/phase-profiles/README.md).

Capture only what the human gives you into the single-source-of-truth files; do not duplicate, do not guess to fill gaps — log gaps as open questions. When the intake is done, hand off to the `repo-import` prompt for the code survey.
