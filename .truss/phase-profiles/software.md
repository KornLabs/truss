---
current: discover
profile: software
---

> Source of truth for phase definitions. `truss render` reads this file and writes the phase block in AGENTS.md.
> `current:` is the only line a human changes here; advancing it (a phase change) is human-only — see AGENTS.md §4 (phase exit procedure).
> The definitions below are the project's phase plan — drafted at kickoff from this seed, agent-maintained: restructure with a D-NNN + tell the human + `truss render`; hard limits in AGENTS.md §5.
>
> This is a phase profile, not the active phase list. To adopt it, a human copies it
> to `state/phases.md` (set `current:` as needed) and runs `truss render`. See
> `.truss/phase-profiles/README.md`.

## discover

label: Discovery
purpose: explore the idea, collect raw research, map the problem and the technical landscape.
behavior: divergent — generate options, defer judgment, no premature convergence.
allowed: domain notes, research, prior-art and tech survey, open questions, sketches, VISION.md sections.
forbidden: production code in repo/, locking the tech stack, final architecture, spec documents.
forbidden-globs: repo/**
read: state/profile.md
exit: section: VISION.md#Problem; glob: context/research*.md; pursue/park leaning noted (human)
prompts: discover-kickoff, phase-recap

## validate

label: Validation
purpose: test the riskiest product and technical assumptions before committing to a build.
behavior: empirical — seek disconfirming evidence; a failed assumption is a success.
allowed: user interviews, competitor analysis, throwaway spikes, assumption logs, feasibility notes.
forbidden: production code in repo/, architectural lock-in without evidence, growing a spike into the product.
forbidden-globs: repo/**
read: state/profile.md, VISION.md
exit: glob: context/assumptions*.md; section: VISION.md#Principles; pursue/kill/pivot decision recorded as D-entry (human)
prompts: validate-kickoff, phase-recap

## plan

label: Planning
purpose: design the solution — architecture, spec, final decisions — and set up delivery tracking.
behavior: convergent — reduce options to one path; every open question gets a D-NNN answer.
allowed: architecture docs, specs, technical decisions (D-NNN), task breakdown, pm/ setup, repo/ scaffold.
forbidden: production feature code beyond a walking skeleton, skipping D-NNN for major choices, premature optimization.
read: state/profile.md, VISION.md, state/decisions.md
exit: glob: context/architecture*.md; no blocking open decisions (human); task breakdown in state/current.md or pm/ (human)
prompts: plan-kickoff, phase-recap

## build

label: Build
purpose: implement, test, iterate, and ship — the plan is the guide, not the cage.
behavior: pragmatic — ship working software; flag plan deviations as new D-NNN; keep state/current.md accurate.
allowed: all development and iteration work; tests; refactoring; revisiting plan decisions with a D-NNN update.
forbidden: silent deviations from plan (must D-NNN); merging without tests; unbounded state/current.md next list (over 5).
read: state/profile.md, state/decisions.md, state/current.md
exit: all launch criteria met (human); tests green (human); doctor clean (human); human sign-off (human)
prompts: build-kickoff, phase-recap

## operate

label: Operate
purpose: run the shipped system — monitor, fix, and iterate in production.
behavior: steady — small reversible changes; protect reliability; record incidents and decisions.
allowed: bug fixes, monitoring and alerting, performance work, incremental features with a D-NNN, runbooks.
forbidden: large rewrites without a D-entry; unreviewed production changes; skipping the session ritual.
read: state/profile.md, state/decisions.md, state/current.md
exit: ongoing-run criteria met (human); doctor clean (human); human sign-off (human)
prompts: operate-kickoff, operate-recap
