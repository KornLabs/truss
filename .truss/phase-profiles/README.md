# Phase profiles

A phase profile is a ready-made `state/phases.md` for a project type that needs a
different lifecycle than the core four phases. The core flow
(**discover → validate → plan → build**) ships in `.truss/baseline/state/phases.md`
and is what a fresh `truss init` installs. Profiles here are the alternatives.

All of them — core flow and profiles alike — are **seeds, not the plan**: the
project-kickoff tailors the installed phases to the project (rename, drop, split,
add), and agents keep maintaining the plan as requirements change (D-NNN + telling
the human; see AGENTS.md §5). Only advancing `current:` stays human-only.

| Profile | Phases | Use it when |
|---|---|---|
| `software.md` | discover → validate → plan → build → **operate** | The project ships and then runs in production: the extra `operate` phase covers monitoring, fixes, and incident-driven iteration after launch. |
| `founders-thinking.md` | discover → validate → **concept** | The goal is to think an idea through, not build it. The flow ends in a concept dossier and an honest **pursue/park** call instead of a build. |

The core four phases and the existing-project overlay (`ingest → operate`,
applied by `truss init --overlay`, in `.truss/baseline/overlay/phases.md`)
cover the remaining cases. A founding/startup project uses the core four phases —
it differs only in its domains (legal, brand, finance), which it creates on demand
under `context/`, not in a separate phase list.

## Adopting a profile

An agent may perform the switch (it's a phase-plan restructuring: D-NNN + telling
the human, AGENTS.md §5) — but setting `current:` stays human-only (§4). To switch
a workspace to a profile:

```bash
# 1. Copy the profile over the active phase list (review the diff first).
cp .truss/phase-profiles/software.md state/phases.md

# 2. Set `current:` to the phase you are actually in (the profile defaults to discover).
# 3. Re-render the AGENTS.md phase block from the new list.
node .truss/bin/truss.mjs render

# 4. Sanity-check.
node .truss/bin/truss.mjs doctor
```

The phase prompts these profiles reference (`operate-kickoff`, `operate-recap`,
`concept-kickoff`, `concept-recap`) already live in `.truss/prompts/base/`, so
`doctor` (RF-04) stays clean once the profile is active.

## One thing to know at adoption

The `founders-thinking` `concept` phase has a hard exit target,
`context/concept.md#Recommendation`. Until that file exists, `doctor` raises an
(expected) PH-06 warning — it clears the moment the concept phase creates
`context/concept.md` with a `#Recommendation` heading, which the `concept-kickoff`
prompt walks you through. The other profile exits use globs (e.g.
`context/architecture*.md`), so a not-yet-created domain file is simply not flagged
until the relevant phase. Domain files are created on demand during the work; no
upfront setup step is required.

