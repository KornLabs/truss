# Prompts

Two kinds of prompts live here, distinguished only by `library.json` (no subfolders):

1. **Library prompts** (14) — user-facing, served by the dashboard.
2. **Engine-ritual prompts** (10) — invoked by the phase machine / gate; never in the manifest.

## Layout

| Path | What |
|---|---|
| `library.json` | The manifest — the index of library prompts. The dashboard serves **only** these (plus `custom/`). |
| `base/<id>.md` | English bodies. Pure body, no frontmatter. Holds both library and engine-ritual prompts. |
| `base-de/<id>.md` | German bodies. **Mirrors the manifest exactly** (the 14 library prompts). Engine-ritual prompts are EN-only. |
| `custom/<id>.md` | User-created prompts, single language, served as-is. Also holds `prefs/` overrides. |

`promptIds` (used by check **RF-04**) is scanned flat from `base/` + `custom/` only.

## Library prompts (the 14)

Three shelves plus one orchestration wrapper (see `library.json` for shelf/tags/flags):

- **task:** `plan` · `implement` · `bug-fix` · `refactor` · `research` · `critique` · `idea-spar` · `decide` · `stress-test` · `founder-move`
- **session:** `resume` · `handover`
- **setup:** `overlay-onboard` (adopts an existing project; also the overlay `ingest` ritual — see below)
- **orchestration:** `orchestrate` (generic wrapper; the Single|Orchestrated toggle wraps a task body as `{{MISSION}}` and injects its `orchestrationHint` as `{{HINT}}`)

### Authoring convention

Every library body opens with the **same input block** — the only tokens the user fills:

```
## Your input

- Task: {{INPUT}}
- Constraints: {{CONSTRAINTS}} (optional)
- Pointers: {{POINTERS}} (optional)
```

(`orchestrate` uses `{{MISSION}}`, `{{HINT}}`, `{{CONSTRAINTS}}`.)

Bodies are **lightweight**: a one-line mandate (role + definition of done), the **result requirements**
(the bar the output must clear, incl. Truss contracts like D-NNN), and one process line. The method is
left to the agent. House rules (load order, stop-on-blocker, no fabrication, subagent use) are **not**
repeated here — they live in `AGENTS.md` (§1, §3–§5, preferences), which every agent reads. Each prompt
carries only one orienting line: "read the relevant files first, starting with AGENTS.md."

## Engine-ritual prompts (the 10, EN-only, not in the manifest)

Precise about their protocol; they defer the generic rules to the AGENTS.md phase block.

| Prompt | Referenced by |
|---|---|
| `discover-kickoff`, `validate-kickoff`, `plan-kickoff`, `build-kickoff`, `phase-recap` | `state/phases.md` `prompts:` lines → validated by RF-04, rendered into the AGENTS.md phase block |
| `operate-kickoff`, `operate-recap` | `software` phase profile (`.truss/phase-profiles/software.md`) `prompts:` lines |
| `concept-kickoff`, `concept-recap` | `founders-thinking` phase profile (`.truss/phase-profiles/founders-thinking.md`) `prompts:` lines |
| `gate-advocate` | phase-exit procedure (AGENTS.md §4) + `checks/ph.mjs` PH-04 (names its path) + the `gate-advocate` preference |

Adding/removing a `prompts:` reference in any `phases.md` requires the matching `base/<id>.md` to exist,
or RF-04 warns. One library prompt is also phase-referenced: the overlay `ingest` phase
(`baseline/overlay/phases.md`, used by `truss init --overlay`) points at the setup-shelf
`overlay-onboard` — it onboards an existing project (intake → survey & dispositions → phase model).

## Custom prompts & presets

Custom prompts are written to `custom/` via `truss prompt save` (dashboard-driven, single language).
**Presets** (a library prompt with pre-filled input) are dashboard-local (localStorage), not files.

## Superseded prompts

Old/superseded bodies are not kept in a folder — git history is the archive.
