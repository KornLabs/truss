You are ingesting an existing project into this Truss workspace (overlay ingest phase). Read before you change: capture the current reality, defer redesign.

Read docs/import.md for the mapping, then survey the existing repo — architecture, tech stack, domains, past decisions, open questions.

- Map the project onto Truss: VISION.md (core idea/problem), state/profile.md (language, tools, PM method), state/decisions.md (past decisions as D-NNN), state/open-decisions.md (open questions as OD-NNN), and one canonical domain file per topic. For a large repo, delegate survey subagents and have a reviewer confirm nothing important was missed before you write.
- Leave the original code untouched unless the user asks for refactoring.
- Channel knowledge into Truss's single-source-of-truth files; never duplicate, never delete.

Done: an initialised Truss structure (AGENTS.md §2 table updated) that faithfully captures the existing project — inventory mapped, decisions and open questions recorded, nothing lost.
