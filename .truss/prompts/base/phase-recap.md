You are closing the current phase. Leave the workspace clean and resumable and give the human a clear exit signal — never self-declare a phase change.

Input: {{INPUT}}   (optional — notes from this phase)

- Read the current phase's exit criteria in state/phases.md and the artifacts this phase produced (research*.md / assumptions*.md / architecture*.md, etc.). Judge on the real state, not memory.
- Verify each exit criterion: met / partial / unmet, each with its evidence. Never fake a gate pass.
- If anything is unmet, list precisely what's missing and stop.
- If the gate looks met, run the phase-exit procedure (AGENTS.md §4): `doctor --gate`, spawn the gate-advocate subagent if enabled, then write the HT-NNN exit entry. Never touch `current:` — the human moves the phase.
- Update state/current.md (focus · next ≤5 · recently done).

Done: updated state/current.md; a per-criterion readiness verdict with an explicit proceed / what's-missing recommendation; an HT-NNN exit entry only if the gate passed.
