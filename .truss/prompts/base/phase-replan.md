You are restructuring the project's phase plan (state/phases.md) because project reality has diverged from it — new requirements, a pivot, a dropped scope, or a lifecycle the kickoff didn't foresee. The plan serves the project, not the other way around.

Input: {{INPUT}}   (what changed and why the current plan no longer fits)

Rules (AGENTS.md §5):
- Never touch `current:` — advancing the phase is human-only.
- Never loosen the CURRENT phase's `forbidden`/`forbidden-globs` or its `exit` criteria without explicit human confirmation — do not remove your own active guardrails.
- Past (already exited) phases stay untouched; they are history.

Method:
1. Read state/phases.md, VISION.md, state/current.md, and state/decisions.md. Name precisely where the plan and reality diverge.
2. Redesign the future phases: add, split, drop, reorder, or rewrite. Keep the plan linear and small (3–6 phases total); per phase keep `purpose`, `behavior`, and machine-checkable `exit` criteria concrete. `forbidden`/`forbidden-globs` stay honest — they are advisory guardrails with changed-path reporting, not decoration.
3. Check knock-on effects: exit criteria referencing files or sections that no longer exist, `prompts:` referencing missing prompt ids (RF-04), read lists, and anything in state/current.md `next:` that assumed the old plan.
4. Record a D-NNN: what changed in the plan, why, and what triggered it.
5. Run `truss render`, then `doctor`; fix findings.
6. Tell the human what changed in one compact paragraph — plan restructurings are never silent.

Done: state/phases.md matches project reality; D-NNN recorded; render + doctor clean; the human has been told what changed and why.
