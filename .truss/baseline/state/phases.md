---
current: discover
---

> Source of truth for phase definitions. `truss render` reads this file and writes the phase block in AGENTS.md.
> `current:` is the only line a human changes here. All other edits are agent-assisted.
> Phase changes are human-only — see AGENTS.md §4 (phase exit procedure).

## discover

label: Discovery
purpose: explore the idea, collect raw research, map the problem space.
behavior: divergent — generate options, defer judgment, no premature convergence.
allowed: domain notes, research, open questions, sketches, VISION.md sections.
forbidden: code in repo/, final decisions without D-entry, spec documents, architecture diagrams.
forbidden-globs: repo/**
read: state/profile.md
exit: section: VISION.md#Problem; glob: context/research*.md; pursue/park leaning noted (human)
prompts: discover-kickoff, phase-recap

## validate

label: Validation
purpose: test key assumptions with external evidence before committing to a direction.
behavior: empirical — seek disconfirming evidence; a failed assumption is a success.
allowed: user interviews, competitor analysis, prototype sketches, assumption logs, survey notes.
forbidden: code in repo/, architectural decisions without validation evidence, locking the tech stack.
forbidden-globs: repo/**
read: state/profile.md, VISION.md
exit: glob: context/assumptions*.md; section: VISION.md#Principles; pursue/kill/pivot decision recorded as D-entry (human)
prompts: validate-kickoff, phase-recap

## plan

label: Planning
purpose: design the solution — architecture, spec, final decisions — before building.
behavior: convergent — reduce options to one path; every open question gets a D-NNN answer.
allowed: architecture diagrams, specs, technical decisions (D-NNN), task breakdown, repo/ scaffold.
forbidden: production feature code in repo/, skipping D-NNN for major technical choices, premature optimization.
read: state/profile.md, VISION.md, state/decisions.md
exit: glob: context/architecture*.md; no blocking open decisions (human); task breakdown in state/current.md or pm/ (human)
prompts: plan-kickoff, phase-recap

## build

label: Build
purpose: implement, iterate, and ship — the plan is the guide, not the cage.
behavior: pragmatic — ship working software; flag plan deviations as new D-NNN; keep state/current.md accurate.
allowed: all development and iteration work; revisiting plan decisions with D-NNN update; refactoring.
forbidden: silent deviations from plan (must D-NNN); skipping session ritual; accumulating unbounded state/current.md next list (≤5).
read: state/profile.md, state/decisions.md, state/current.md
exit: all launch criteria met (human); doctor clean (human); human sign-off (human)
prompts: build-kickoff, phase-recap
